// popup.js (фрагмент)
// Загружаем сохраненное состояние при открытии popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const state = await chrome.storage.local.get(['lastOutput', 'lastAction']);
    if (state.lastOutput && state.lastAction) {
      renderMarkdown(state.lastOutput);
    } else {
      document.getElementById('output').innerHTML = 'Выберите действие для анализа страницы';
    }
  } catch (err) {
    console.error('Error loading state:', err);
    showStatus("Ошибка при загрузке состояния", "error");
  }
});

// Функции для управления статусом
function showStatus(message, type = 'loading') {
  const status = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  status.style.display = 'flex';
  status.className = `status ${type}`;
  statusText.textContent = message;
}

function hideStatus() {
  document.getElementById('status').style.display = 'none';
}

// Функция для рендеринга markdown с безопасной обработкой HTML
function renderMarkdown(text) {
  const output = document.getElementById("output");
  // Конвертируем markdown в HTML и очищаем от потенциально опасного кода
  const html = DOMPurify.sanitize(marked.parse(text));
  output.innerHTML = html;
}

async function ensureContentScriptInjected(tab) {
  try {
    // Пробуем отправить тестовое сообщение
    await chrome.tabs.sendMessage(tab.id, { action: "PING" });
  } catch (error) {
    // Если content script не отвечает, инжектируем его
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    // Ждем немного, чтобы скрипт успел инициализироваться
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function getPageText() {
  // Запрос информации об активной вкладке
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Убеждаемся, что content script загружен
  await ensureContentScriptInjected(tab);
  // Отправка сообщения content script с запросом текста
  let response = await chrome.tabs.sendMessage(tab.id, { action: "GET_TEXT" });
  return response.text;
}

// Сохраняем состояние
async function saveState(output, action) {
  try {
    await chrome.storage.local.set({
      lastOutput: output,
      lastAction: action
    });
  } catch (err) {
    console.error('Error saving state:', err);
  }
}

const OPENAI_API_KEY = "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"; 

async function callChatGPT(promptText) {
  const apiUrl = "https://api.openai.com/v1/chat/completions";
  // Сформировать тело запроса по формату ChatGPT API
  const requestData = {
    model: "gpt-4o-mini",
    messages: [ { role: "user", content: promptText } ],
    max_tokens: 1024,  // ограничим ответ разумным числом токенов
    temperature: 0.7   // температуру можно регулировать: 0.7 для сбалансированных ответов
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(requestData)
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);
    throw new Error(`API request failed: ${response.status}`);
  }
  const data = await response.json();
  // Извлекаем ответ ассистента (текст)
  const answer = data.choices[0].message.content;
  return answer;
}

// Обработчик для сброса выделения
document.getElementById("btnClearHighlight").addEventListener("click", async () => {
  try {
    showStatus("Сброс выделения...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await ensureContentScriptInjected(tab);
    await chrome.tabs.sendMessage(tab.id, { action: "CLEAR_HIGHLIGHT" });
    document.getElementById("output").innerHTML = "";
    await saveState("", "clear");
    hideStatus();
  } catch(err) {
    console.error(err);
    showStatus("Ошибка при сбросе выделения", "error");
    renderMarkdown("❌ " + err.message);
  }
});

// Обработчик для кнопки копирования
document.getElementById("btnCopy").addEventListener("click", async () => {
  const output = document.getElementById("output");
  try {
    await navigator.clipboard.writeText(output.innerText);
    showStatus("Скопировано!", "success");
    setTimeout(hideStatus, 2000);
  } catch(err) {
    showStatus("Ошибка при копировании", "error");
  }
});

// Назначаем обработчики на кнопки после загрузки popup
document.getElementById("btnSummary").addEventListener("click", async () => {
  try {
    showStatus("Генерация саммари...");
    const text = await getPageText();  // получаем текст страницы
    const prompt = `Проанализируй следующий текст и создай подробное саммари. Структурируй ответ следующим образом:

## Основные идеи
- Перечисли 3-5 ключевых идей текста

## Важные факты и цифры
- Выдели конкретные факты, статистику, даты и числовые данные

## Ключевые инсайты
- Укажи 3-5 неочевидных выводов или важных наблюдений

## Практическое применение
- Опиши, как можно применить информацию из текста на практике
- Какие действия можно предпринять на основе этих знаний

Текст для анализа:
${text}`;

    const summary = await callChatGPT(prompt);
    renderMarkdown(summary);
    await saveState(summary, "summary");
    hideStatus();
  } catch(err) {
    console.error(err);
    showStatus("Ошибка при создании саммари", "error");
    renderMarkdown("❌ " + err.message);
  }
});

document.getElementById("btnOutline").addEventListener("click", async () => {
  try {
    showStatus("Генерация плана...");
    const text = await getPageText();
    const prompt = `Создай подробный план-конспект текста. Требования:

1. Используй markdown для форматирования
2. Структурируй материал иерархически (главы, разделы, подразделы)
3. Используй нумерацию для основных пунктов
4. Добавляй краткие пояснения к каждому важному пункту
5. Выделяй ключевые термины и определения
6. Отмечай важные цитаты из текста

Текст для анализа:
${text}`;

    const outline = await callChatGPT(prompt);
    renderMarkdown(outline);
    await saveState(outline, "outline");
    hideStatus();
  } catch(err) {
    console.error(err);
    showStatus("Ошибка при создании плана", "error");
    renderMarkdown("❌ " + err.message);
  }
});

document.getElementById("btnHighlight").addEventListener("click", async () => {
  try {
    showStatus("Поиск ключевых идей...");
    const text = await getPageText();
    
    // Улучшенный промпт для получения ключевых идей
    const prompt = `Analyze the following text and extract the most important quotes that capture the main ideas. Rules:
1. Each quote must be an exact, word-for-word copy from the original text
2. Each quote should be on a new line
3. Do not add any numbering, bullets, or extra formatting
4. Do not add any explanations or comments
5. Each quote should be wrapped in double quotes
6. Focus on quotes that:
   - Represent main ideas or conclusions
   - Contain key findings or statistics
   - Explain core concepts
   - Present important arguments or statements
7. Quotes should be between 5 and 40 words long
8. Extract as many quotes as needed to cover all main ideas (typically 3-8 quotes)

Here's the text to analyze:
${text}`;

    const result = await callChatGPT(prompt);
    
    // Извлекаем фразы, обернутые в кавычки
    const keyPhrases = result.match(/"([^"]+)"/g)
      ?.map(phrase => phrase.slice(1, -1)) // Убираем кавычки
      ?.filter(phrase => phrase.trim().length > 0) || [];

    if (keyPhrases.length === 0) {
      throw new Error("Не удалось извлечь ключевые фразы из ответа ChatGPT");
    }

    // Получаем активную вкладку и проверяем content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await ensureContentScriptInjected(tab);
    
    // Отправляем сообщение для подсветки
    await chrome.tabs.sendMessage(tab.id, { action: "HIGHLIGHT", phrases: keyPhrases });
    
    // Показываем найденные фразы пользователю
    const finalOutput = "## Выделенные ключевые фразы:\n\n" + 
      keyPhrases.map(phrase => `> ${phrase}`).join("\n\n");
    renderMarkdown(finalOutput);
    await saveState(finalOutput, "highlight");
    hideStatus();
  } catch(err) {
    console.error(err);
    showStatus("Ошибка при выделении ключевых идей", "error");
    renderMarkdown("❌ " + err.message);
  }
});
