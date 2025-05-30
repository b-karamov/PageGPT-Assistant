// popup.js (фрагмент)
async function getPageText() {
  // Запрос информации об активной вкладке
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Отправка сообщения content script с запросом текста
  let response = await chrome.tabs.sendMessage(tab.id, { action: "GET_TEXT" });
  return response.text;
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
    console.error("OpenAI API error:", response.status, await response.text());
    throw new Error("API request failed");
  }
  const data = await response.json();
  // Извлекаем ответ ассистента (текст)
  const answer = data.choices[0].message.content;
  return answer;
}

// Назначаем обработчики на кнопки после загрузки popup
document.getElementById("btnSummary").addEventListener("click", async () => {
  try {
    document.getElementById("output").textContent = "⌛ Генерация саммари...";
    const text = await getPageText();  // получаем текст страницы
    const prompt = "Кратко резюмируй следующий текст:\n" + text;
    const summary = await callChatGPT(prompt);
    document.getElementById("output").textContent = summary;
  } catch(err) {
    console.error(err);
    document.getElementById("output").textContent = "Ошибка: не удалось создать саммари.";
  }
});

document.getElementById("btnOutline").addEventListener("click", async () => {
  try {
    document.getElementById("output").textContent = "⌛ Генерация плана...";
    const text = await getPageText();
    const prompt = "Составь план (оглавление) по следующему тексту:\n" + text;
    const outline = await callChatGPT(prompt);
    document.getElementById("output").textContent = outline;
  } catch(err) {
    console.error(err);
    document.getElementById("output").textContent = "Ошибка: не удалось построить план.";
  }
});

document.getElementById("btnHighlight").addEventListener("click", async () => {
  try {
    document.getElementById("output").textContent = "⌛ Поиск ключевых идей...";
    const text = await getPageText();
    const prompt = "Identify the 5 most important sentences or phrases from the text (verbatim).";
    const result = await callChatGPT(prompt);
    // Предположим, что ChatGPT вернул список ключевых фраз/предложений (по одному в строке или в нумерованном списке)
    // Разобьем результат на отдельные фразы:
    let keyPhrases = result.split(/\r?\n/).map(s => s.replace(/^\d+[\.\)]\s*/, "").trim()).filter(s => s);
    // Отправим эти фразы контент-скрипту для подсветки
    await chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      await chrome.tabs.sendMessage(tab.id, { action: "HIGHLIGHT", phrases: keyPhrases });
    });
    document.getElementById("output").textContent = "✅ Ключевые фразы выделены на странице.";
  } catch(err) {
    console.error(err);
    document.getElementById("output").textContent = "Ошибка при выделении ключевых идей.";
  }
});
