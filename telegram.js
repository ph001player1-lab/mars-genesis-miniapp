/**
 * telegram.js
 * Инициализация и обёртка над Telegram WebApp SDK.
 *
 * Все вызовы SDK обёрнуты в try/catch: на некоторых версиях Telegram
 * (особенно старые мобильные клиенты) часть методов может отсутствовать
 * или вести себя иначе, и без защиты один упавший вызов мог бы оборвать
 * остальной код обработчика клика — именно так выглядел баг "кнопки не
 * реагируют только в мобильном Telegram, а в браузере всё работает".
 */

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

function safeCall(fn, label) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[telegram.js] "${label}" не выполнился:`, err);
    return null;
  }
}

/**
 * Синхронизирует CSS-переменную --tg-viewport-height с реальной видимой
 * высотой Mini App внутри Telegram. На телефоне 100vh/100dvh не всегда
 * совпадает с фактически видимой областью (out есть собственная шапка,
 * может быть открыта не полностью и т.д.), из-за чего нижние элементы
 * могут оказаться вне видимой зоны. Обновляется и при первом запуске,
 * и при любом изменении (тема, клавиатура, разворот).
 */
function syncViewportHeight() {
  if (!tg) return;
  const height = tg.viewportStableHeight || tg.viewportHeight;
  if (height) {
    document.documentElement.style.setProperty('--tg-viewport-height', `${height}px`);
  }
}

/**
 * Инициализирует Mini App: сообщает Telegram, что приложение готово,
 * разворачивает окно на весь экран и подстраивает вьюпорт/цвета.
 */
function initTelegram() {
  if (!tg) {
    console.warn('[telegram.js] Telegram WebApp SDK не обнаружен — приложение запущено вне Telegram.');
    document.body.classList.add('no-telegram');
    return;
  }

  safeCall(() => tg.ready(), 'ready');
  safeCall(() => tg.expand(), 'expand');
  safeCall(() => tg.setHeaderColor('#0A1410'), 'setHeaderColor');
  safeCall(() => tg.setBackgroundColor('#0A1410'), 'setBackgroundColor');

  syncViewportHeight();
  safeCall(() => tg.onEvent('viewportChanged', syncViewportHeight), 'onEvent:viewportChanged');

  document.body.classList.add('in-telegram');
}

/**
 * Короткий тактильный отклик при взаимодействии с интерфейсом.
 * @param {'light'|'medium'|'heavy'|'rigid'|'soft'} style
 */
function tgHapticImpact(style) {
  if (!tg || !tg.HapticFeedback) return;
  safeCall(() => tg.HapticFeedback.impactOccurred(style || 'medium'), 'HapticFeedback.impactOccurred');
}

/**
 * Тактильный отклик для уведомления об успехе/ошибке.
 * @param {'error'|'success'|'warning'} type
 */
function tgHapticNotification(type) {
  if (!tg || !tg.HapticFeedback) return;
  safeCall(() => tg.HapticFeedback.notificationOccurred(type || 'success'), 'HapticFeedback.notificationOccurred');
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

/**
 * Показывает нативную кнопку "Назад" в шапке Telegram.
 * @param {() => void} onClick
 */
function tgShowBackButton(onClick) {
  if (!tg || !tg.BackButton) return;
  safeCall(() => tg.BackButton.offClick(onClick), 'BackButton.offClick');
  safeCall(() => tg.BackButton.onClick(onClick), 'BackButton.onClick');
  safeCall(() => tg.BackButton.show(), 'BackButton.show');
}

/**
 * Скрывает нативную кнопку "Назад".
 */
function tgHideBackButton() {
  if (!tg || !tg.BackButton) return;
  safeCall(() => tg.BackButton.hide(), 'BackButton.hide');
}

/**
 * Открывает ссылку на t.me (инвайт, чат, диалог с пользователем) — внутри
 * Telegram это нужно делать через openTelegramLink, а не обычный переход,
 * иначе клиент может просто проигнорировать клик. Вне Telegram — обычный
 * window.open как для любой ссылки.
 * @param {string} url
 */
function tgOpenTelegramLink(url) {
  if (tg && typeof tg.openTelegramLink === 'function') {
    const ok = safeCall(() => { tg.openTelegramLink(url); return true; }, 'openTelegramLink');
    if (ok) return;
  }
  window.open(url, '_blank', 'noopener');
}

// Публичный интерфейс для остальных скриптов приложения.
window.MarsTelegram = {
  tg,
  initTelegram,
  tgHapticImpact,
  tgHapticNotification,
  tgGetUser,
  tgShowBackButton,
  tgHideBackButton,
  tgOpenTelegramLink,
};
