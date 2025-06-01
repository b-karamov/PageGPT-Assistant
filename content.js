// Listener на входящие сообщения из расширения
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let regex;

  // Функция для экранирования специальных символов в регулярном выражении
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Функция для создания выделения текста
  function createHighlight(range) {
    const wrapper = document.createElement('span');
    wrapper.className = 'gpt-highlight-wrapper';
    
    const content = document.createElement('span');
    content.className = 'gpt-highlight-content';
    
    range.surroundContents(wrapper);
    wrapper.appendChild(content);
    
    // Перемещаем содержимое wrapper внутрь content
    while (wrapper.firstChild !== content) {
      content.appendChild(wrapper.firstChild);
    }
  }

  // Функция для обработки текстового узла
  function processTextNode(textNode) {
    const text = textNode.textContent;
    let match;
    
    // Сбрасываем lastIndex перед использованием regex
    regex.lastIndex = 0;
    
    // Создаем копию текста в нижнем регистре для поиска
    const lowerText = text.toLowerCase();
    
    while ((match = regex.exec(lowerText)) !== null) {
      const startOffset = match.index;
      const endOffset = startOffset + match[0].length;
      
      try {
        const range = document.createRange();
        range.setStart(textNode, startOffset);
        range.setEnd(textNode, endOffset);
        createHighlight(range);
        
        // После создания выделения нужно обновить textNode,
        // так как он был изменен
        textNode = Array.from(range.endContainer.parentNode.childNodes)
          .find(node => 
            node.nodeType === Node.TEXT_NODE && 
            node.textContent.length > 0 &&
            regex.test(node.textContent.toLowerCase())
          );
        
        if (!textNode) break;
        
        // Сбрасываем regex.lastIndex, так как мы работаем с новым текстовым узлом
        regex.lastIndex = 0;
      } catch (e) {
        console.error('Error highlighting text:', e);
        break;
      }
    }
  }

  // Функция для рекурсивного обхода DOM
  function walkDOM(node) {
    if (!node) return;

    // Пропускаем элементы, которые не нужно обрабатывать
    if (node.nodeType === Node.ELEMENT_NODE && (
      node.nodeName === 'SCRIPT' || 
      node.nodeName === 'STYLE' || 
      node.nodeName === 'NOSCRIPT' ||
      node.classList.contains('gpt-highlight-wrapper') ||
      node.classList.contains('gpt-highlight-content'))) {
      return;
    }

    // Если это текстовый узел с непустым содержимым
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      processTextNode(node);
      return;
    }

    // Рекурсивно обрабатываем дочерние узлы
    const children = Array.from(node.childNodes);
    children.forEach(walkDOM);
  }

  if (message.action === 'PING') {
    // Отвечаем на пинг, чтобы подтвердить, что content script работает
    sendResponse({ status: 'ok' });
    return;
  }
  else if (message.action === 'GET_TEXT') {
    // Извлекаем полный видимый текст страницы
    let pageText = document.body.innerText || '';
    sendResponse({ text: pageText });
  }
  else if (message.action === 'CLEAR_HIGHLIGHT') {
    // Удаляем все выделения
    const highlights = document.querySelectorAll('.gpt-highlight-wrapper');
    highlights.forEach(el => {
      // Восстанавливаем оригинальный текст
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      parent.normalize();
    });
  }
  else if (message.action === 'HIGHLIGHT') {
    const phrases = message.phrases || [];
    if (phrases.length === 0) {
      return; // нечего подсвечивать
    }

    // Удаляем предыдущие выделения
    const oldHighlights = document.querySelectorAll('.gpt-highlight-wrapper');
    oldHighlights.forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      parent.normalize();
    });

    // Добавляем стили для выделения
    let style = document.getElementById('gpt-highlight-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'gpt-highlight-style';
      style.textContent = `
        .gpt-highlight-wrapper {
          background: rgba(0, 0, 0, 0.95);
          display: inline;
        }
        .gpt-highlight-content {
          background: rgba(255, 255, 255, 0.70);
          border-radius: 3px;
          padding: 2px 4px;
          margin: 0 -2px;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          position: relative;
          color: inherit;
        }
      `;
      document.head.appendChild(style);
    }

    // Создаем регулярное выражение для всех фраз
    const phrasePatterns = phrases
      .filter(phrase => phrase && phrase.trim())
      .map(phrase => escapeRegExp(phrase.trim().toLowerCase()));
    
    if (phrasePatterns.length === 0) return;
    
    regex = new RegExp(`(${phrasePatterns.join('|')})`, 'gi');

    // Запускаем обработку с корня документа
    walkDOM(document.body);
  }
});
