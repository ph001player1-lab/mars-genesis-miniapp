/**
 * Code.gs
 * Бэкенд реестра городов "Цивилизации Симбиотов" на Google Apps Script.
 *
 * ЧТО ДЕЛАЕТ:
 * - doPost: принимает регистрацию нового города из Mini App, проверяет,
 *   что название свободно, дописывает строку в таблицу.
 * - doGet: отдаёт агрегированную статистику для дашборда (сколько городов
 *   создано, сколько жителей, последние города).
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
 *    - Who has access: "Anyone" (Всем, у кого есть ссылка) — это ОБЯЗАТЕЛЬНО,
 *      иначе Mini App не сможет достучаться до скрипта.
 * 6. Нажмите "Развернуть", разрешите доступ (Google покажет предупреждение
 *    "непроверенное приложение" — это нормально для собственного скрипта,
 *    нажмите "Дополнительно" → "Перейти на страницу (небезопасно)").
 * 7. Скопируйте появившийся URL вида
 *    https://script.google.com/macros/s/XXXXXXXX/exec
 * 8. Вставьте этот URL в app.js в константу CITY_REGISTRY_ENDPOINT.
 *
 * Если вы потом измените код скрипта — нужно делать НЕ новое развёртывание,
 * а "Управление развёртываниями" → редактировать текущее → новая версия,
 * иначе URL изменится и придётся снова обновлять app.js.
 *
 * СТРУКТУРА ТАБЛИЦЫ (создаётся автоматически при первом запросе):
 * Timestamp | Telegram Username | Telegram ID | Telegram Имя | Город |
 * Климат | Интимная сфера | Быт | Соц. устройство | Экономика |
 * Мировоззрение | Чат города
 *
 * Последний столбец "Чат города" скрипт оставляет пустым — заполняете
 * его вручную сами, когда создаёте чат города в Telegram.
 */

const SHEET_NAME = 'Реестр городов';

const HEADERS = [
  'Timestamp',
  'Telegram Username',
  'Telegram ID',
  'Telegram Имя',
  'Город',
  'Климат',
  'Интимная сфера',
  'Быт',
  'Соц. устройство',
  'Экономика',
  'Мировоззрение',
  'Чат города',
];

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

function findCityRowIndex_(rows, cityName) {
  const normalized = String(cityName).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    const existing = String(rows[i][4] || '').trim().toLowerCase();
    if (existing === normalized) return i;
  }
  return -1;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST — регистрация нового города.
 * Ожидаемое тело (JSON, как текст — см. app.js):
 * {
 *   action: 'register',
 *   city: 'Название',
 *   telegramUsername: '@ivan',
 *   telegramId: '123456',
 *   telegramName: 'Иван Иванов',
 *   answers: { climate: 'Тропический', intimacy: '...', ... }
 * }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action !== 'register') {
      return jsonOutput_({ ok: false, error: 'unknown_action' });
    }

    const cityName = String(payload.city || '').trim();
    if (!cityName) {
      return jsonOutput_({ ok: false, error: 'empty_name' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getSheet_();
      const rows = getAllRows_(sheet);

      if (findCityRowIndex_(rows, cityName) !== -1) {
        return jsonOutput_({ ok: false, error: 'taken' });
      }

      const answers = payload.answers || {};
      sheet.appendRow([
        new Date(),
        payload.telegramUsername || '',
        payload.telegramId || '',
        payload.telegramName || '',
        cityName,
        answers.climate || '',
        answers.intimacy || '',
        answers.lifestyle || '',
        answers.society || '',
        answers.economy || '',
        answers.worldview || '',
        '', // Чат города — заполняется вручную
      ]);

      const totalCities = rows.length + 1;

      return jsonOutput_({
        ok: true,
        city: cityName,
        citizenNumber: 1,
        totalCities: totalCities,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}

/**
 * GET — статистика для дашборда.
 * ?action=stats
 */
function doGet(e) {
  try {
    const action = e.parameter.action || 'stats';

    if (action !== 'stats') {
      return jsonOutput_({ ok: false, error: 'unknown_action' });
    }

    const sheet = getSheet_();
    const rows = getAllRows_(sheet);

    const totalCities = rows.length;
    const totalCitizens = rows.length; // MVP: 1 первый житель на город

    const recentCities = rows
      .slice(-5)
      .reverse()
      .map((row) => ({ name: row[4], climate: row[5] }));

    return jsonOutput_({
      ok: true,
      totalCities: totalCities,
      totalCitizens: totalCitizens,
      recentCities: recentCities,
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}
