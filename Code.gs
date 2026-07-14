/**
 * Code.gs
 * Бэкенд реестра городов "Цивилизации Симбиотов" на Google Apps Script.
 *
 * ЭТО ОЧЕРЕДНОЕ ОБНОВЛЕНИЕ УЖЕ РАБОТАЮЩЕГО СКРИПТА:
 * - В лист "Реестр городов" добавлен ЕЩЁ ОДИН столбец СТРОГО В КОНЕЦ —
 *   "Роль" (после "Статус"/"Дата выхода" из прошлого обновления). Ничего
 *   существующее не переписывается и не сдвигается.
 * - Появился НОВЫЙ отдельный лист "Города — метрики" (ВВП/DCL по городу).
 *   Он создаётся автоматически при первом запросе, ничего в "Реестре
 *   городов" не трогает.
 * - Обновляете код через "Управление развёртываниями" → редактировать
 *   текущее развёртывание → "Новая версия". URL (.../exec) не меняется.
 *
 * РОЛИ:
 * - "Архитектор" — вы, определяется ЖЁСТКО по ARCHITECT_TELEGRAM_ID
 *   (не по значению в таблице — это невозможно подделать снаружи).
 * - "Мэр" — тот, кто первым СОЗДАЛ город (проставляется автоматически при
 *   регистрации). Если мэр уходит из города — поле роли остаётся пустым
 *   ("нет мэра"), автоматической замены не происходит; вы переназначаете
 *   мэра вручную прямо в таблице (проставив "Мэр" нужному активному
 *   жителю), точно так же, как вписываете ссылку на чат.
 * - Пусто — обычный житель.
 *
 * ВИДИМОСТЬ ССЫЛКИ НА ЧАТ ГОРОДА:
 * - В публичном дашборде (доступен всем) ссылка НИКОГДА не отдаётся.
 * - Сам житель видит ссылку СВОЕГО города (нынешнего и прошлых) в личном
 *   кабинете (myProfile) — это ожидаемо, он и так в нём состоит.
 * - Архитектор (по ARCHITECT_TELEGRAM_ID) видит ссылки всех городов в
 *   дашборде — там же ему показывается очередь городов, ожидающих
 *   создания чата, и служебные счётчики.
 *
 * СТРУКТУРА "Реестр городов":
 * Timestamp | Telegram Username | Telegram ID | Telegram Имя | Город |
 * Код конфигурации | Климат | Интимная сфера | Быт | Соц. устройство |
 * Экономика | Мировоззрение | Чат города | Статус | Дата выхода | Роль
 *
 * СТРУКТУРА "Города — метрики" (создаётся автоматически):
 * Код конфигурации | Город | ВВП ($) | DCL (человеко-дней) | Обновлено
 *
 * Строка в "Города — метрики" появляется САМА, как только у города
 * появляется ссылка на чат (то есть когда вы вписываете её в "Реестр
 * городов") — с нулями в ВВП и DCL. Дальше вы можете править эти два
 * числа прямо в таблице вручную (пока не подключён автоматический расчёт
 * через фичу "Проекты" — она считает ВВП/DCL по факту совместных
 * проектов и ежедневных отметок 1-1-1, но ещё не реализована).
 */

const ARCHITECT_TELEGRAM_ID = '220073523'; // @Nickbv

// Меняется при каждой новой версии — способ проверить в браузере, какой
// код реально обслуживает ваш .../exec прямо сейчас (см. doGet action=version
// ниже). Откройте .../exec?action=version — если видите этот текст, значит
// текущая версия действительно опубликована и живая.
const SCRIPT_VERSION = '2026-07-13 · roles+gdp+dcl+queue';

const SHEET_NAME = 'Реестр городов';
const METRICS_SHEET_NAME = 'Города — метрики';

const HEADERS = [
  'Timestamp',
  'Telegram Username',
  'Telegram ID',
  'Telegram Имя',
  'Город',
  'Код конфигурации',
  'Климат',
  'Интимная сфера',
  'Быт',
  'Соц. устройство',
  'Экономика',
  'Мировоззрение',
  'Чат города',
  'Статус',
  'Дата выхода',
  'Роль',
];

const METRICS_HEADERS = [
  'Код конфигурации',
  'Город',
  'ВВП ($)',
  'DCL (человеко-дней)',
  'Обновлено',
];

// Индексы столбцов (0-based) внутри строки данных "Реестра городов".
const COL = {
  TIMESTAMP: 0,
  USERNAME: 1,
  TELEGRAM_ID: 2,
  TELEGRAM_NAME: 3,
  CITY: 4,
  CODE: 5,
  CLIMATE: 6,
  INTIMACY: 7,
  LIFESTYLE: 8,
  SOCIETY: 9,
  ECONOMY: 10,
  WORLDVIEW: 11,
  CHAT: 12,
  STATUS: 13,
  LEFT_DATE: 14,
  ROLE: 15,
};

const MCOL = { CODE: 0, CITY: 1, GDP: 2, DCL: 3, UPDATED: 4 };

const STATUS_LEFT = 'Покинул';
const STATUS_ACTIVE = 'Активен';
const ROLE_MAYOR = 'Мэр';
const ROLE_ARCHITECT = 'Архитектор';

/* ======================================================================
 * ЛИСТЫ И ЗАГОЛОВКИ
 * ==================================================================== */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sheet, HEADERS);
  return sheet;
}

function getMetricsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(METRICS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(METRICS_SHEET_NAME);
  ensureHeaders_(sheet, METRICS_HEADERS);
  return sheet;
}

/**
 * Аддитивно: если заголовков ещё нет — создаёт их. Если заголовки уже
 * есть, но короче целевого списка — ДОПИСЫВАЕТ недостающие справа, не
 * трогая существующие ячейки заголовков или данных.
 */
function ensureHeaders_(sheet, targetHeaders) {
  const lastCol = sheet.getLastColumn();
  const firstRow = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const hasAnyHeaders = firstRow.some((cell) => String(cell).trim().length > 0);

  if (!hasAnyHeaders) {
    sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
    sheet.getRange(1, 1, 1, targetHeaders.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }

  if (firstRow.length < targetHeaders.length) {
    const missing = targetHeaders.slice(firstRow.length);
    sheet.getRange(1, firstRow.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, firstRow.length + 1, 1, missing.length).setFontWeight('bold');
  }
}

function getAllRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function getAllMetricsRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, METRICS_HEADERS.length).getValues();
}

/* ======================================================================
 * ПОМОЩНИКИ РЕЕСТРА
 * ==================================================================== */

function isActiveRow_(row) {
  const status = String(row[COL.STATUS] || '').trim();
  return status !== STATUS_LEFT; // пусто или "Активен" → активна
}

function findActiveRowsByCode_(rows, code) {
  const normalized = String(code).trim().toUpperCase();
  return rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => isActiveRow_(row) && String(row[COL.CODE] || '').trim().toUpperCase() === normalized);
}

function findActiveRowIndexByCityName_(rows, cityName) {
  const normalized = String(cityName).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (isActiveRow_(rows[i]) && String(rows[i][COL.CITY] || '').trim().toLowerCase() === normalized) return i;
  }
  return -1;
}

function findActiveRowsByTelegramId_(rows, telegramId) {
  const normalized = String(telegramId).trim();
  if (!normalized) return [];
  return rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => isActiveRow_(row) && String(row[COL.TELEGRAM_ID] || '').trim() === normalized);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function markRowInactive_(sheet, dataRowIndex, leftDate) {
  const sheetRow = dataRowIndex + 2;
  sheet.getRange(sheetRow, COL.STATUS + 1).setValue(STATUS_LEFT);
  sheet.getRange(sheetRow, COL.LEFT_DATE + 1).setValue(leftDate || new Date());
}

function deactivateOtherActiveCities_(sheet, rows, telegramId, exceptCode) {
  if (!telegramId) return;
  const mine = findActiveRowsByTelegramId_(rows, telegramId);
  const normalizedExcept = String(exceptCode || '').trim().toUpperCase();
  mine.forEach(({ row, i }) => {
    const rowCode = String(row[COL.CODE] || '').trim().toUpperCase();
    if (rowCode !== normalizedExcept) {
      markRowInactive_(sheet, i, new Date());
    }
  });
}

function mayorDisplayName_(row) {
  return row[COL.TELEGRAM_NAME] || row[COL.USERNAME] || 'житель';
}

/**
 * Собирает список городов: один объект на уникальный код конфигурации
 * СРЕДИ АКТИВНЫХ строк. Города без активных жителей не попадают в список
 * (конфигурация считается свободной для нового города).
 *
 * ВАЖНО: возвращает `chat` ВСЕГДА (внутреннее представление) — решение о
 * том, отдавать ли его наружу вызывающему, принимается ОТДЕЛЬНО в
 * handleStats_, в зависимости от прав запрашивающего. Не путать эти два
 * шага — это и есть механизм "ссылка видна только архитектору".
 */
function aggregateActiveCities_(rows) {
  const byCode = {};
  const order = [];

  rows.forEach((row) => {
    if (!isActiveRow_(row)) return;
    const code = String(row[COL.CODE] || '').trim();
    if (!code) return;
    if (!byCode[code]) {
      byCode[code] = {
        name: row[COL.CITY],
        code: code,
        citizens: 0,
        chat: row[COL.CHAT] || '',
        mayor: '',
        answers: {
          climate: row[COL.CLIMATE] || '',
          intimacy: row[COL.INTIMACY] || '',
          lifestyle: row[COL.LIFESTYLE] || '',
          society: row[COL.SOCIETY] || '',
          economy: row[COL.ECONOMY] || '',
          worldview: row[COL.WORLDVIEW] || '',
        },
      };
      order.push(code);
    }
    byCode[code].citizens += 1;
    if (!byCode[code].chat && row[COL.CHAT]) {
      byCode[code].chat = row[COL.CHAT];
    }
    if (String(row[COL.ROLE] || '').trim() === ROLE_MAYOR) {
      byCode[code].mayor = mayorDisplayName_(row);
    }
  });

  return order.map((code) => byCode[code]);
}

/* ======================================================================
 * ПОМОЩНИКИ МЕТРИК (ВВП / DCL)
 * ==================================================================== */

function getMetricsMap_(metricsSheet) {
  const rows = getAllMetricsRows_(metricsSheet);
  const map = {};
  rows.forEach((row, i) => {
    const code = String(row[MCOL.CODE] || '').trim();
    if (!code) return;
    map[code] = {
      gdp: Number(row[MCOL.GDP]) || 0,
      dcl: Number(row[MCOL.DCL]) || 0,
      rowIndex: i,
    };
  });
  return map;
}

/**
 * Для каждого активного города, у которого уже есть ссылка на чат, но ещё
 * нет строки в листе метрик — создаёт её с нулями. Это и есть механика
 * "когда ссылка создаётся — появляются нули в ВВП/DCL", без необходимости
 * отдельного триггера на редактирование ячейки.
 */
function ensureMetricsRowsForCitiesWithChat_(cities) {
  const metricsSheet = getMetricsSheet_();
  const map = getMetricsMap_(metricsSheet);

  const toCreate = cities.filter((c) => c.chat && !map[c.code]);
  toCreate.forEach((c) => {
    metricsSheet.appendRow([c.code, c.name, 0, 0, new Date()]);
    map[c.code] = { gdp: 0, dcl: 0 };
  });

  return map;
}

/* ======================================================================
 * POST — регистрация / присоединение
 * ==================================================================== */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === 'register') return handleRegister_(payload);
    if (payload.action === 'join') return handleJoin_(payload);
    return jsonOutput_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}

function handleRegister_(payload) {
  const cityName = String(payload.city || '').trim();
  const code = String(payload.code || '').trim();
  const telegramId = String(payload.telegramId || '').trim();

  if (!cityName) return jsonOutput_({ ok: false, error: 'empty_name' });
  if (!code) return jsonOutput_({ ok: false, error: 'empty_code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    let rows = getAllRows_(sheet);

    const existingByCode = findActiveRowsByCode_(rows, code);
    if (existingByCode.length > 0) {
      return jsonOutput_({
        ok: false,
        error: 'config_taken',
        city: existingByCode[0].row[COL.CITY],
        citizens: existingByCode.length,
      });
    }

    if (findActiveRowIndexByCityName_(rows, cityName) !== -1) {
      return jsonOutput_({ ok: false, error: 'name_taken' });
    }

    deactivateOtherActiveCities_(sheet, rows, telegramId, code);

    const answers = payload.answers || {};
    const role = telegramId === ARCHITECT_TELEGRAM_ID ? ROLE_ARCHITECT : ROLE_MAYOR; // первый житель = мэр-создатель
    sheet.appendRow([
      new Date(),
      payload.telegramUsername || '',
      telegramId,
      payload.telegramName || '',
      cityName,
      code,
      answers.climate || '',
      answers.intimacy || '',
      answers.lifestyle || '',
      answers.society || '',
      answers.economy || '',
      answers.worldview || '',
      '', // Чат города — вписывается вручную, когда наберётся 2+ жителей
      STATUS_ACTIVE,
      '',
      role,
    ]);

    rows = getAllRows_(sheet);

    return jsonOutput_({
      ok: true,
      city: cityName,
      code: code,
      chat: '',
      citizenNumber: 1,
      totalCities: aggregateActiveCities_(rows).length,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleJoin_(payload) {
  const code = String(payload.code || '').trim();
  const telegramId = String(payload.telegramId || '').trim();
  if (!code) return jsonOutput_({ ok: false, error: 'empty_code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    let rows = getAllRows_(sheet);
    const existing = findActiveRowsByCode_(rows, code);

    if (existing.length === 0) {
      return jsonOutput_({ ok: false, error: 'not_found' });
    }

    const alreadyHere = existing.find(({ row }) => telegramId && String(row[COL.TELEGRAM_ID] || '').trim() === telegramId);
    if (alreadyHere) {
      return jsonOutput_({
        ok: true,
        city: alreadyHere.row[COL.CITY],
        code: code,
        chat: alreadyHere.row[COL.CHAT] || '',
        citizenNumber: existing.length,
        totalCities: aggregateActiveCities_(rows).length,
      });
    }

    deactivateOtherActiveCities_(sheet, rows, telegramId, code);
    rows = getAllRows_(sheet);
    const refreshedExisting = findActiveRowsByCode_(rows, code);

    const template = refreshedExisting[0].row;
    const existingChat = refreshedExisting.map(({ row }) => row[COL.CHAT]).filter(Boolean)[0] || '';

    sheet.appendRow([
      new Date(),
      payload.telegramUsername || '',
      telegramId,
      payload.telegramName || '',
      template[COL.CITY],
      code,
      template[COL.CLIMATE],
      template[COL.INTIMACY],
      template[COL.LIFESTYLE],
      template[COL.SOCIETY],
      template[COL.ECONOMY],
      template[COL.WORLDVIEW],
      existingChat,
      STATUS_ACTIVE,
      '',
      telegramId === ARCHITECT_TELEGRAM_ID ? ROLE_ARCHITECT : '', // обычный житель, роль пустая
    ]);

    rows = getAllRows_(sheet);
    const finalCount = findActiveRowsByCode_(rows, code).length;

    return jsonOutput_({
      ok: true,
      city: template[COL.CITY],
      code: code,
      chat: existingChat,
      citizenNumber: finalCount,
      totalCities: aggregateActiveCities_(rows).length,
    });
  } finally {
    lock.releaseLock();
  }
}

/* ======================================================================
 * GET — статистика / проверка конфигурации / личный кабинет
 * ==================================================================== */

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'stats';

    if (action === 'version') return jsonOutput_({ ok: true, version: SCRIPT_VERSION, now: new Date().toISOString() });
    if (action === 'checkConfig') return handleCheckConfig_(e);
    if (action === 'stats') return handleStats_(e);
    if (action === 'myProfile') return handleMyProfile_(e);

    return jsonOutput_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}

function handleCheckConfig_(e) {
  const code = String(e.parameter.code || '').trim();
  if (!code) return jsonOutput_({ ok: false, error: 'empty_code' });

  const sheet = getSheet_();
  const rows = getAllRows_(sheet);
  const existing = findActiveRowsByCode_(rows, code);

  if (existing.length === 0) return jsonOutput_({ ok: true, exists: false });
  return jsonOutput_({
    ok: true,
    exists: true,
    city: existing[0].row[COL.CITY],
    citizens: existing.length,
  });
}

/**
 * Публичная статистика для дашборда + (только для архитектора) служебные
 * данные: ссылки на чаты, очередь регистрации, счётчики "без чата"/"без
 * мэра". Права определяются СЕРВЕРОМ по ARCHITECT_TELEGRAM_ID — обычный
 * пользователь физически не может получить эти поля, подделав запрос,
 * т.к. решение принимается здесь, а не на клиенте.
 */
function handleStats_(e) {
  const telegramId = String((e.parameter && e.parameter.telegramId) || '').trim();
  const isArchitect = telegramId === ARCHITECT_TELEGRAM_ID;

  const sheet = getSheet_();
  const rows = getAllRows_(sheet);
  const cities = aggregateActiveCities_(rows);
  const metricsMap = ensureMetricsRowsForCitiesWithChat_(cities);

  const publicCities = cities.map((c) => {
    const metrics = metricsMap[c.code] || { gdp: 0, dcl: 0 };
    const base = {
      name: c.name,
      code: c.code,
      citizens: c.citizens,
      gdp: metrics.gdp,
      dcl: metrics.dcl,
      mayor: c.mayor || '',
      answers: c.answers,
    };
    if (isArchitect) base.chat = c.chat || '';
    return base;
  });

  const result = {
    ok: true,
    totalCities: cities.length,
    totalCitizens: cities.reduce((sum, c) => sum + c.citizens, 0),
    cities: publicCities,
  };

  if (isArchitect) {
    const queue = cities
      .filter((c) => c.citizens >= 2 && !c.chat)
      .sort((a, b) => b.citizens - a.citizens)
      .map((c) => ({ name: c.name, code: c.code, citizens: c.citizens }));

    result.admin = {
      noChatCount: cities.filter((c) => !c.chat).length,
      noMayorCount: cities.filter((c) => !c.mayor).length,
      queue: queue,
    };
  }

  return jsonOutput_(result);
}

/**
 * Личный кабинет: текущий активный город пользователя (если есть, ВСЕГДА
 * со ссылкой на чат — это его собственный город) + прошлые города.
 */
function handleMyProfile_(e) {
  const telegramId = String(e.parameter.telegramId || '').trim();
  if (!telegramId) return jsonOutput_({ ok: false, error: 'empty_telegram_id' });

  const sheet = getSheet_();
  const rows = getAllRows_(sheet);

  const mine = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => String(row[COL.TELEGRAM_ID] || '').trim() === telegramId);

  if (mine.length === 0) {
    return jsonOutput_({ ok: true, hasProfile: false, activeCity: null, pastCities: [] });
  }

  mine.sort((a, b) => new Date(b.row[COL.TIMESTAMP]) - new Date(a.row[COL.TIMESTAMP]));

  const activeOnes = mine.filter(({ row }) => isActiveRow_(row));
  const activeEntry = activeOnes[0] || null;

  let activeCity = null;
  if (activeEntry) {
    const code = String(activeEntry.row[COL.CODE] || '').trim();
    const citizens = findActiveRowsByCode_(rows, code).length;
    activeCity = {
      name: activeEntry.row[COL.CITY],
      code: code,
      chat: activeEntry.row[COL.CHAT] || '',
      citizens: citizens,
    };
  }

  const seenCodes = new Set(activeCity ? [activeCity.code] : []);
  const pastCities = [];
  mine.forEach(({ row }) => {
    if (activeEntry && row === activeEntry.row) return;
    const code = String(row[COL.CODE] || '').trim();
    if (seenCodes.has(code)) return;
    seenCodes.add(code);
    pastCities.push({
      name: row[COL.CITY],
      code: code,
      chat: row[COL.CHAT] || '',
      leftDate: row[COL.LEFT_DATE] || '',
    });
  });

  return jsonOutput_({ ok: true, hasProfile: true, activeCity: activeCity, pastCities: pastCities });
}

/* ======================================================================
 * РУЧНЫЕ ОДНОРАЗОВЫЕ ФУНКЦИИ (не вызываются автоматически, не привязаны
 * к doGet/doPost — запускаются вручную из редактора Apps Script: выберите
 * функцию в выпадающем списке сверху и нажмите "Выполнить")
 * ==================================================================== */

/**
 * Находит случаи, когда один Telegram ID уже числится активным в
 * НЕСКОЛЬКИХ городах (могло возникнуть до появления защиты от этого
 * бага), и оставляет активной только САМУЮ ПОЗДНЮЮ регистрацию — остальные
 * помечает "Покинул". Ничего не удаляет.
 */
function adminCleanupDuplicateActiveCities() {
  const sheet = getSheet_();
  const rows = getAllRows_(sheet);

  const byTelegramId = {};
  rows.forEach((row, i) => {
    const id = String(row[COL.TELEGRAM_ID] || '').trim();
    if (!id || !isActiveRow_(row)) return;
    if (!byTelegramId[id]) byTelegramId[id] = [];
    byTelegramId[id].push({ row, i });
  });

  let fixedCount = 0;
  Object.keys(byTelegramId).forEach((id) => {
    const entries = byTelegramId[id];
    if (entries.length <= 1) return;
    entries.sort((a, b) => new Date(b.row[COL.TIMESTAMP]) - new Date(a.row[COL.TIMESTAMP]));
    const newest = entries[0];
    for (let k = 1; k < entries.length; k++) {
      markRowInactive_(sheet, entries[k].i, newest.row[COL.TIMESTAMP]);
      fixedCount++;
    }
  });

  Logger.log('Исправлено дублей городов: ' + fixedCount);
  return fixedCount;
}

/**
 * Проставляет роль "Мэр" первому (по времени) активному жителю каждого
 * города, если ни у кого в этом городе роль ещё не заполнена. Полезно
 * запустить один раз после обновления кода, чтобы у ваших уже существующих
 * 6 записей появились мэры — до этого момента дашборд будет честно
 * показывать эти города как "без мэра", что тоже нормально и ничего не
 * ломает, если вы решите просто расставить мэров вручную самостоятельно.
 */
function adminAssignFirstMayorsIfMissing() {
  const sheet = getSheet_();
  const rows = getAllRows_(sheet);

  const byCode = {};
  rows.forEach((row, i) => {
    if (!isActiveRow_(row)) return;
    const code = String(row[COL.CODE] || '').trim();
    if (!code) return;
    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ row, i });
  });

  let assignedCount = 0;
  Object.keys(byCode).forEach((code) => {
    const entries = byCode[code];
    const hasMayor = entries.some(({ row }) => String(row[COL.ROLE] || '').trim() === ROLE_MAYOR);
    if (hasMayor) return;

    entries.sort((a, b) => new Date(a.row[COL.TIMESTAMP]) - new Date(b.row[COL.TIMESTAMP]));
    const first = entries[0];
    const sheetRow = first.i + 2;
    sheet.getRange(sheetRow, COL.ROLE + 1).setValue(ROLE_MAYOR);
    assignedCount++;
  });

  Logger.log('Назначено мэров: ' + assignedCount);
  return assignedCount;
}

/**
 * Удаляет ПОВТОРНЫЕ строки одного и того же Telegram ID в ОДНОМ и том же
 * городе (тот же код конфигурации) — это чистый мусор от повторных нажатий
 * "Присоединиться" (например, при неоднократном прохождении анкеты с теми
 * же ответами), а не осмысленная история переездов между городами, поэтому
 * лишние строки именно УДАЛЯЮТСЯ, а не помечаются "Покинул" — в отличие от
 * adminCleanupDuplicateActiveCities, которая разводит по РАЗНЫМ городам и
 * сохраняет историю. Оставляет самую раннюю запись (настоящий момент
 * присоединения), остальные удаляет целиком.
 *
 * Именно эта функция нужна, чтобы поправить, например, случай, когда один
 * человек по ошибке присоединился к одному городу много раз подряд и
 * дашборд считает его за N разных жителей.
 */
function adminMergeDuplicateSameCityJoins() {
  const sheet = getSheet_();
  const rows = getAllRows_(sheet);

  const byKey = {};
  rows.forEach((row, i) => {
    if (!isActiveRow_(row)) return;
    const id = String(row[COL.TELEGRAM_ID] || '').trim();
    const code = String(row[COL.CODE] || '').trim();
    if (!id || !code) return;
    const key = id + '::' + code;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ row, i });
  });

  const sheetRowsToDelete = [];
  Object.keys(byKey).forEach((key) => {
    const entries = byKey[key];
    if (entries.length <= 1) return;
    entries.sort((a, b) => new Date(a.row[COL.TIMESTAMP]) - new Date(b.row[COL.TIMESTAMP]));
    for (let k = 1; k < entries.length; k++) {
      sheetRowsToDelete.push(entries[k].i + 2); // номер строки листа (с учётом заголовка)
    }
  });

  // Удаляем снизу вверх, чтобы номера строк не съезжали по ходу удаления.
  sheetRowsToDelete.sort((a, b) => b - a);
  sheetRowsToDelete.forEach((sheetRow) => sheet.deleteRow(sheetRow));

  Logger.log('Удалено повторных строк (тот же человек, тот же город): ' + sheetRowsToDelete.length);
  return sheetRowsToDelete.length;
}
