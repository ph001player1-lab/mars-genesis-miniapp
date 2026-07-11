/**
 * telegram.js
 * Инициализация и обёртка над Telegram WebApp SDK.
 * Изолирует всё взаимодействие с window.Telegram.WebApp,
 * чтобы app.js работал с простым и предсказуемым API.
 */

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

/**
 * Инициализирует Mini App: сообщает Telegram, что приложение готово,
 * разворачивает окно на весь экран и подстраивает цвета под тему клиента.
 */
function initTelegram() {
  if (!tg) {
    console.warn('[telegram.js] Telegram WebApp SDK не обнаружен — приложение запущено вне Telegram.');
    document.body.classList.add('no-telegram');
    return;
  }

  tg.ready();
  tg.expand();

  if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
  }

  // Подгоняем фон Mini App под фон нашего экрана, чтобы не было "мигания" по краям.
  if (typeof tg.setHeaderColor === 'function') {
    try { tg.setHeaderColor('#120B08'); } catch (e) { /* некоторые клиенты принимают только ключевые слова */ }
  }
  if (typeof tg.setBackgroundColor === 'function') {
    try { tg.setBackgroundColor('#120B08'); } catch (e) { /* no-op */ }
  }

  document.body.classList.add('in-telegram');
}

/**
 * Короткий тактильный отклик при взаимодействии с интерфейсом.
 * @param {'light'|'medium'|'heavy'|'rigid'|'soft'} style
 */
function tgHapticImpact(style) {
  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred(style || 'medium');
  }
}

/**
 * Тактильный отклик для уведомления об успехе/ошибке.
 * @param {'error'|'success'|'warning'} type
 */
function tgHapticNotification(type) {
  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.notificationOccurred(type || 'success');
  }
}

/**
 * Возвращает данные пользователя Telegram, если они доступны.
 */
function tgGetUser() {
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user;
  }
  return null;
}

// Публичный интерфейс для остальных скриптов приложения.
window.MarsTelegram = {
  tg,
  initTelegram,
  tgHapticImpact,
  tgHapticNotification,
  tgGetUser,
};
