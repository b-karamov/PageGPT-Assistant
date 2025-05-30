// Listener на входящие сообщения из расширения
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "PING") {
    // Отвечаем на пинг, чтобы подтвердить, что content script работает
    sendResponse({ status: "ok" });
    return;
  }
  else if (message.action === "GET_TEXT") {
    // Извлекаем полный видимый текст страницы
    let pageText = document.body.innerText || "";
    sendResponse({ text: pageText });
  }
  else if (message.action === "CLEAR_HIGHLIGHT") {
    // Удаляем оверлей, если он есть
    const overlay = document.getElementById("gpt-highlight-overlay");
    if (overlay) {
      overlay.remove();
    }
  }
  else if (message.action === "HIGHLIGHT") {
    const phrases = message.phrases || [];
    if (phrases.length === 0) {
      return; // нечего подсвечивать
    }

    // Удаляем предыдущий оверлей, если он есть
    const oldOverlay = document.getElementById("gpt-highlight-overlay");
    if (oldOverlay) {
      oldOverlay.remove();
    }

    // Функция для экранирования специальных символов в тексте для RegExp
    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Создаем регулярное выражение для всех фраз
    const phrasePatterns = phrases
      .filter(phrase => phrase && phrase.trim())
      .map(phrase => escapeRegExp(phrase.trim()));
    
    if (phrasePatterns.length === 0) return;

    // Создаем TreeWalker для обхода текстовых узлов
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Пропускаем скрипты и стили
          const parent = node.parentNode;
          if (parent.nodeName === 'SCRIPT' || 
              parent.nodeName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    // Собираем все текстовые узлы и их позиции
    const highlights = [];
    let node;
    const regex = new RegExp(phrasePatterns.join('|'), 'gi');

    while (node = walker.nextNode()) {
      const text = node.textContent;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        
        // Получаем все прямоугольники для диапазона (каждая строка будет отдельным прямоугольником)
        const clientRects = Array.from(range.getClientRects());
        
        // Добавляем каждый прямоугольник как отдельное выделение
        clientRects.forEach(rect => {
          highlights.push({
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height
          });
        });
      }
    }

    // Создаем затемняющий оверлей
    const overlay = document.createElement("div");
    overlay.id = "gpt-highlight-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = document.documentElement.scrollWidth + "px";
    overlay.style.height = document.documentElement.scrollHeight + "px";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483647";

    // Создаем SVG для затемнения с вырезами
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "none");

    // Добавляем обработчик изменения размера страницы
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        overlay.style.width = entry.target.scrollWidth + "px";
        overlay.style.height = entry.target.scrollHeight + "px";
      }
    });
    resizeObserver.observe(document.documentElement);

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(defs);

    // Создаем градиент для более мягкого эффекта выделения
    const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    const gradientId = "highlight-gradient-" + Math.random().toString(36).substr(2, 9);
    gradient.setAttribute("id", gradientId);
    gradient.setAttribute("x1", "0%");
    gradient.setAttribute("y1", "0%");
    gradient.setAttribute("x2", "100%");
    gradient.setAttribute("y2", "100%");

    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("style", "stop-color:rgba(0,0,0,0.6)");

    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("style", "stop-color:rgba(0,0,0,0.5)");

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);

    // Создаем маску
    const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
    const maskId = "highlight-mask-" + Math.random().toString(36).substr(2, 9);
    mask.setAttribute("id", maskId);

    // Создаем базовый белый прямоугольник для маски
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute("fill", "white");

    mask.appendChild(background);

    // Добавляем каждое выделение как отдельный прямоугольник
    highlights.forEach(rect => {
      const highlight = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const padding = 2;
      highlight.setAttribute("x", rect.left + "px");
      highlight.setAttribute("y", rect.top + "px");
      highlight.setAttribute("width", (rect.width + padding * 2) + "px");
      highlight.setAttribute("height", (rect.height + padding * 2) + "px");
      highlight.setAttribute("fill", "black");
      highlight.setAttribute("rx", "2");
      highlight.setAttribute("ry", "2");
      mask.appendChild(highlight);
    });

    svg.appendChild(mask);

    // Создаем прямоугольник с затемнением, используя маску
    const overlay_rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    overlay_rect.setAttribute("x", "0");
    overlay_rect.setAttribute("y", "0");
    overlay_rect.setAttribute("width", "100%");
    overlay_rect.setAttribute("height", "100%");
    overlay_rect.setAttribute("fill", `url(#${gradientId})`);
    overlay_rect.setAttribute("mask", `url(#${maskId})`);

    svg.appendChild(overlay_rect);
    overlay.appendChild(svg);
    document.body.appendChild(overlay);

    // Очищаем ResizeObserver при удалении оверлея
    const clearHighlight = () => {
      const overlay = document.getElementById("gpt-highlight-overlay");
      if (overlay) {
        resizeObserver.disconnect();
        overlay.remove();
      }
    };

    // Добавляем обработчик для очистки при переходе на другую страницу
    window.addEventListener("beforeunload", clearHighlight);
  }
});
