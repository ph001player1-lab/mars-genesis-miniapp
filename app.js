/**
 * app.js
 * Экран приветствия + анкета первого жителя Mars Genesis.
 *
 * Архитектура (см. ТЗ):
 * - Никакого сервера/API/БД — все ответы живут только в памяти вкладки (объект `answers`).
 * - Вопросы и варианты ответов НЕ зашиты в HTML — это данные (QUESTIONS ниже),
 *   так их легко расширять, редактировать и переводить на другие языки.
 * - Один HTML-файл: все экраны анкеты рендерятся динамически в #app-screen-content.
 */

/* ======================================================================
 * 1. ДАННЫЕ АНКЕТЫ
 * ==================================================================== */

const QUESTIONS = [
  {
    id: 'climate',
    title: 'Выберите климат',
    prompt: 'Представьте, что вы выбираете место для жизни в первом городе Марса. Какой климат вам наиболее комфортен?',
    options: [
      { value: 'tropical', icon: '🌴', label: 'Тропический', description: 'Круглый год примерно +24…+35 °C.' },
      { value: 'subtropical', icon: '🌿', label: 'Субтропический', description: 'Жаркое лето и мягкая зима (+10…+35 °C).' },
      { value: 'temperate', icon: '🌳', label: 'Умеренный', description: 'Четыре выраженных времени года.' },
      { value: 'cold', icon: '❄️', label: 'Холодный', description: 'Долгая зима и короткое прохладное лето.' },
      { value: 'polar', icon: '🏔', label: 'Полярный', description: 'Большую часть года температура ниже 0 °C.' },
    ],
  },
  {
    id: 'intimacy',
    title: 'Интимная сфера',
    prompt: 'Какая модель отношений должна считаться нормой в вашем городе?',
    options: [
      { value: 'monogamy', label: 'Моногамия' },
      { value: 'polyamory', label: 'Полиамория' },
      { value: 'free', label: 'Свободные отношения' },
      { value: 'asexual', label: 'Асексуальный образ жизни' },
    ],
  },
  {
    id: 'lifestyle',
    title: 'Быт',
    prompt: 'Какой уклад жизни вам ближе?',
    options: [
      { value: 'solo', label: 'Одиночное проживание' },
      { value: 'patriarchal', label: 'Патриархальная семья' },
      { value: 'matriarchal', label: 'Матриархальная семья' },
      { value: 'partnership', label: 'Партнёрская семья' },
      { value: 'commune', label: 'Коммуна' },
      { value: 'guest_marriage', label: 'Гостевой брак' },
    ],
  },
  {
    id: 'society',
    title: 'Социальное устройство',
    prompt: 'Какая модель общества вам наиболее близка?',
    options: [
      { value: 'liberalism', label: 'Либерализм' },
      { value: 'socialism', label: 'Социализм' },
      { value: 'conservatism', label: 'Консерватизм' },
      { value: 'communism', label: 'Коммунизм' },
      { value: 'anarchism', label: 'Анархизм' },
      { value: 'authoritarianism', label: 'Авторитаризм' },
    ],
  },
  {
    id: 'economy',
    title: 'Экономика',
    prompt: 'Какая экономическая модель вам ближе?',
    options: [
      { value: 'entrepreneur', label: 'Предприниматель' },
      { value: 'employee', label: 'Наёмный работник' },
      { value: 'investor', label: 'Инвестор' },
      { value: 'freelancer', label: 'Фрилансер' },
      { value: 'capital', label: 'Накопление капитала' },
      {
        value: 'ubi',
        label: 'Безусловный базовый доход',
        description: 'Каждый получает гарантированный базовый доход независимо от вклада и сам решает, чем заниматься.',
      },
    ],
  },
  {
    id: 'worldview',
    title: 'Мировоззрение',
    prompt: 'Какое мировоззрение вам наиболее близко?',
    options: [
      { value: 'christianity', label: 'Христианство' },
      { value: 'islam', label: 'Ислам' },
      { value: 'buddhism', label: 'Буддизм' },
      { value: 'judaism', label: 'Иудаизм' },
      { value: 'materialism', label: 'Научный материализм' },
      { value: 'agnosticism', label: 'Агностицизм' },
      { value: 'esoteric', label: 'Эзотерика' },
    ],
  },
];

const TOTAL_STEPS = QUESTIONS.length;

/* ======================================================================
 * 2. СОСТОЯНИЕ (только в памяти, без сохранения)
 * ==================================================================== */

const state = {
  currentStep: 0, // индекс в QUESTIONS
  answers: {}, // { questionId: value }
};

/* ======================================================================
 * 3. DOM-ссылки
 * ==================================================================== */

let welcomeScreen;
let appScreen;
let appScreenContent;

document.addEventListener('DOMContentLoaded', () => {
  window.MarsTelegram.initTelegram();

  welcomeScreen = document.getElementById('welcome-screen');
  appScreen = document.getElementById('app-screen');
  appScreenContent = document.getElementById('app-screen-content');

  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', handleStartColonization);
});

/* ======================================================================
 * 4. Переход welcome → анкета
 * ==================================================================== */

function handleStartColonization() {
  window.MarsTelegram.tgHapticImpact('medium');

  const startBtn = document.getElementById('start-btn');
  startBtn.disabled = true;
  welcomeScreen.classList.add('is-launching');

  window.setTimeout(() => {
    welcomeScreen.hidden = true;
    appScreen.hidden = false;
    // небольшая задержка нужна, чтобы браузер применил hidden=false
    // до включения класса, иначе transition не сыграет
    requestAnimationFrame(() => {
      appScreen.classList.add('is-visible');
      renderQuestion(0, 'forward');
    });
  }, 500);
}

/* ======================================================================
 * 5. Рендер экрана вопроса
 * ==================================================================== */

function renderQuestion(stepIndex, direction) {
  state.currentStep = stepIndex;
  const question = QUESTIONS[stepIndex];
  const stepNumber = stepIndex + 1;
  const selectedValue = state.answers[question.id];

  const progressPercent = Math.round((stepNumber / TOTAL_STEPS) * 100);

  const optionsHtml = question.options
    .map((opt) => {
      const isSelected = opt.value === selectedValue;
      return `
        <button
          type="button"
          class="option-card${isSelected ? ' is-selected' : ''}"
          data-value="${opt.value}"
        >
          ${opt.icon ? `<span class="option-card__icon">${opt.icon}</span>` : ''}
          <span class="option-card__text">
            <span class="option-card__label">${opt.label}</span>
            ${opt.description ? `<span class="option-card__description">${opt.description}</span>` : ''}
          </span>
        </button>
      `;
    })
    .join('');

  const html = `
    <div class="progress" aria-hidden="true">
      <div class="progress__label">Шаг ${stepNumber} из ${TOTAL_STEPS}</div>
      <div class="progress__track">
        <div class="progress__fill" style="width:${progressPercent}%"></div>
      </div>
    </div>

    <h2 class="question-title">${question.title}</h2>
    <p class="question-prompt">${question.prompt}</p>

    <div class="option-list" role="group" aria-label="${question.title}">
      ${optionsHtml}
    </div>

    <div class="nav-row">
      <button type="button" class="nav-btn nav-btn--back" id="nav-back">← Назад</button>
      <button type="button" class="nav-btn nav-btn--next" id="nav-next" ${selectedValue ? '' : 'disabled'}>Далее →</button>
    </div>
  `;

  transitionScreen(html, direction, () => {
    bindQuestionEvents(question);

    // Нативная кнопка "Назад" Telegram дублирует нашу.
    window.MarsTelegram.tgShowBackButton(() => goBack());
  });
}

function bindQuestionEvents(question) {
  const optionButtons = appScreenContent.querySelectorAll('.option-card');
  optionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const { value } = btn.dataset;
      state.answers[question.id] = value;
      window.MarsTelegram.tgHapticImpact('light');

      optionButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));

      const nextBtn = document.getElementById('nav-next');
      nextBtn.disabled = false;
    });
  });

  document.getElementById('nav-back').addEventListener('click', goBack);
  document.getElementById('nav-next').addEventListener('click', goNext);
}

function goBack() {
  window.MarsTelegram.tgHapticImpact('light');

  if (state.currentStep === 0) {
    // Возврат с первого вопроса анкеты — на экран приветствия.
    window.MarsTelegram.tgHideBackButton();
    appScreen.classList.remove('is-visible');
    window.setTimeout(() => {
      appScreen.hidden = true;
      welcomeScreen.hidden = false;
      welcomeScreen.classList.remove('is-launching');
      document.getElementById('start-btn').disabled = false;
    }, 300);
    return;
  }

  renderQuestion(state.currentStep - 1, 'backward');
}

function goNext() {
  window.MarsTelegram.tgHapticImpact('light');

  if (state.currentStep < TOTAL_STEPS - 1) {
    renderQuestion(state.currentStep + 1, 'forward');
  } else {
    renderAnalyzing();
  }
}

/* ======================================================================
 * 6. Экран "Анализируем ваши ответы..."
 * ==================================================================== */

function renderAnalyzing() {
  window.MarsTelegram.tgHideBackButton();

  const html = `
    <div class="analyzing">
      <div class="analyzing__ring-wrap">
        <div class="logo-ring logo-ring--outer" aria-hidden="true"></div>
        <div class="logo-ring logo-ring--pulse" aria-hidden="true"></div>
        <div class="analyzing__core"></div>
      </div>
      <p class="analyzing__text">Анализируем ваши ответы<span class="analyzing__dots" aria-hidden="true"></span></p>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    window.setTimeout(renderResult, 2000);
  });
}

/* ======================================================================
 * 7. Экран результата
 * ==================================================================== */

const CLIMATE_LABELS = {
  tropical: '🌴 Тропический',
  subtropical: '🌿 Субтропический',
  temperate: '🌳 Умеренный',
  cold: '❄️ Холодный',
  polar: '🏔 Полярный',
};

function renderResult() {
  const cityName = 'Aurora-001'; // тестовое название — далее будет назначаться логикой распределения
  const climateLabel = CLIMATE_LABELS[state.answers.climate] || '—';

  const html = `
    <div class="result-card">
      <div class="result-card__eyebrow">Ваш город</div>
      <div class="result-card__name">${cityName}</div>

      <div class="result-card__stats">
        <div class="result-card__stat">
          <span class="result-card__stat-icon">🌍</span>
          <span class="result-card__stat-label">Климат</span>
          <span class="result-card__stat-value">${climateLabel}</span>
        </div>
        <div class="result-card__stat">
          <span class="result-card__stat-icon">👤</span>
          <span class="result-card__stat-label">Жителей</span>
          <span class="result-card__stat-value">1</span>
        </div>
        <div class="result-card__stat">
          <span class="result-card__stat-icon">🏗</span>
          <span class="result-card__stat-label">Статус</span>
          <span class="result-card__stat-value">Первый житель</span>
        </div>
        <div class="result-card__stat">
          <span class="result-card__stat-icon">📊</span>
          <span class="result-card__stat-label">DCL</span>
          <span class="result-card__stat-value">100%</span>
        </div>
      </div>
    </div>

    <p class="tagline result-headline">Поздравляем!</p>
    <p class="subtext result-subtext">
      Вы стали первым жителем этого города.<br/><br/>
      Пока жители всех городов общаются в общем сообществе Марса.
      Когда в вашем городе появятся новые жители, автоматически откроется
      отдельный городской чат.
    </p>

    <button type="button" class="start-btn" id="join-community-btn">
      <span class="start-btn__label">Войти в сообщество Марса</span>
      <span class="start-btn__glyph" aria-hidden="true">→</span>
    </button>
  `;

  transitionScreen(html, 'forward', () => {
    document.getElementById('join-community-btn').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('medium');
      // Ссылка на сообщество появится позже.
      console.info('[app.js] «Войти в сообщество Марса» — ссылка пока не задана.');
    });
  });
}

/* ======================================================================
 * 8. Общий помощник плавных переходов между экранами анкеты
 * ==================================================================== */

function transitionScreen(html, direction, onReady) {
  const outClass = direction === 'backward' ? 'screen-exit-back' : 'screen-exit-forward';
  const inClass = direction === 'backward' ? 'screen-enter-back' : 'screen-enter-forward';

  appScreenContent.classList.add(outClass);

  window.setTimeout(() => {
    appScreenContent.innerHTML = html;
    appScreenContent.classList.remove(outClass);
    appScreenContent.classList.add(inClass);

    requestAnimationFrame(() => {
      appScreenContent.classList.add('is-settled');
    });

    window.setTimeout(() => {
      appScreenContent.classList.remove(inClass, 'is-settled');
    }, 320);

    if (typeof onReady === 'function') onReady();
  }, 220);
}
