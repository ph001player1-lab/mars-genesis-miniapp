/**
 * Code.gs
 * Бэкенд реестра городов "Цивилизации Симбиотов" на Google Apps Script.
 *
 * ЧТО ДЕЛАЕТ:
 * - doPost action=register: создаёт НОВЫЙ город — но только если ни его
 *   название, ни его буквенный КОД КОНФИГУРАЦИИ (сборка по 6 осям) ещё
 *   не заняты. Совпадение конфигурации — это не то же самое, что занятое
 *   название: два разных человека не должны получить два города с
 *   идентичными 6 характеристиками.
 * - doPost action=join: добавляет ещё одного жителя в СУЩЕСТВУЮЩИЙ город
 *   по его коду конфигурации.
 * - doGet action=checkConfig: сообщает Mini App, существует ли уже город
 *   с данным кодом, ДО того как показывать форму ввода названия.
 * - doGet action=stats: агрегированная статистика + список всех городов
 *   с числом жителей для дашборда.
 *
 * КАК РАЗВЕРНУТЬ (один раз, ~10 минут):
 * 1. Откройте вашу таблицу:
 *    https://docs.google.com/spreadsheets/d/19tLa0ITNIl63bAuCrxqjddqN9voXFbU8mCkSnKgZEds/edit
 * 2. Меню "Расширения" → "Apps Script".
 * 3. Удалите содержимое открывшегося файла Code.gs и вставьте целиком этот файл.
 * 4. Сохраните (значок дискеты).
 * 5. "Развернуть" (Deploy) → "Новое развёртывание" (New deployment).
 *    - Тип: "Веб-приложение" (Web app).
 *    - Execute as: "Me" (вы).
 *    - Who has access: "Anyone" (Всем, у кого есть ссылка) — ОБЯЗАТЕЛЬНО.
 * 6. Нажмите "Развернуть", разрешите доступ (предупреждение о "непроверенном
 *    приложении" — это нормально для собственного скрипта: "Дополнительно"
 *    → "Перейти на страницу (небезопасно)").
 * 7. Скопируйте URL вида https://script.google.com/macros/s/XXXXXXXX/exec
 * 8. Вставьте этот URL в app.js в константу CITY_REGISTRY_ENDPOINT.
 *
 * Если меняете код скрипта ПОСЛЕ разворачивания — используйте "Управление
 * развёртываниями" → редактировать текущее → новая версия, а не новое
 * развёртывание, иначе URL изменится.
 *
 * СТРУКТУРА ТАБЛИЦЫ (создаётся автоматически при первом запросе):
 * Timestamp | Telegram Username | Telegram ID | Telegram Имя | Город |
 * Код конфигурации | Климат | Интимная сфера | Быт | Соц. устройство |
 * Экономика | Мировоззрение | Чат города
 *
 * У каждого жителя города — своя строка (одинаковые Город/Код у всех
 * жителей одного города). "Чат города" заполняете вручную сами; при
 * присоединении новых жителей скрипт копирует туда уже вписанное значение,
 * если оно есть, чтобы оно было видно в каждой строке города.
 */

const SHEET_NAME = 'Реестр городов';

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
];

// Индексы столбцов (0-based) внутри строки данных длиной HEADERS.length.
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
};

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = firstRow.some((cell) => String(cell).trim().length > 0);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function getAllRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function findRowsByCode_(rows, code) {
  const normalized = String(code).trim().toUpperCase();
  return rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => String(row[COL.CODE] || '').trim().toUpperCase() === normalized);
}

function findRowIndexByCityName_(rows, cityName) {
  const normalized = String(cityName).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.CITY] || '').trim().toLowerCase() === normalized) return i;
  }
  return -1;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Собирает список городов из строк таблицы: один объект на уникальный
 * код конфигурации, с числом жителей = числу строк с этим кодом.
 */
function aggregateCities_(rows) {
  const byCode = {};
  const order = [];

  rows.forEach((row) => {
    const code = String(row[COL.CODE] || '').trim();
    if (!code) return;
    if (!byCode[code]) {
      byCode[code] = {
        name: row[COL.CITY],
        code: code,
        citizens: 0,
        chat: row[COL.CHAT] || '',
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
  });

  return order.map((code) => byCode[code]);
}

/**
 * POST — регистрация нового города ИЛИ присоединение к существующему.
 *
 * register:
 * {
 *   action: 'register',
 *   city: 'Название',
 *   code: 'TRP-FRE-SOL-ANA-UBI-SCI',
 *   telegramUsername, telegramId, telegramName,
 *   answers: { climate: 'Тропический', intimacy: '...', ... }
 * }
 *
 * join:
 * {
 *   action: 'join',
 *   code: 'TRP-FRE-SOL-ANA-UBI-SCI',
 *   telegramUsername, telegramId, telegramName
 * }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'register') {
      return handleRegister_(payload);
    }
    if (payload.action === 'join') {
      return handleJoin_(payload);
    }
    return jsonOutput_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}

function handleRegister_(payload) {
  const cityName = String(payload.city || '').trim();
  const code = String(payload.code || '').trim();

  if (!cityName) return jsonOutput_({ ok: false, error: 'empty_name' });
  if (!code) return jsonOutput_({ ok: false, error: 'empty_code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const rows = getAllRows_(sheet);

    // Конфигурация (все 6 характеристик совпадают) уже существует —
    // отдельный город не создаётся, нужно присоединяться.
    const existingByCode = findRowsByCode_(rows, code);
    if (existingByCode.length > 0) {
      return jsonOutput_({
        ok: false,
        error: 'config_taken',
        city: existingByCode[0].row[COL.CITY],
        citizens: existingByCode.length,
      });
    }

    // Название занято другой конфигурацией.
    if (findRowIndexByCityName_(rows, cityName) !== -1) {
      return jsonOutput_({ ok: false, error: 'name_taken' });
    }

    const answers = payload.answers || {};
    sheet.appendRow([
      new Date(),
      payload.telegramUsername || '',
      payload.telegramId || '',
      payload.telegramName || '',
      cityName,
      code,
      answers.climate || '',
      answers.intimacy || '',
      answers.lifestyle || '',
      answers.society || '',
      answers.economy || '',
      answers.worldview || '',
      '', // Чат города — заполняется вручную
    ]);

    return jsonOutput_({
      ok: true,
      city: cityName,
      code: code,
      citizenNumber: 1,
      totalCities: aggregateCities_(getAllRows_(sheet)).length,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleJoin_(payload) {
  const code = String(payload.code || '').trim();
  if (!code) return jsonOutput_({ ok: false, error: 'empty_code' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet_();
    const rows = getAllRows_(sheet);
    const existing = findRowsByCode_(rows, code);

    if (existing.length === 0) {
      return jsonOutput_({ ok: false, error: 'not_found' });
    }

    const template = existing[0].row;
    const existingChat = existing.map(({ row }) => row[COL.CHAT]).filter(Boolean)[0] || '';

    sheet.appendRow([
      new Date(),
      payload.telegramUsername || '',
      payload.telegramId || '',
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
    ]);

    return jsonOutput_({
      ok: true,
      city: template[COL.CITY],
      code: code,
      citizenNumber: existing.length + 1,
      totalCities: aggregateCities_(getAllRows_(sheet)).length,
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * GET
 * ?action=stats       — агрегаты + список городов для дашборда
 * ?action=checkConfig&code=... — существует ли уже такая конфигурация
 */
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'stats';

    if (action === 'checkConfig') {
      const code = String(e.parameter.code || '').trim();
      if (!code) return jsonOutput_({ ok: false, error: 'empty_code' });

      const sheet = getSheet_();
      const rows = getAllRows_(sheet);
      const existing = findRowsByCode_(rows, code);

      if (existing.length === 0) {
        return jsonOutput_({ ok: true, exists: false });
      }
      return jsonOutput_({
        ok: true,
        exists: true,
        city: existing[0].row[COL.CITY],
        citizens: existing.length,
      });
    }

    if (action === 'stats') {
      const sheet = getSheet_();
      const rows = getAllRows_(sheet);
      const cities = aggregateCities_(rows);

      return jsonOutput_({
        ok: true,
        totalCities: cities.length,
        totalCitizens: rows.length,
        cities: cities,
      });
    }

    return jsonOutput_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}
