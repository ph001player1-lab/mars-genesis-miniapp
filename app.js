/**
 * app.js
 * Приветствие → анкета сборки города (6 осей DCL) → проверка, не существует
 * ли уже такая же конфигурация → создание города или присоединение к
 * существующему → результат → дашборд цивилизации со списком всех городов.
 *
 * Архитектура:
 * - Ответы анкеты живут в памяти вкладки (state.answers).
 * - Всё, что сохраняется НАВСЕГДА, уходит на бэкенд Google Apps Script
 *   (см. Code.gs), который пишет строки в Google Таблицу и отдаёт
 *   агрегаты для дашборда.
 * - Вопросы/варианты ответов — данные (QUESTIONS), не зашиты в разметку.
 * - Каждой из 30 240 комбинаций соответствует уникальный буквенный код
 *   (CONFIG_CODES), например TRP-FRE-SOL-ANA-UBI-SCI — это и есть
 *   идентификатор конфигурации/города в реестре.
 */

/* ======================================================================
 * 0. НАСТРОЙКА РЕЕСТРА (заполнить после деплоя Google Apps Script)
 * ==================================================================== */

// Вставьте сюда URL вашего развёрнутого Web App из Apps Script
// (Deploy → New deployment → Web app → Execute as: me → Who has access: Anyone).
// Пока строка пустая — приложение работает в демо-режиме: проверка занятости
// конфигурации/названия и сохранение в таблицу отключены, дашборд показывает
// заглушку с пояснением.
const CITY_REGISTRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwaxCdCZ_3fyzg7qNRKDSHRrQS-vZTrharZekzt1439pf-8vLJNz9NdCw1UWDrnrDF3mQ/exec';

const TOTAL_CONFIGURATIONS = 30240; // 5 × 4 × 6 × 6 × 6 × 7 — см. книгу

const BOOK_URL = 'https://drive.google.com/file/d/1usvYRQ29hS6HZ2QDfDL9aeubIPfNvY7z/view?usp=drivesdk';

/* ======================================================================
 * 1. ДАННЫЕ АНКЕТЫ (варианты ответов не менялись, только формулировки)
 * ==================================================================== */

const QUESTIONS = [
  {
    id: 'climate',
    title: 'Климатическая зона',
    prompt: 'Первая ось конфигурации вашего города — климат. Где физически будет расположен ваш узел цивилизации?',
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
    prompt: 'Какая модель отношений закреплена как норма в правилах вашего города?',
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
    prompt: 'Какой уклад жизни ляжет в основу повседневности города?',
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
    prompt: 'Какая модель общественного устройства определяет правила вашего города?',
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
    prompt: 'На какой экономической модели строится жизнь в городе?',
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
    prompt: 'Какое мировоззрение образует культурный код города?',
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

const OPTION_LABELS = {}; // { questionId: { value: {label, icon} } }
QUESTIONS.forEach((q) => {
  OPTION_LABELS[q.id] = {};
  q.options.forEach((opt) => {
    OPTION_LABELS[q.id][opt.value] = opt;
  });
});

/* ======================================================================
 * 1b. БУКВЕННЫЕ КОДЫ КОНФИГУРАЦИИ
 * ==================================================================== */

const CONFIG_CODES = {
  climate: { tropical: 'TRP', subtropical: 'SUB', temperate: 'TMP', cold: 'CLD', polar: 'PLR' },
  intimacy: { monogamy: 'MNG', polyamory: 'PLY', free: 'FRE', asexual: 'ASX' },
  lifestyle: { solo: 'SOL', patriarchal: 'PAT', matriarchal: 'MAT', partnership: 'PRT', commune: 'COM', guest_marriage: 'GST' },
  society: { liberalism: 'LIB', socialism: 'SOC', conservatism: 'CNS', communism: 'CMM', anarchism: 'ANA', authoritarianism: 'AUT' },
  economy: { entrepreneur: 'ENT', employee: 'EMP', investor: 'INV', freelancer: 'FRL', capital: 'CAP', ubi: 'UBI' },
  worldview: { christianity: 'CHR', islam: 'ISL', buddhism: 'BUD', judaism: 'JUD', materialism: 'SCI', agnosticism: 'AGN', esoteric: 'ESO' },
};

function getConfigCode() {
  return QUESTIONS.map((q) => CONFIG_CODES[q.id][state.answers[q.id]]).join('-');
}

/* ======================================================================
 * 2. СОСТОЯНИЕ (только в памяти вкладки)
 * ==================================================================== */

const state = {
  currentStep: 0,
  answers: {},
  cityName: null,
  configCode: null,
};

/* ======================================================================
 * 3. DOM-ссылки
 * ==================================================================== */

let welcomeScreen;
let appScreen;
let appScreenContent;
let navRow;
let navBackBtn;
let navNextBtn;

document.addEventListener('DOMContentLoaded', () => {
  window.MarsTelegram.initTelegram();

  welcomeScreen = document.getElementById('welcome-screen');
  appScreen = document.getElementById('app-screen');
  appScreenContent = document.getElementById('app-screen-content');
  navRow = document.getElementById('nav-row');
  navBackBtn = document.getElementById('nav-back');
  navNextBtn = document.getElementById('nav-next');

  // Слушатели вешаются ОДИН раз на постоянные, никогда не пересоздаваемые
  // кнопки (панель .nav-row вынесена из анимируемого блока с вопросами и
  // зафиксирована position:fixed) — это защита от бага "кнопка есть, но
  // не нажимается", который проявлялся только в мобильном Telegram.
  navBackBtn.addEventListener('click', goBack);
  navNextBtn.addEventListener('click', goNext);

  document.getElementById('start-btn').addEventListener('click', handleStartColonization);
  document.getElementById('dashboard-link').addEventListener('click', openDashboardFromWelcome);
  document.getElementById('book-link').addEventListener('click', () => {
    window.MarsTelegram.tgHapticImpact('light');
    window.MarsTelegram.tgOpenTelegramLink(BOOK_URL);
  });
});

/* ======================================================================
 * 4. Переход welcome → анкета / дашборд
 * ==================================================================== */

function handleStartColonization() {
  window.MarsTelegram.tgHapticImpact('medium');

  const startBtn = document.getElementById('start-btn');
  startBtn.disabled = true;
  welcomeScreen.classList.add('is-launching');

  window.setTimeout(() => {
    welcomeScreen.hidden = true;
    appScreen.hidden = false;
    requestAnimationFrame(() => {
      appScreen.classList.add('is-visible');
      renderQuestion(0, 'forward');
    });
  }, 500);
}

function openDashboardFromWelcome() {
  window.MarsTelegram.tgHapticImpact('light');

  welcomeScreen.hidden = true;
  appScreen.hidden = false;
  navRow.hidden = true;
  requestAnimationFrame(() => {
    appScreen.classList.add('is-visible');
    renderDashboard({ fromWelcome: true });
  });
}

function returnToWelcome() {
  window.MarsTelegram.tgHideBackButton();
  appScreen.classList.remove('is-visible');
  window.setTimeout(() => {
    appScreen.hidden = true;
    navRow.hidden = true;
    welcomeScreen.hidden = false;
    welcomeScreen.classList.remove('is-launching');
    document.getElementById('start-btn').disabled = false;
  }, 300);
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
  `;

  transitionScreen(html, direction, () => {
    bindOptionEvents(question);
    syncNavRow(Boolean(selectedValue));
    window.MarsTelegram.tgShowBackButton(() => goBack());
  });
}

function bindOptionEvents(question) {
  const optionButtons = appScreenContent.querySelectorAll('.option-card');
  optionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const { value } = btn.dataset;
      state.answers[question.id] = value;
      window.MarsTelegram.tgHapticImpact('light');

      optionButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));
      navNextBtn.disabled = false;
    });
  });
}

function syncNavRow(hasSelection) {
  navRow.hidden = false;
  navBackBtn.hidden = false;
  navNextBtn.disabled = !hasSelection;
  navNextBtn.textContent = state.currentStep === TOTAL_STEPS - 1 ? 'Завершить →' : 'Далее →';
}

function goBack() {
  window.MarsTelegram.tgHapticImpact('light');

  if (state.currentStep === 0) {
    returnToWelcome();
    return;
  }

  renderQuestion(state.currentStep - 1, 'backward');
}

function goNext() {
  window.MarsTelegram.tgHapticImpact('light');

  if (state.currentStep < TOTAL_STEPS - 1) {
    renderQuestion(state.currentStep + 1, 'forward');
  } else {
    navRow.hidden = true;
    renderAnalyzing();
  }
}

/* ======================================================================
 * 6. Экран "Ищем совпадение по шести осям DCL..."
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
      <p class="analyzing__text">Ищем совпадение по шести осям DCL<span class="analyzing__dots" aria-hidden="true"></span></p>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    window.setTimeout(checkConfigurationAndProceed, 2000);
  });
}

/**
 * После анализа — проверяем, не существует ли уже город с ТОЧНО такой же
 * конфигурацией (по буквенному коду, а не по названию — это разные вещи).
 * Если существует — предлагаем присоединиться, а не создавать новый.
 */
function checkConfigurationAndProceed() {
  const code = getConfigCode();
  state.configCode = code;

  checkConfiguration(code)
    .then((res) => {
      if (res && res.ok && res.exists) {
        renderJoinExisting(code, res.city, res.citizens);
      } else {
        renderCityForm();
      }
    })
    .catch(() => {
      // Если проверка недоступна — не блокируем пользователя, даём создать
      // город; финальную проверку на всякий случай всё равно сделает
      // сервер при регистрации.
      renderCityForm();
    });
}

function checkConfiguration(code) {
  if (!CITY_REGISTRY_ENDPOINT) {
    console.warn('[app.js] CITY_REGISTRY_ENDPOINT не задан — проверка конфигурации работает в демо-режиме (всегда "свободно"). См. Code.gs.');
    return Promise.resolve({ ok: true, exists: false });
  }
  return fetch(`${CITY_REGISTRY_ENDPOINT}?action=checkConfig&code=${encodeURIComponent(code)}`).then((r) => r.json());
}

/* ======================================================================
 * 7. Экран "такая конфигурация уже существует — присоединиться?"
 * ==================================================================== */

function renderJoinExisting(code, cityName, citizens) {
  const html = `
    <div class="config-summary">
      <div class="config-summary__title">Такая конфигурация уже существует</div>
      <div class="config-summary__row">
        <span class="config-summary__row-label">Город</span>
        <span class="config-summary__row-value">${escapeHtml(cityName)}</span>
      </div>
      <div class="config-summary__row">
        <span class="config-summary__row-label">Код</span>
        <span class="config-summary__row-value">${escapeHtml(code)}</span>
      </div>
      <div class="config-summary__row">
        <span class="config-summary__row-label">Жителей сейчас</span>
        <span class="config-summary__row-value">${citizens != null ? citizens : '—'}</span>
      </div>
    </div>

    <p class="subtext result-subtext">
      Ровно такую же конфигурацию по всем шести осям уже выбрал кто-то раньше вас.
      Отдельный город с такой же конфигурацией не создаётся — присоединяйтесь к «${escapeHtml(cityName)}».
    </p>

    <div class="result-actions">
      <button type="button" class="action-btn action-btn--primary" id="btn-join-city">
        Присоединиться к городу «${escapeHtml(cityName)}»
      </button>
      <button type="button" class="action-btn action-btn--ghost" id="btn-cancel-join">
        Отмена
      </button>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    window.MarsTelegram.tgHideBackButton();

    document.getElementById('btn-join-city').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Присоединяем…';
      window.MarsTelegram.tgHapticImpact('medium');

      joinCity(code)
        .then((res) => {
          if (res.ok) {
            window.MarsTelegram.tgHapticNotification('success');
            state.cityName = res.city;
            renderResult(res.city, res.citizenNumber, res.totalCities, code);
          } else {
            window.MarsTelegram.tgHapticNotification('error');
            btn.disabled = false;
            btn.textContent = `Присоединиться к городу «${cityName}»`;
          }
        })
        .catch(() => {
          window.MarsTelegram.tgHapticNotification('error');
          btn.disabled = false;
          btn.textContent = `Присоединиться к городу «${cityName}»`;
        });
    });

    document.getElementById('btn-cancel-join').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      returnToWelcome();
    });
  });
}

function joinCity(code) {
  const user = window.MarsTelegram.tgGetUser();
  const payload = {
    action: 'join',
    code: code,
    telegramUsername: user && user.username ? `@${user.username}` : '',
    telegramId: user && user.id ? String(user.id) : '',
    telegramName: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '',
  };

  if (!CITY_REGISTRY_ENDPOINT) {
    console.warn('[app.js] CITY_REGISTRY_ENDPOINT не задан — присоединение работает в демо-режиме и никуда не сохраняется.');
    return new Promise((resolve) => {
      window.setTimeout(() => resolve({ ok: true, city: 'Демо-город', citizenNumber: null, totalCities: null }), 500);
    });
  }

  return fetch(CITY_REGISTRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

/* ======================================================================
 * 8. Экран ввода названия города (только если конфигурация свободна)
 * ==================================================================== */

function renderCityForm(errorMessage) {
  const summaryRows = QUESTIONS.map((q) => {
    const opt = OPTION_LABELS[q.id][state.answers[q.id]];
    const label = opt ? `${opt.icon ? opt.icon + ' ' : ''}${opt.label}` : '—';
    return `
      <div class="config-summary__row">
        <span class="config-summary__row-label">${q.title}</span>
        <span class="config-summary__row-value">${label}</span>
      </div>
    `;
  }).join('');

  const html = `
    <div class="config-summary">
      <div class="config-summary__title">Ваша конфигурация · ${escapeHtml(state.configCode || getConfigCode())}</div>
      ${summaryRows}
    </div>

    <div class="city-form">
      <label class="city-form__label" for="city-name-input">Придумайте название своего города</label>
      <input
        type="text"
        id="city-name-input"
        class="city-form__input${errorMessage ? ' has-error' : ''}"
        placeholder="Например: Аврора"
        maxlength="40"
        autocomplete="off"
      />
      <p class="city-form__error">${errorMessage || ''}</p>
      <button type="button" class="start-btn city-form__submit" id="city-form-submit">
        <span class="start-btn__label">Проверить и создать</span>
        <span class="start-btn__glyph" aria-hidden="true">→</span>
      </button>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    window.MarsTelegram.tgShowBackButton(() => {
      renderQuestion(TOTAL_STEPS - 1, 'backward');
      navRow.hidden = false;
    });

    const input = document.getElementById('city-name-input');
    const submitBtn = document.getElementById('city-form-submit');
    input.focus({ preventScroll: true });

    submitBtn.addEventListener('click', () => handleCitySubmit(input, submitBtn));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCitySubmit(input, submitBtn);
    });
  });
}

function handleCitySubmit(input, submitBtn) {
  const name = input.value.trim();

  if (!name) {
    renderCityForm('Введите название города.');
    return;
  }

  window.MarsTelegram.tgHapticImpact('light');
  submitBtn.disabled = true;
  submitBtn.querySelector('.start-btn__label').textContent = 'Проверяем…';

  registerCity(name)
    .then((res) => {
      if (res.ok) {
        window.MarsTelegram.tgHapticNotification('success');
        state.cityName = res.city;
        renderResult(res.city, res.citizenNumber, res.totalCities, state.configCode);
      } else if (res.error === 'name_taken') {
        window.MarsTelegram.tgHapticNotification('error');
        renderCityForm('Это название уже занято, выберите другое.');
      } else if (res.error === 'config_taken') {
        // Кто-то создал город с такой же конфигурацией буквально только что.
        window.MarsTelegram.tgHapticNotification('error');
        renderJoinExisting(state.configCode, res.city, res.citizens);
      } else {
        window.MarsTelegram.tgHapticNotification('error');
        renderCityForm('Не удалось связаться с реестром. Попробуйте ещё раз.');
      }
    })
    .catch(() => {
      window.MarsTelegram.tgHapticNotification('error');
      renderCityForm('Не удалось связаться с реестром. Попробуйте ещё раз.');
    });
}

/**
 * Отправляет регистрацию нового города в реестр (Google Apps Script).
 * Демо-режим (без CITY_REGISTRY_ENDPOINT): считает всё свободным и
 * "регистрирует" только локально, без сохранения.
 */
function registerCity(cityName) {
  const user = window.MarsTelegram.tgGetUser();
  const code = state.configCode || getConfigCode();
  const payload = {
    action: 'register',
    city: cityName,
    code: code,
    telegramUsername: user && user.username ? `@${user.username}` : '',
    telegramId: user && user.id ? String(user.id) : '',
    telegramName: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '',
    answers: QUESTIONS.reduce((acc, q) => {
      const opt = OPTION_LABELS[q.id][state.answers[q.id]];
      acc[q.id] = opt ? opt.label : '';
      return acc;
    }, {}),
  };

  if (!CITY_REGISTRY_ENDPOINT) {
    console.warn('[app.js] CITY_REGISTRY_ENDPOINT не задан — регистрация города работает в демо-режиме и никуда не сохраняется. См. Code.gs.');
    return new Promise((resolve) => {
      window.setTimeout(() => resolve({ ok: true, city: cityName, citizenNumber: 1, totalCities: null }), 500);
    });
  }

  // text/plain вместо application/json — так браузер не отправляет
  // предварительный CORS preflight (OPTIONS), который Apps Script Web App
  // не обрабатывает. На стороне Code.gs это обычный JSON.parse(e.postData.contents).
  return fetch(CITY_REGISTRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

/* ======================================================================
 * 9. Экран результата
 * ==================================================================== */

const CIVILIZATION_CHAT_URL = 'https://t.me/+1qrUE7-umGQ3NGMy';
const REGISTRY_OWNER_USERNAME = 'Nickbv';

function renderResult(cityName, citizenNumber, totalCities, code) {
  const climateLabel = (() => {
    const opt = OPTION_LABELS.climate[state.answers.climate];
    return opt ? `${opt.icon ? opt.icon + ' ' : ''}${opt.label}` : '—';
  })();

  const statusLabel = citizenNumber && citizenNumber > 1 ? 'Житель' : 'Первый житель';
  const resolvedCode = code || state.configCode || getConfigCode();

  const html = `
    <div class="result-card">
      <div class="result-card__eyebrow">Ваш город</div>
      <div class="result-card__name">${escapeHtml(cityName)}</div>
      <div class="result-card__rank">Код: ${escapeHtml(resolvedCode)} · 1 из ${TOTAL_CONFIGURATIONS.toLocaleString('ru-RU')} возможных конфигураций</div>

      <div class="result-card__stats">
        <div class="result-card__stat">
          <span class="result-card__stat-icon">🌍</span>
          <span class="result-card__stat-label">Климат</span>
          <span class="result-card__stat-value">${climateLabel}</span>
        </div>
        <div class="result-card__stat">
          <span class="result-card__stat-icon">👤</span>
          <span class="result-card__stat-label">Жителей</span>
          <span class="result-card__stat-value">${citizenNumber || 1}</span>
        </div>
        <div class="result-card__stat">
          <span class="result-card__stat-icon">🏗</span>
          <span class="result-card__stat-label">Статус</span>
          <span class="result-card__stat-value">${statusLabel}</span>
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
      Вы ${statusLabel === 'Первый житель' ? 'стали первым жителем' : 'стали жителем'} города «${escapeHtml(cityName)}» и вошли в Цивилизацию Типа I.<br/><br/>
      ${statusLabel === 'Первый житель'
        ? 'Как только в вашем городе появится второй житель, вам придёт сообщение с чатом города. А пока — добро пожаловать в общий чат цивилизации.'
        : 'Добро пожаловать в общий чат цивилизации — а также в чат самого города, как только он будет создан.'}
    </p>

    <div class="result-actions">
      <button type="button" class="action-btn action-btn--primary" id="btn-civ-chat">
        🌐 Чат цивилизации симбиотов
      </button>
      <button type="button" class="action-btn action-btn--secondary" id="btn-city-chat">
        💬 Чат моего города
      </button>
      <button type="button" class="action-btn action-btn--secondary" id="btn-change-city">
        🔄 Сменить город
      </button>
      <button type="button" class="action-btn action-btn--ghost" id="btn-view-dashboard">
        📊 Посмотреть дашборд цивилизации
      </button>
      <button type="button" class="action-btn action-btn--ghost" id="btn-view-book">
        📖 Архитектура Цивилизации I типа
      </button>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    window.MarsTelegram.tgHideBackButton();

    document.getElementById('btn-civ-chat').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('medium');
      window.MarsTelegram.tgOpenTelegramLink(CIVILIZATION_CHAT_URL);
    });

    document.getElementById('btn-city-chat').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('medium');
      const user = window.MarsTelegram.tgGetUser();
      const who = user
        ? (user.username ? `@${user.username}` : [user.first_name, user.last_name].filter(Boolean).join(' ')) + (user.id ? ` (id: ${user.id})` : '')
        : 'аноним (открыто вне Telegram)';
      const text =
        `Привет! Я создал(а)/присоединился(ась) к городу в Цивилизации Симбиотов.\n` +
        `Пользователь: ${who}\n` +
        `Город: ${cityName}\n` +
        `Код конфигурации: ${resolvedCode}\n` +
        `Климат: ${climateLabel}\n` +
        `Прошу зарегистрировать/подтвердить город в реестре и создать чат.`;
      window.MarsTelegram.tgOpenTelegramLink(`https://t.me/${REGISTRY_OWNER_USERNAME}?text=${encodeURIComponent(text)}`);
    });

    document.getElementById('btn-change-city').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      state.answers = {};
      state.cityName = null;
      state.configCode = null;
      navRow.hidden = false;
      renderQuestion(0, 'backward');
    });

    document.getElementById('btn-view-dashboard').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      renderDashboard({ fromWelcome: false });
    });

    document.getElementById('btn-view-book').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      window.MarsTelegram.tgOpenTelegramLink(BOOK_URL);
    });
  });
}

/* ======================================================================
 * 10. Дашборд цивилизации
 * ==================================================================== */

function renderDashboard(opts) {
  const html = `
    <div class="dashboard">
      <h2 class="dashboard__title">Статус цивилизации</h2>
      <p class="dashboard__subtitle">Обновляется в реальном времени из реестра городов</p>

      <div class="dashboard__grid">
        <div class="dashboard__card">
          <div class="dashboard__card-value" id="dash-cities">—</div>
          <div class="dashboard__card-label">Городов создано</div>
        </div>
        <div class="dashboard__card">
          <div class="dashboard__card-value" id="dash-citizens">—</div>
          <div class="dashboard__card-label">Жителей всего</div>
        </div>
      </div>

      <div id="dash-top-city"></div>

      <div class="dashboard__recent">
        <div class="dashboard__recent-title">Все города · рейтинг по числу жителей</div>
        <div id="dash-city-list">
          <div class="dashboard__recent-item"><span>Загрузка…</span></div>
        </div>
      </div>

      <p class="dashboard__note" id="dash-note"></p>

      <div class="result-actions">
        <button type="button" class="action-btn action-btn--ghost" id="btn-view-book-dash">
          📖 Архитектура Цивилизации I типа
        </button>
        <button type="button" class="action-btn action-btn--secondary" id="btn-dashboard-back">← Назад</button>
      </div>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    window.MarsTelegram.tgHideBackButton();

    document.getElementById('btn-dashboard-back').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      if (opts && opts.fromWelcome) {
        returnToWelcome();
      } else if (state.cityName) {
        renderResult(state.cityName, null, null, state.configCode);
      } else {
        returnToWelcome();
      }
    });

    document.getElementById('btn-view-book-dash').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      window.MarsTelegram.tgOpenTelegramLink(BOOK_URL);
    });

    loadDashboardStats(opts);
  });
}

function loadDashboardStats(opts) {
  const citiesEl = document.getElementById('dash-cities');
  const citizensEl = document.getElementById('dash-citizens');
  const topCityEl = document.getElementById('dash-top-city');
  const listEl = document.getElementById('dash-city-list');
  const noteEl = document.getElementById('dash-note');

  if (!CITY_REGISTRY_ENDPOINT) {
    citiesEl.textContent = '—';
    citizensEl.textContent = '—';
    topCityEl.innerHTML = '';
    listEl.innerHTML = '<div class="dashboard__recent-item"><span>Реестр ещё не подключён</span></div>';
    noteEl.textContent = 'Живые данные появятся здесь после того, как в app.js будет указан CITY_REGISTRY_ENDPOINT (см. Code.gs).';
    return;
  }

  fetch(`${CITY_REGISTRY_ENDPOINT}?action=stats`)
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.ok) throw new Error('bad response');

      const cities = Array.isArray(data.cities) ? data.cities.slice() : [];
      cities.sort((a, b) => (b.citizens || 0) - (a.citizens || 0));

      citiesEl.textContent = data.totalCities ?? cities.length;
      citizensEl.textContent = data.totalCitizens ?? cities.reduce((sum, c) => sum + (c.citizens || 0), 0);

      if (cities.length > 0) {
        const top = cities[0];
        topCityEl.innerHTML = `
          <div class="dashboard__card dashboard__card--clickable" id="dash-top-city-card" style="margin-bottom:22px;">
            <div class="dashboard__card-label" style="margin-bottom:8px;">🏆 Самый населённый город</div>
            <div class="dashboard__card-value" style="font-size:18px;margin-bottom:4px;">${escapeHtml(top.name)}</div>
            <div class="dashboard__card-label">${escapeHtml(top.code || '')} · ${top.citizens || 0} жит.</div>
          </div>
        `;
        document.getElementById('dash-top-city-card').addEventListener('click', () => renderCityDetail(top, opts));
      } else {
        topCityEl.innerHTML = '';
      }

      listEl.innerHTML = cities.length
        ? cities.map((c) => `
            <div class="dashboard__recent-item dashboard__recent-item--clickable" data-code="${escapeHtml(c.code)}">
              <span>${escapeHtml(c.name)} <span style="color:var(--mist);font-family:var(--font-mono);font-size:11px;">${escapeHtml(c.code)}</span></span>
              <span>${c.citizens || 0} жит.</span>
            </div>
          `).join('')
        : '<div class="dashboard__recent-item"><span>Городов пока нет</span></div>';

      listEl.querySelectorAll('.dashboard__recent-item--clickable').forEach((item) => {
        item.addEventListener('click', () => {
          const code = item.dataset.code;
          const city = cities.find((c) => c.code === code);
          if (city) renderCityDetail(city, opts);
        });
      });

      noteEl.textContent = '';
    })
    .catch(() => {
      citiesEl.textContent = '—';
      citizensEl.textContent = '—';
      topCityEl.innerHTML = '';
      listEl.innerHTML = '<div class="dashboard__recent-item"><span>Не удалось загрузить данные</span></div>';
      noteEl.textContent = 'Проверьте подключение или корректность CITY_REGISTRY_ENDPOINT.';
    });
}

/**
 * Карточка отдельного города (из списка/топа дашборда) с полной сборкой
 * по 6 осям, кодом конфигурации и возможностью присоединиться прямо отсюда.
 */
function renderCityDetail(city, dashboardOpts) {
  const rows = QUESTIONS.map((q) => {
    const value = (city.answers && city.answers[q.id]) || '—';
    return `
      <div class="config-summary__row">
        <span class="config-summary__row-label">${q.title}</span>
        <span class="config-summary__row-value">${escapeHtml(value)}</span>
      </div>
    `;
  }).join('');

  const html = `
    <div class="config-summary">
      <div class="config-summary__title">${escapeHtml(city.name)} · ${escapeHtml(city.code)}</div>
      ${rows}
      <div class="config-summary__row">
        <span class="config-summary__row-label">Жителей</span>
        <span class="config-summary__row-value">${city.citizens || 0}</span>
      </div>
    </div>

    <div class="result-actions">
      <button type="button" class="action-btn action-btn--primary" id="btn-join-from-dashboard">
        Присоединиться к городу «${escapeHtml(city.name)}»
      </button>
      <button type="button" class="action-btn action-btn--secondary" id="btn-back-to-dashboard">
        ← К списку городов
      </button>
    </div>
  `;

  transitionScreen(html, 'forward', () => {
    document.getElementById('btn-join-from-dashboard').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Присоединяем…';
      window.MarsTelegram.tgHapticImpact('medium');

      joinCity(city.code)
        .then((res) => {
          if (res.ok) {
            window.MarsTelegram.tgHapticNotification('success');
            state.cityName = res.city;
            state.configCode = city.code;
            renderResult(res.city, res.citizenNumber, res.totalCities, city.code);
          } else {
            window.MarsTelegram.tgHapticNotification('error');
            btn.disabled = false;
            btn.textContent = `Присоединиться к городу «${city.name}»`;
          }
        })
        .catch(() => {
          window.MarsTelegram.tgHapticNotification('error');
          btn.disabled = false;
          btn.textContent = `Присоединиться к городу «${city.name}»`;
        });
    });

    document.getElementById('btn-back-to-dashboard').addEventListener('click', () => {
      window.MarsTelegram.tgHapticImpact('light');
      renderDashboard(dashboardOpts);
    });
  });
}

/* ======================================================================
 * 11. Общий помощник плавных переходов между экранами анкеты
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
