// Listener на входящие сообщения из расширения
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_TEXT") {
    // Извлекаем полный видимый текст страницы
    let pageText = document.body.innerText || "";
    sendResponse({ text: pageText });
    // Note: returning true не требуется здесь, так как ответ отправлен синхронно
  }
  else if (message.action === "HIGHLIGHT") {
    const phrases = message.phrases || [];
    if (phrases.length === 0) {
      return; // нечего подсвечивать
    }
    // Создаем затемняющий оверлей на всю страницу
    const overlayId = "gpt-highlight-overlay";
    if (!document.getElementById(overlayId)) {
      const overlay = document.createElement("div");
      overlay.id = overlayId;
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.backgroundColor = "black";
      overlay.style.opacity = "0.5";
      overlay.style.zIndex = "9999";
      overlay.style.pointerEvents = "none";
      document.body.appendChild(overlay);
    }
    // Функция для экранирования специальных символов в тексте для RegExp
    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    // Подсвечиваем каждую фразу
    phrases.forEach(phrase => {
      if (!phrase) return;
      const regex = new RegExp(escapeRegExp(phrase), "gi");
      // Оборачиваем совпадения в <mark>...</mark>
      document.body.innerHTML = document.body.innerHTML.replace(regex, match =>
        `<mark class="gpt-highlight" style="background: yellow; color: black;">${match}</mark>`
      );
    });
    // Поднимаем все отмеченные фрагменты над затемнением
    document.querySelectorAll("mark.gpt-highlight").forEach(el => {
      el.style.position = "relative";
      el.style.zIndex = "10000";
    });
    // sendResponse не отправляем, так как продолжения не требуется
  }
});
