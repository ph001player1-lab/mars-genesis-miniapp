/**
 * app.js
 * Логика экрана приветствия Mars Genesis.
 */

document.addEventListener('DOMContentLoaded', () => {
  window.MarsTelegram.initTelegram();

  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', handleStartColonization);
});

function handleStartColonization() {
  window.MarsTelegram.tgHapticImpact('medium');

  const screen = document.querySelector('.welcome-screen');
  const startBtn = document.getElementById('start-btn');

  startBtn.disabled = true;
  screen.classList.add('is-launching');

  // Здесь в реальном приложении будет переход к следующему экрану
  // (например, показ формы регистрации колониста или основного модуля).
  window.setTimeout(() => {
    window.MarsTelegram.tgHapticNotification('success');
    console.info('[app.js] Колонизация инициирована. Переход к следующему экрану...');
    // navigateToNextScreen();
  }, 500);
}
