// Memory Builder — Service Worker (background)
// Відповідає за: архівування, Drive API, ліміти, системний промпт

import { getStorage } from '../utils/storage.js';
import { buildShort, buildMemorySentence } from '../utils/ai.js';
import { buildMemoryTxt } from '../utils/memory.js';


// ── SW лог (console + повідомлення в popup) ───────────────────────────────────
function swLog(msg) {
  console.log(msg);
  chrome.runtime.sendMessage({ type: 'SW_LOG', text: msg }).catch(() => {});
}

// ── Перевірка токену OneDrive ─────────────────────────────────────────────────
async function checkTokenExpiry() {
  const saved = await chrome.storage.local.get('mbSettings');
  const s = saved.mbSettings;
  if (s?.storageSettings?.storage !== 'onedrive' && s?.storage !== 'onedrive') return;
  const tokenSavedAt = s?.storageSettings?.onedrive?.tokenSavedAt;
  if (!tokenSavedAt) return;
  const ageMin = Math.floor((Date.now() - tokenSavedAt) / 1000 / 60);
  if (ageMin >= 40 && ageMin < 45) {
    chrome.notifications.create('token_expiry', {
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title: '⚠️ OneDrive токен закінчується',
      message: `Токен діє ще ~${60 - ageMin} хв. Оновіть в Graph Explorer.`,
      buttons: [{ title: 'Відкрити Graph Explorer' }],
      requireInteraction: true,
    });
  }
  if (ageMin >= 55) {
    chrome.notifications.create('token_expired', {
      type: 'basic',
      iconUrl: '/icons/icon48.png',
      title: '🔴 OneDrive токен протух',
      message: 'Оновіть access_token в Graph Explorer → Access token.',
      buttons: [{ title: 'Відкрити Graph Explorer' }],
      requireInteraction: true,
    });
  }
}

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if ((notifId === 'token_expiry' || notifId === 'token_expired') && btnIdx === 0) {
    chrome.tabs.create({ url: 'https://developer.microsoft.com/en-us/graph/graph-explorer' });
  }
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === 'token_expiry' || notifId === 'token_expired') {
    chrome.tabs.create({ url: 'https://developer.microsoft.com/en-us/graph/graph-explorer' });
  }
});

// ── Безпечна відправка повідомлень ────────────────────────────────────────────
function safeSendMessage(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
  } catch (_) {}
}


// ── Run Log ───────────────────────────────────────────────────────────────────
let runLog = [];
let runLogStartedAt = null;

function mbLogCapture(level, args) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ` +
      args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
    runLog.push(line);
  } catch (_) {}
}

const __mbConsoleLog = console.log.bind(console);
const __mbConsoleWarn = console.warn.bind(console);
const __mbConsoleError = console.error.bind(console);

console.log = (...args) => { mbLogCapture('LOG', args); __mbConsoleLog(...args); };
console.warn = (...args) => { mbLogCapture('WARN', args); __mbConsoleWarn(...args); };
console.error = (...args) => { mbLogCapture('ERROR', args); __mbConsoleError(...args); };


// ── Переривана пауза ─────────────────────────────────────────────────────────
async function interruptibleDelay(seconds) {
  const step = 500;
  const total = seconds * 1000;
  let elapsed = 0;
  while (elapsed < total) {
    if (!processingState.running) return false;
    await new Promise(r => setTimeout(r, Math.min(step, total - elapsed)));
    elapsed += step;
  }
  return true;
}

// ── Стан обробки ──────────────────────────────────────────────────────────────
let processingState = {
  running: false,
  paused: false,
  sessions: [],
  index: 0,
  archiveSize: 0,
  archiveStart: 1,
  sysIndex: 1,
  config: null,
  metaUpdating: false,
};

// ── Слухачі повідомлень ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'START_PROCESSING':
      startProcessing(msg.config).then(sendResponse);
      return true;

    case 'RESUME_PROCESSING':
      resumeProcessing().then(sendResponse);
      return true;

    case 'STOP_PROCESSING':
      stopProcessing();
      sendResponse({ ok: true });
      break;

    case 'CLEAR_BADGE':
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
      break;

    case 'GET_STATE':
      sendResponse(processingState);
      break;

    case 'GET_SESSIONS':
      getSessions(msg.platform).then(sendResponse);
      return true;

    case 'INJECT_SYSTEM_PROMPT':
      injectSystemPrompt(msg.tabId, msg.prompt).then(sendResponse);
      return true;

    case 'CHECK_LIMIT':
      checkLimit(msg.apiKey, msg.platform, msg.openrouterModel).then(sendResponse);
      return true;

    case 'TOKEN_UPDATED':
      // Оновлюємо час вставки токену
      chrome.storage.local.get('mbSettings').then(saved => {
        const s = saved.mbSettings || {};
        s.storageSettings = s.storageSettings || {};
        s.storageSettings.onedrive = s.storageSettings.onedrive || {};
        s.storageSettings.onedrive.tokenSavedAt = Date.now();
        chrome.storage.local.set({ mbSettings: s });
        chrome.notifications.clear('token_expiry');
        chrome.notifications.clear('token_expired');
      });
      return false;

    case 'TOKEN_EXPIRED_STOP':
      processingState.running = false;
      chrome.storage.local.set({ processingState });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      saveRunLog(processingState.config || {}, 'TOKEN_EXPIRED');
      safeSendMessage({ type: 'TOKEN_EXPIRED_STOP' });
      return false;

    case 'CREATE_BOOK':
      createBook(msg.config, msg.bookConfig).then(sendResponse);
      return true;

    case 'DETECT_SHORT_FORMAT':
      detectShortFormat(msg.config).then(sendResponse);
      return true;

    case 'GET_EXISTING':
      computeExistingNums(msg.config)
        .then(set => sendResponse([...set]))
        .catch((e) => { console.warn('[SW] GET_EXISTING помилка:', e.message); sendResponse([]); });
      return true;
  }
});

// ── Номери сесій, які вже повністю заархівовані на диску ──────────────────────
// Незалежна від auto-режиму перевірка: читає full/short/memory і повертає Set
// номерів, що вважаються "existing" з урахуванням archiveMode/shortFormat.
// Використовується popup.js для коректної роботи режимів 'new' та ручного вибору.
async function computeExistingNums(config) {
  const storage = getStorage(config.storage);
  const [existingFullFiles, existingShortFiles] = await Promise.all([
    storage.listFolder(config.cloudId, `${config.platform}/full`).catch(() => []),
    storage.listFolder(config.cloudId, `${config.platform}/short`).catch(() => []),
  ]);

  const existingFullNums = new Set();
  existingFullFiles.forEach(f => {
    const m = f.name.match(/^full_(\d+)\.txt$/);
    if (m) existingFullNums.add(parseInt(m[1]));
  });

  const existingShortNums = new Set();
  for (const f of existingShortFiles) {
    const m = f.name.match(/^short_(\d+)\.txt$/);
    if (m) existingShortNums.add(parseInt(m[1]));
  }

  const existingBlockNums = new Set();
  const blockFiles = existingShortFiles.filter(f => /^short_(\d+)-(\d+)\.txt$/.test(f.name));
  await Promise.all(blockFiles.map(async (f) => {
    try {
      const content = await storage.read(config.cloudId, `${config.platform}/short/${f.name}`);
      if (content) {
        for (const line of content.split('\n')) {
          const m = line.match(/^SESSION_NUM:\s*(\d+)/);
          if (m) existingBlockNums.add(parseInt(m[1]));
        }
      }
    } catch (_) {
      // не вдалось прочитати блок — не рахуємо номери з нього як existing
    }
  }));

  const shortFormat = config.shortFormat || 'both';

  const existingMemoryNums = new Set();
  try {
    const memoryText = await storage.read(config.cloudId, `${config.platform}/memory.txt`);
    if (memoryText) {
      for (const line of memoryText.split('\n')) {
        const m = line.match(/^(\d+)\s*\|/);
        if (m) existingMemoryNums.add(parseInt(m[1]));
      }
    }
  } catch (_) {}

  // Кандидати — усі номери, що фігурують хоч десь
  const candidates = new Set([
    ...existingFullNums, ...existingShortNums, ...existingBlockNums, ...existingMemoryNums,
  ]);

  const existing = new Set();
  for (const num of candidates) {
    const fullMissing = !existingFullNums.has(num);

    let shortMissing;
    if (shortFormat === 'singles') {
      shortMissing = !existingShortNums.has(num);
    } else if (shortFormat === 'blocks') {
      shortMissing = !existingBlockNums.has(num);
    } else {
      shortMissing = !existingShortNums.has(num) || !existingBlockNums.has(num);
    }

    const memoryMissing = !existingMemoryNums.has(num);

    const isComplete = config.archiveMode === 'full_only'
      ? !fullMissing
      : (!fullMissing && !shortMissing && !memoryMissing);

    if (isComplete) existing.add(num);
  }

  return existing;
}

// ── Alarm для автовідновлення після ліміту ────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'resume_after_limit') {
    if (!processingState.running) return;
    processingState.paused = false;
    resumeProcessing();
    safeSendMessage({ type: 'LIMIT_RESUMED' });
  }
});

// ── Головна функція обробки ───────────────────────────────────────────────────
// ── Session Map: стабільна нумерація сесій ───────────────────────────────────
async function loadSessionMap(config) {
  const storage = getStorage(config.storage);
  const mapPath = `${config.platform}/session_map.txt`;
  const map = new Map(); // sessionId → num
  try {
    const text = await storage.read(config.cloudId, mapPath);
    if (text) {
      for (const line of text.split('\n')) {
        const m = line.match(/^([a-f0-9_-]+)\s*→\s*(\d+)$/);
        if (m) map.set(m[1], parseInt(m[2]));
      }
      swLog(`[SW] session_map loaded: ${map.size} records`);
    }
  } catch (_) {
    console.log(`[SW] session_map не знайдено — створюємо новий`);
  }
  return map;
}

async function saveSessionMap(config, map) {
  const storage = getStorage(config.storage);
  const mapPath = `${config.platform}/session_map.txt`;
  const lines = [...map.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id, num]) => `${id} → ${String(num).padStart(4, '0')}`);
  const content = `=== SESSION MAP ===\nОновлено: ${new Date().toLocaleString('uk-UA')}\nЗаписів: ${map.size}\n===\n\n` + lines.join('\n');
  await storage.save(config.cloudId, mapPath, content);
  console.log(`[SW] session_map saved: ${map.size} records`);
}



// ── Session Meta ──────────────────────────────────────────────────────────────
async function loadSessionMeta(config) {
  const storage = getStorage(config.storage);
  const path = `${config.platform}/session_meta.json`;
  try {
    return JSON.parse(await storage.read(config.cloudId, path));
  } catch (_) {
    return {};
  }
}

async function saveSessionMeta(config, meta) {
  const storage = getStorage(config.storage);
  const path = `${config.platform}/session_meta.json`;
  await storage.save(config.cloudId, path, JSON.stringify(meta, null, 2));
}

async function updateSessionMeta(config, sessionId, index, chars) {
  if (processingState.metaUpdating) {
    console.warn('[META] пропускаю паралельне оновлення');
    return;
  }

  processingState.metaUpdating = true;

  try {
    const meta = await loadSessionMeta(config);
    const key = String(index);
    const now = new Date().toISOString();

    if (!meta[key]) {
      meta[key] = {
        sessionId,
        originalChars: chars,
        lastChars: chars,
        createdAt: now,
        verifiedAt: now
      };
    } else {
      if (meta[key].originalChars === undefined && meta[key].chars !== undefined) {
        meta[key].originalChars = meta[key].chars;
      }

      meta[key].lastChars = chars;
      meta[key].verifiedAt = now;
    }

    await saveSessionMeta(config, meta);

    console.log(`[META] записано #${index}: ${chars} символів`);
  } catch (e) {
    console.warn('[META] помилка:', e);
  } finally {
    processingState.metaUpdating = false;
  }
}

async function applySessionMap(sessions, config) {
  const map = await loadSessionMap(config);
  let maxNum = map.size > 0 ? Math.max(...map.values()) : 0;
  let changed = false;

  for (const s of sessions) {
    if (map.has(s.id)) {
      s.index = map.get(s.id);
    } else {
      maxNum++;
      map.set(s.id, maxNum);
      s.index = maxNum;
      changed = true;
      console.log(`[SW] session_map: нова сесія ${s.id} → ${maxNum}`);
    }
  }

  if (changed || map.size > 0) {
    await saveSessionMap(config, map);
  }

  return sessions;
}


async function saveRunLog(config, reason = 'manual') {
  const logText = runLog.join('\n');

  try {
    const storage = getStorage(config.storage);
    const ts = new Date().toISOString().replace(/[:]/g,'-');
    const logName = `run_${reason}_${ts}.log`;

    await storage.save(
      config.cloudId,
      `${config.platform}/_system/${logName}`,
      logText
    );

    console.log('[RUN] Лог збережено:', logName);

  } catch (e) {
    console.error('[RUN] Не вдалося зберегти лог у сховище:', e);

    try {
      const key = `runlog_${Date.now()}`;

      await chrome.storage.local.set({
        [key]: {
          reason,
          createdAt: new Date().toISOString(),
          content: logText
        }
      });

      console.log('[RUN] Лог збережено у chrome.storage.local:', key);

    } catch (fallbackErr) {
      console.error('[RUN] Fallback також не спрацював:', fallbackErr);
    }
  }
}

async function startProcessing(config) {
  runLog = [];
  runLogStartedAt = new Date();
  console.log('[RUN] Старт обробки');
  console.log('[SW] config.storage:', config.storage, 'config.cloudId:', config.cloudId);
  try {
  // Для shorts_only без авто — визначаємо скільки шортів вже є
  let startIndex = 0;
  if (config.archiveMode === 'shorts_only' && config.mode !== 'auto') {
    startIndex = await countExistingShorts(config);
    console.log(`[SW] Shorts_only: пропускаємо перші ${startIndex} сесій (вже є)`);
  }

  // Сесії вже відсортовані за created_at від старих до нових у claude.js
  let sessionsToProcess = [...config.sessions];

  // Застосовуємо стабільну нумерацію через session_map
  const useSessionMap = ['gemini', 'claude', 'deepseek'].includes(config.platform);
  if (useSessionMap) {
    sessionsToProcess = await applySessionMap(sessionsToProcess, config);
    swLog('[SW] session_map застосовано');
  }

  if (config.skipLast && sessionsToProcess.length > 0) {
    const maxIdx = Math.max(...sessionsToProcess.map(s => s.index));
    sessionsToProcess = sessionsToProcess.filter(s => s.index !== maxIdx);
    console.log(`[SW] skipLast: пропущено сесію з index ${maxIdx}`);
  }
  console.log('[SW] Перші 3 сесії:', sessionsToProcess.slice(0,3).map(s => `idx:${s.index} date:${s.createdAt?.slice(0,10)}`));
  let maxSysIndex = 0;
  // Перевірка диска потрібна не лише для 'auto': у 'new'/'select' (і дефолтному
  // 'auto'-фолбеку в popup) сесії, яким уже присвоєно номер, теж можуть мати
  // готовий full, але відсутній short/memory (наприклад, обробку перервало на
  // AI-кроці). Без цієї перевірки processNext вважає такі сесії повністю новими
  // і даремно перезаписує вже наявний full. 'all' — свідомий виняток: користувач
  // явно просить переробити геть усе, включно з full.
  if (config.mode !== 'all') {
    try {
      const storage = getStorage(config.storage);
      const [existingFullFiles, existingShortFiles] = await Promise.all([
        storage.listFolder(config.cloudId, `${config.platform}/full`),
        storage.listFolder(config.cloudId, `${config.platform}/short`).catch(() => []),
      ]);

      // Будуємо Set номерів де є фул — з імен файлів full/full_NNN.txt
      const existingFullNums = new Set();
      existingFullFiles.forEach(f => {
        const m = f.name.match(/^full_(\d+)\.txt$/);
        if (m) existingFullNums.add(parseInt(m[1]));
      });
      console.log(`[SW] existingFullNums: ${existingFullNums.size} records`);

      // Визначаємо maxSysIndex з _system/ для продовження нумерації
      try {
        const sysFiles = await storage.listFolder(config.cloudId, `${config.platform}/_system`);
        sysFiles.forEach(f => {
          const m = f.name.match(/^sys_(\d+)_processing_/);
          if (m) {
            const n = parseInt(m[1]);
            if (n > maxSysIndex) maxSysIndex = n;
          }
        });
        console.log(`[SW] maxSysIndex з _system: ${maxSysIndex}`);
      } catch(e) {
        console.warn(`[SW] Auto: не вдалося прочитати _system:`, e.message);
      }

      // Будуємо Set номерів де є окремий шорт (short_NNN.txt)
      const existingShortNums = new Set();
      for (const f of existingShortFiles) {
        const m = f.name.match(/^short_(\d+)\.txt$/);
        if (m) existingShortNums.add(parseInt(m[1]));
      }

      // Будуємо Set номерів що є в блоках (short_NNN-MMM.txt) — читаємо реальний вміст
      const existingBlockNums = new Set();
      const blockFiles = existingShortFiles.filter(f => /^short_(\d+)-(\d+)\.txt$/.test(f.name));
      await Promise.all(blockFiles.map(async (f) => {
        try {
          const content = await storage.read(config.cloudId, `${config.platform}/short/${f.name}`);
          if (content) {
            for (const line of content.split('\n')) {
              const m = line.match(/^SESSION_NUM:\s*(\d+)/);
              if (m) existingBlockNums.add(parseInt(m[1]));
            }
          }
        } catch (_) {
          // Якщо не вдалося прочитати — вважаємо блок порожнім (перегенеруємо)
          console.warn(`[SW] Не вдалося прочитати блок ${f.name} — буде перегенеровано`);
        }
      }));

      const shortFormat = config.shortFormat || 'both';

      // Будуємо Set номерів що є в memory.txt
      const existingMemoryNums = new Set();
      try {
        const memoryText = await storage.read(config.cloudId, `${config.platform}/memory.txt`);
        if (memoryText) {
          for (const line of memoryText.split('\n')) {
            const m = line.match(/^(\d+)\s*\|/);
            if (m) existingMemoryNums.add(parseInt(m[1]));
          }
        }
      } catch (_) {}

      const numStart = config.numStart || 1;
      sessionsToProcess = sessionsToProcess
        .map((session) => ({ ...session, originalNum: session.index }))
        .map(session => {
          const num = session.originalNum;
          const fullMissing = !existingFullNums.has(num);

          // shortMissing залежить від обраного формату
          let shortMissing;
          if (shortFormat === 'singles') {
            shortMissing = !existingShortNums.has(num);
          } else if (shortFormat === 'blocks') {
            shortMissing = !existingBlockNums.has(num);
          } else { // both
            shortMissing = !existingShortNums.has(num) || !existingBlockNums.has(num);
          }

          const memoryMissing = !existingMemoryNums.has(num);

          // В режимі full_only — шорти та memory не враховуємо, прапорці не потрібні
          if (config.archiveMode === 'full_only') {
            session._diskMissing = fullMissing;
            return session;
          }

          if (!fullMissing && !shortMissing && memoryMissing) {
            session._memoryOnly = true;
          } else if (!fullMissing && (shortMissing || memoryMissing)) {
            session._shortOnly = true;
          }
          session._diskMissing = fullMissing || shortMissing || memoryMissing;
          return session;
        });

      // Відсіюємо повністю готові сесії — лише для 'auto' (там це і є сенс режиму:
      // "добери те, чого бракує"). Для 'new'/'select' список сесій уже визначено
      // раніше (popup передав саме ті, що треба) — тут ми лише розставили прапорці
      // _shortOnly/_memoryOnly вище, щоб не чіпати вже наявний full.
      if (config.mode === 'auto') {
        sessionsToProcess = sessionsToProcess.filter(session => session._diskMissing);
        swLog(`[SW] Авто-режим: знайдено ${sessionsToProcess.length} пропущених з ${config.sessions.length}`);
        safeSendMessage({ type: 'MISSING_FOUND', count: sessionsToProcess.length });
      }
    } catch (err) {
      // Раніше тут просто писали попередження в консоль і йшли далі, вважаючи
      // диск порожнім — бо listFolder() на помилках авторизації/мережі мовчки
      // повертав []. Тепер драйвери (drive.js) кидають реальну помилку, тож
      // "не вдалося перевірити" більше не можна плутати з "на диску нічого
      // немає": getOrCreateFolder() сам створює відсутні папки, тож дійсно
      // порожній/новий архів сюди взагалі не потрапляє як виняток. Якщо ми
      // тут — це справжня системна проблема (токен/мережа), і продовжувати,
      // вдаючи порожній диск, ризикує задвоєнням чи перезаписом наявних файлів.
      console.error('[SW] Перевірка диска провалилась — зупиняємось:', err.message);
      await saveRunLog(config, 'STORAGE_ERROR');
      safeSendMessage({ type: 'STORAGE_ERROR', message: `Не вдалося перевірити наявні файли: ${err.message}` });
      return { stopped: true };
    }
  }

  // Визначаємо sysIndex — продовжуємо з максимального існуючого
  if (maxSysIndex === 0 && config.mode !== 'auto') {
    try {
      const storage = getStorage(config.storage);
      const sysFiles = await storage.listFolder(config.cloudId, `${config.platform}/_system`);
      maxSysIndex = 0;
      sysFiles.forEach(f => {
        const m = f.name.match(/^sys_(\d+)_processing_/);
        if (m) { const n = parseInt(m[1]); if (n > maxSysIndex) maxSysIndex = n; }
      });
      swLog(`[SW] sysIndex старт: ${maxSysIndex + 1}`);
    } catch(e) {
      maxSysIndex = 0;
    }
  }

  processingState = {
    running: true,
    paused: false,
    sessions: sessionsToProcess,
    index: startIndex,
    archiveSize: 0,
    archiveStart: config.numStart || 1,
    archiveEnd: config.numStart || 1,
    sysIndex: maxSysIndex + 1,
    config,
  };

  await chrome.storage.local.set({ processingState });
  chrome.action.setBadgeText({ text: '...' });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  return await processNext();
  } catch (err) {
    // Раніше будь-яка помилка до входу у внутрішній try (наприклад, з
    // saveSessionMap — session_map.txt зберігається ДО перевірки диска)
    // просто "губила" весь виклик startProcessing: popup ніколи не отримував
    // жодного повідомлення й лишався на екрані "Ініціалізація..." назавжди.
    // Тепер будь-який непійманий збій усередині функції явно повідомляється.
    console.error('[SW] startProcessing: непіймана помилка — зупиняємось:', err.message);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    try { await saveRunLog(config, 'STORAGE_ERROR'); } catch (_) {}
    const type = err.message?.startsWith('STORAGE_ERROR') ? 'STORAGE_ERROR' : 'ERROR_STOP';
    safeSendMessage({ type, message: err.message || 'невідома помилка' });
    return { stopped: true };
  }
}

async function resumeProcessing() {
  const saved = await chrome.storage.local.get('processingState');
  if (saved.processingState) {
    processingState = { ...saved.processingState, running: true, paused: false };
  }
  return await processNext();
}

async function processNext() {
  const { sessions, index, config } = processingState;

  if (!processingState.running) return { stopped: true };

  if (index >= sessions.length) {
    await finalize();
    return { done: true };
  }

  const session = sessions[index];
  const currentNum = session.originalNum || session.index || (config.numStart || 1) + processingState.index;

  try {
    if (session._memoryOnly) {
      // Є фул і шорт, але немає запису в memory
      const storage = getStorage(config.storage);
      try {
        const shortText = await storage.read(config.cloudId, `${config.platform}/short/short_${pad(currentNum, config.numDigits || 4)}.txt`);
        session.short = shortText;
        const memMatch = shortText?.match(/=MEMORY=\s*([\s\S]*?)(?==TAGS=|$)/);
        if (memMatch) {
          session.memory = memMatch[1].trim();
        } else {
          // Старий формат — обрізаємо заголовок і генеруємо через AI
          const shortBody = shortText?.replace(/^(SESSION_ID:[^\n]*\n)?(SESSION_NUM:[^\n]*\n)?\n?/, '').trim() || '';
          console.log(`[SW] _memoryOnly: генеруємо memory для ${currentNum} (${shortBody.length} символів)`);
          if (!await interruptibleDelay(config.shortDelay || 65)) return { stopped: true };
          const memoryText = await buildMemorySentence(shortBody, config.aiPlatform || config.platform, config.apiKey, config.openrouterModel);
          session.memory = memoryText || shortBody.split('\n').find(l => l.trim().length > 20) || '';
        }
        session.num = currentNum;
      } catch (e) {
        console.warn(`[SW] _memoryOnly: помилка для ${currentNum}:`, e.message);
      }
    } else if (config.archiveMode === 'shorts_only' || session._shortOnly) {
      // Режим "тільки шорти" або авто з наявним фулом — читаємо фул з Drive, генеруємо шорт
      const storage = getStorage(config.storage);
      const fullText = await readFullFromDrive(session, config, storage);
      if (!await interruptibleDelay(config.shortDelay || 65)) return { stopped: true };
      const { short: shortText, memory: memoryText, tags } = await buildShort(fullText, config.aiPlatform || config.platform, config.apiKey, currentNum, config.openrouterModel, session.createdAt);
      session.short = shortText;    // зберігаємо для memory.txt
      session.memory = memoryText;  // стисла суть для memory.txt
      session.num = currentNum;     // номер сесії
      await saveToArchive('short', shortText, session, config, currentNum);
      await updateTags(tags, config, currentNum);
    } else {
      // Режим "повний" або "тільки фули"
      const { content: fullText, createdAt: fetchedDate } = await fetchSessionContent(session, config);
      if (fetchedDate && !session.createdAt) session.createdAt = fetchedDate;
      await saveToArchive('full', fullText, session, config, currentNum);
      await saveSysSession(session, config);

      if (config.archiveMode !== 'full_only') {
        // Повний режим — генеруємо шорт
        if (!await interruptibleDelay(config.shortDelay || 65)) return { stopped: true };
        const { short: shortText, memory: memoryText, tags } = await buildShort(fullText, config.aiPlatform || config.platform, config.apiKey, currentNum, config.openrouterModel, session.createdAt);
        session.short = shortText;    // зберігаємо для memory.txt
        session.memory = memoryText;  // стисла суть для memory.txt
        session.num = currentNum;     // номер сесії
        await saveToArchive('short', shortText, session, config, currentNum);
        await updateTags(tags, config, currentNum);
      }
    }

    processingState.index++;
    processingState.retryCount = 0;
    await chrome.storage.local.set({ processingState });

    // Оновити memory.txt після кожної сесії (щоб не втратити при зупинці)
    try {
      const storage = getStorage(config.storage);
      const processedSessions = processingState.sessions.slice(0, processingState.index).filter(s => s.short);
      swLog(`[SW] processedSessions: ${processedSessions.length} з ${processingState.sessions.length} index: ${processingState.index}`);
      if (processedSessions.length > 0) {
        const memoryTxt = await buildMemoryTxt(processedSessions, config);
        await storage.save(config.cloudId, `${config.platform}/memory.txt`, memoryTxt);
      }
    } catch (memErr) {
      console.warn('[SW] memory.txt не оновлено:', memErr.message);
    }

    // Повідомити popup про прогрес
    const done = processingState.index;
    const total = sessions.length;
    chrome.action.setBadgeText({ text: `${done}/${total}` });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    try {
    safeSendMessage({ type: 'PROGRESS', done, total, session: session.id, num: currentNum });
    } catch (_) {}

    if (!processingState.running) return { stopped: true };
    return await processNext();

  } catch (err) {
    if (err.code === 'RATE_LIMIT') {
      const delay = config.shortDelay || 65;
      processingState.retryCount = (processingState.retryCount || 0) + 1;
      if (processingState.retryCount >= 3) {
        console.warn('[SW] Rate limit — 3 спроби вичерпано. Зупиняємось до скидання квоти.');
        processingState.running = false;
        await chrome.storage.local.set({ processingState });
        chrome.action.setBadgeText({ text: '⏸' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
        await saveRunLog(config, 'RATE_LIMIT');
        safeSendMessage({ type: 'RATE_LIMITED_STOP' });
        return { rateLimitStop: true };
      }
      swLog(`[SW] Rate limit — спроба ${processingState.retryCount}/3, чекаю ${delay} сек`);
      if (!await interruptibleDelay(delay)) return { stopped: true };
      if (!processingState.running) return { stopped: true };
      return await processNext();
    }
    if (err.message?.startsWith('STORAGE_ERROR')) {
      console.error('[SW] Помилка збереження — зупиняємось:', err.message);
      processingState.running = false;
      await chrome.storage.local.set({ processingState });
      chrome.action.setBadgeText({ text: '⏸' });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      await saveRunLog(config, 'STORAGE_ERROR');
      safeSendMessage({ type: 'STORAGE_ERROR', message: err.message });
      return;
    }
    if (err.code === 'AUTH_ERROR') {
      // Невірний/відсутній API-ключ чи неіснуюча модель — однаково для КОЖНОЇ
      // сесії цього прогону, а не проблема конкретної сесії. Per-сесійний skip
      // тут не має сенсу: без правильного ключа кожна наступна сесія впаде
      // так само, і ми просто позначимо "пропущено" весь архів підряд, жодної
      // реально не обробивши.
      console.error('[SW] AUTH_ERROR — невірний ключ/модель, зупиняємось:', err.message);
      processingState.running = false;
      await chrome.storage.local.set({ processingState });
      chrome.action.setBadgeText({ text: '⏸' });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      await saveRunLog(config, 'ERROR_STOP');
      safeSendMessage({ type: 'ERROR_STOP', message: err.message });
      return;
    }
    // Інші помилки (413, 400, 401 і т.п.) — рахуємо спроби саме для цієї сесії.
    // Якщо не читається одна конкретна сесія — пропускаємо тільки її і йдемо
    // далі з рештою; це не системна проблема (як STORAGE_ERROR чи RATE_LIMIT),
    // тому зупиняти весь прогін через одну зламану сесію немає сенсу.
    processingState.retryCount = (processingState.retryCount || 0) + 1;
    console.warn(`[SW] Помилка (спроба ${processingState.retryCount}/3) на сесії ${currentNum}:`, err.message);
    if (processingState.retryCount >= 3) {
      console.warn(`[SW] Сесія ${currentNum} — 3 невдалі спроби, пропускаємо і йдемо далі.`);
      processingState.index++;
      processingState.retryCount = 0;
      await chrome.storage.local.set({ processingState });
      const done = processingState.index;
      const total = sessions.length;
      chrome.action.setBadgeText({ text: `${done}/${total}` });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
      safeSendMessage({ type: 'SKIPPED', session: session.id, num: currentNum, reason: err.message?.slice(0, 100) || 'невідома помилка' });
      if (!processingState.running) return { stopped: true };
      return await processNext();
    }
    if (!await interruptibleDelay(5)) return { stopped: true };
    if (!processingState.running) return { stopped: true };
    return await processNext();
  }
}

// ── Збереження в архів ────────────────────────────────────────────────────────
async function saveToArchive(type, text, session, config, currentNum) {
  const digits = config.numDigits || 4;
  const blockSize = config.blockSize || 50; // шортів на блок
  currentNum = currentNum || (config.numStart || 1) + processingState.index;
  const storage = getStorage(config.storage);

  if (type === 'full') {
    const filePath = `${config.platform}/full/full_${pad(currentNum, digits)}.txt`;
    const createdAt = session.createdAt ? `SESSION_DATE: ${session.createdAt.slice(0,19).replace('T',' ')}\n` : '';
    try {
      await storage.save(config.cloudId, filePath, `SESSION_ID: ${session.id}\n${createdAt}\n` + text);
      console.log(`[Drive] full збережено: ${filePath}`);
      await updateSessionMeta(config, session.id, currentNum, text.length);
    } catch(e) {
      console.error(`[Drive] ПОМИЛКА збереження full:`, e);
      throw new Error(`STORAGE_ERROR: ${e.message || e}`);
    }

  } else if (type === 'short') {
    const shortFormat = config.shortFormat || 'both';
    const singlePath = `${config.platform}/short/short_${pad(currentNum, digits)}.txt`;
    const createdAt = session.createdAt ? `SESSION_DATE: ${session.createdAt.slice(0,19).replace('T',' ')}\n` : '';
    const shortWithId = `SESSION_ID: ${session.id}\nSESSION_NUM: ${String(currentNum).padStart(4, "0")}\n${createdAt}\n${text}`;

    // Окремий файл — тільки якщо singles або both
    if (shortFormat === 'singles' || shortFormat === 'both') {
      try {
        await storage.save(config.cloudId, singlePath, shortWithId);
        console.log(`[Drive] short збережено: ${singlePath}`);
      } catch(e) {
        console.error(`[Drive] ПОМИЛКА збереження short:`, e);
        throw new Error(`STORAGE_ERROR: ${e.message || e}`);
      }
    }

    // Блок — тільки якщо blocks або both
    if (shortFormat === 'blocks' || shortFormat === 'both') {
      const blockStart = Math.floor((currentNum - 1) / blockSize) * blockSize + 1;
      const blockEnd = blockStart + blockSize - 1;
      const blockPath = `${config.platform}/short/short_${pad(blockStart, digits)}-${pad(blockEnd, digits)}.txt`;
      try {
        await storage.appendSorted(config.cloudId, blockPath, shortWithId, currentNum);
        console.log(`[Drive] short→блок збережено: ${blockPath}`);
      } catch(e) {
        console.error(`[Drive] ПОМИЛКА збереження блоку short:`, e);
      }
    }
  }
}

async function saveSysSession(session, config) {
  console.log('[RUN] saveSysSession пропущено для', session.id);
}

// ── Фінал: memory.txt + системний промпт ─────────────────────────────────────
async function finalize() {
  const { config, sessions } = processingState;
  const digits = config.numDigits || 4;

  // Перейменувати останні архіви (cur → реальний кінцевий номер)
  const storage = getStorage(config.storage);
  // Окремі файли більше не потребують перейменування (cur→NNN прибрано)

  // Оновити memory.txt
  const memoryTxt = await buildMemoryTxt(sessions, config);
  const memPath = `${config.platform}/memory.txt`;

  await storage.save(config.cloudId, memPath, memoryTxt);

  // Вставити системний промпт у відкриту вкладку моделі
  const sessionMap = await loadSessionMap(config).catch(() => new Map());
  const systemPrompt = buildSystemPrompt(config, sessions, sessionMap.size || sessions.length);
  const tabs = await chrome.tabs.query({ url: getPlatformUrl(config.platform) });
  if (tabs.length > 0) {
    await injectSystemPrompt(tabs[0].id, systemPrompt);
  }

await saveRunLog(config, 'FINALIZE');

  processingState.running = false;
  await chrome.storage.local.set({ processingState });

  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
  try { safeSendMessage({ type: 'DONE', systemPrompt }); } catch (_) {}
}

// ── Системний промпт ──────────────────────────────────────────────────────────
function buildSystemPrompt(config, sessions, totalFromMap) {
  const total = totalFromMap || sessions.length;
  const blockSize = config.blockSize || 50;
  const root = config.storage === 'local'
    ? (config.localPath || '?')
    : `[Drive: ${config.cloudId}]`;

  return `<memory_archive>
Це архів усіх розмов між Користувачем та АІ.
Шлях: ${root}/${config.platform}/
Загальна кількість сесій: ${total}

СТРУКТУРА ФАЙЛІВ:
──────────────────────────────────────────
memory.txt
  Короткий зміст усіх сесій — починай звідси.
  Оновлюється автоматично після кожної обробки.

tags.txt
  Теги з вагою (тема×кількість_згадок).
  Формат: інтуїція_ШІ×12, пам_ять×9 ...
  Використовуй для швидкого пошуку тем.

full/full_NNN.txt
  Повний текст сесії NNN — один файл на сесію.
  Читай коли потрібен повний контекст конкретної сесії.
  Приклад: full_042.txt = повна сесія 42

short/short_NNN.txt
  Стислий огляд сесії NNN — один файл на сесію.
  Читай для швидкого ознайомлення з конкретною сесією.
  Приклад: short_042.txt = огляд сесії 42

short/short_NNN-MMM.txt
  ЗВЕДЕНИЙ БЛОК — усі шорти від NNN до MMM в одному файлі.
  Блок по ${blockSize} сесій: 001-0${String(blockSize).padStart(2,'0')}0, 0${String(blockSize+1).padStart(2,'0')}1-${String(blockSize*2).padStart(3,'0')}, ...
  Читай коли потрібен огляд цілого періоду одним запитом.
  Приклад: short_001-050.txt = огляд сесій 1-50

_system/
  Службові файли обробки. Не читати.

──────────────────────────────────────────
СТРАТЕГІЯ ЧИТАННЯ:

Загальна картина      → memory.txt
Пошук по темі         → tags.txt → знайти сесії з тегом → short_NNN.txt
Огляд певного періоду → short_NNN-MMM.txt (зведений блок)
Деталі конкретної сесії → full_NNN.txt
</memory_archive>`;
}

async function injectSystemPrompt(tabId, prompt) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (promptText) => {
      window.__memoryBuilderPrompt = promptText;
      window.dispatchEvent(new CustomEvent('mb:system-prompt', { detail: promptText }));
    },
    args: [prompt],
  });
}

// ── Ліміти ────────────────────────────────────────────────────────────────────
async function handleRateLimit(waitMinutes) {
  processingState.paused = true;
  await chrome.storage.local.set({ processingState });
  chrome.alarms.create('resume_after_limit', { delayInMinutes: waitMinutes });
  chrome.action.setBadgeText({ text: '⏸' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
  try { safeSendMessage({ type: 'RATE_LIMITED', waitMinutes }); } catch (_) {}
}


// ── Читання фулу з Drive для режиму shorts_only ───────────────────────────────
async function readFullFromDrive(session, config, storage) {
  const digits = config.numDigits || 4;

  try {
    const map = await loadSessionMap(config);

    if (map && map.has(session.id)) {
      const num = map.get(session.id);
      const filePath = `${config.platform}/full/full_${pad(num, digits)}.txt`;

      try {
        return await storage.read(config.cloudId, filePath);
      } catch (e) {
        console.warn(`[SW] У мапі є ID ${session.id} → ${num}, але файл не знайдено: ${filePath}`);
      }
    }

    console.warn(`[SW] ID відсутній у session_map, запускаю повний пошук: ${session.id}`);

    const files = await storage.listFolder(config.cloudId, `${config.platform}/full`);

    for (const file of files) {
      const content = await storage.read(config.cloudId, `${config.platform}/full/${file.name}`);

      const marker = `SESSION_ID: ${session.id}`;
      if (content.indexOf(marker) !== -1) {
        const m = file.name.match(/full_(\d+)\.txt$/);

        if (m && ['gemini', 'claude', 'deepseek'].includes(config.platform)) {
          const recoveredNum = parseInt(m[1], 10);
          map.set(session.id, recoveredNum);
          await saveSessionMap(config, map);
          console.log(`[SW] Знайдено втрачений ID: ${session.id} → ${recoveredNum}`);
        }

        return content;
      }
    }
  } catch (e) {
    console.error('[Drive] readFullFromDrive помилка:', e);
  }

  return '[контент не знайдено в архіві]';
}

// ── Завантаження контенту сесії через навігацію ───────────────────────────────
async function fetchSessionContent(session, config) {
  const tabs = await chrome.tabs.query({ url: getPlatformUrl(config.platform) });
  if (!tabs.length) return '[вкладку не знайдено]';

  const tabId = tabs[0].id;
  const sessionUrl = getSessionUrl(config.platform, session.id);

  // Перейти на сторінку сесії і активувати вкладку (інакше Gemini не рендерить у фоні)
  await chrome.tabs.update(tabId, { url: sessionUrl, active: true });

  // Чекати поки сторінка завантажиться
  await waitForTabLoad(tabId);

  // Додатково чекати рендер контенту
  const noScroll = config.platform === 'claude' || config.platform === 'gpt' || config.platform === 'deepseek';
  const waitTime = noScroll ? 1500 : 2000;
  await new Promise(r => setTimeout(r, waitTime));

  // Gemini потребує скролінгу для lazy loading — Claude/GPT/DeepSeek завантажують все одразу
  if (!noScroll) {
    // Запускаємо скролер в сторінці — він сигналізує через window.__mbScrollDone
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.__mbScrollDone = false;
        let stableCount = 0;
        let lastCount = -1;

        const scroller = document.querySelector('infinite-scroller')
          || document.querySelector('chat-window')
          || document.querySelector('[class*="chat-history"]')
          || document.querySelector('[class*="conversation-container"]')
          || document.querySelector('main')
          || document.scrollingElement;

        function scrollUp() {
          const currentCount = document.querySelectorAll('user-query, model-response').length;

          if (scroller) {
            scroller.scrollTop = 0;
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          }
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;

          const first = document.querySelector('user-query, model-response');
          if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });

          if (currentCount === lastCount) {
            stableCount++;
            if (stableCount >= 5) {
              window.__mbScrollDone = true;
              return;
            }
          } else {
            stableCount = 0;
          }

          lastCount = currentCount;
          setTimeout(scrollUp, 800);
        }
        scrollUp();
      },
    });

    // Polling з service worker — чекаємо поки __mbScrollDone стане true
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      const check = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__mbScrollDone === true,
      });
      if (check[0]?.result === true) break;
    }
    await new Promise(r => setTimeout(r, 2500));
  }

  // Інжектувати script і зчитати контент
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/' + config.platform + '.js'],
    });
  } catch (_) {}

  // Чекаємо поки контент стабілізується (два однакових результати підряд)
  let sessionContent = '';
  let prevLength = -1;
  let stableCount = 0;
  let frameErrors = 0;
  const MAX_ATTEMPTS = 20;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__mbGetSessionContent?.() || '',
      });
      sessionContent = result[0]?.result || '';
      frameErrors = 0; // скидаємо при успіху
    } catch (frameErr) {
      frameErrors++;
      console.warn(`[SW] Спроба ${attempt + 1} — фрейм змінився (${frameErrors}):`, frameErr.message);
      if (frameErrors >= 5) {
        console.error('[SW] Забагато помилок фрейму — виходимо');
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
      attempt--; // не рахуємо як спробу
      continue;
    }

    if (sessionContent.length > 50 && sessionContent.length === prevLength) {
      stableCount++;
      if (stableCount >= 2) {
        console.log(`[SW] Контент стабільний: ${sessionContent.length} символів (спроба ${attempt + 1})`);
        break; // два однакових підряд — контент завантажений
      }
    } else {
      stableCount = 0; // розмір змінився — скидаємо лічильник
    }

    prevLength = sessionContent.length;
    console.warn(`[SW] Спроба ${attempt + 1}/${MAX_ATTEMPTS} — ${sessionContent.length} символів, чекаю...`);
    await new Promise(r => setTimeout(r, 6000));
  }

  return { content: sessionContent || '[контент недоступний]', createdAt: session.createdAt || null };
}

function getSessionUrl(platform, sessionId) {
  return {
    gemini: `https://gemini.google.com/app/${sessionId}`,
    claude: `https://claude.ai/chat/${sessionId}`,
    gpt: `https://chatgpt.com/c/${sessionId}`,
    deepseek: `https://chat.deepseek.com/a/chat/s/${sessionId}`,
  }[platform] || `https://gemini.google.com/app/${sessionId}`;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    // Таймаут 15 секунд
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

// ── Отримати список сесій з платформи ────────────────────────────────────────
async function getSessions(platform) {
  const tabs = await chrome.tabs.query({ url: getPlatformUrl(platform) });
  if (!tabs.length) return { error: 'Вкладку не знайдено. Відкрий ' + platform };

  // Інжектуємо script вручну якщо не завантажився автоматично
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['src/content/' + platform + '.js'],
    });
  } catch (_) {}

  const result = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: () => Promise.resolve(window.__mbGetSessions?.() || []),
  });

  return result[0]?.result || [];
}

// ── Перевірка ліміту API ─────────────────────────────────────────────────────
async function checkLimit(apiKey, platform, openrouterModel = null) {
  try {
    let url, options;
    if (platform === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
      };
    } else if (platform === 'deepseek') {
      url = 'https://api.deepseek.com/chat/completions';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else if (platform === 'claude') {
      url = 'https://api.anthropic.com/v1/messages';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else if (platform === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'chrome-extension://memory-builder',
          'X-Title': 'Memory Builder',
        },
        body: JSON.stringify({ model: openrouterModel || 'openrouter/auto', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else if (platform === 'qwen') {
      url = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'qwen-plus', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else if (platform === 'huggingface') {
      url = 'https://router.huggingface.co/v1/chat/completions';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'Qwen/Qwen2.5-72B-Instruct', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else if (platform === 'mistral') {
      url = 'https://api.mistral.ai/v1/chat/completions';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'mistral-small-latest', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else if (platform === 'groq') {
      url = 'https://api.groq.com/openai/v1/chat/completions';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: openrouterModel || 'llama-3.3-70b-versatile', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      };
    } else {
      return { ok: false, message: `Платформа "${platform}" не підтримується` };
    }
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (res.status === 200) return { ok: true, message: 'Квота є — можна запускати' };
    if (res.status === 400) return { ok: false, message: `Невірний запит — перевірте API-ключ або назву моделі` };
    if (res.status === 401) return { ok: false, message: `API-ключ недійсний або відсутній — оновіть ключ у налаштуваннях` };
    if (res.status === 403) return { ok: false, message: `Доступ заборонено — перевірте тарифний план або дозволи ключа` };
    if (res.status === 404) return { ok: false, message: `Модель недоступна — перевірте назву моделі` };
    if (res.status === 429) return { ok: false, message: 'Ліміт вичерпано. Спробуй після півночі UTC' };
    if (res.status === 503) return { ok: false, message: 'Сервіс тимчасово недоступний — спробуйте пізніше' };
    const errMsg = data?.error?.message || '';
    return { ok: false, message: `Помилка ${res.status}${errMsg ? ': ' + errMsg : ''}` };
  } catch (e) {
    return { ok: false, message: `Помилка: ${e.message}` };
  }
}

// ── Підрахунок існуючих шортів ───────────────────────────────────────────────
async function countExistingShorts(config) {
  try {
    const storage = getStorage(config.storage);
    // Отримуємо список файлів у папці short/ одним запитом
    const files = await storage.listFolder(config.cloudId, `${config.platform}/short`);
    // Рахуємо тільки окремі файли short_NNN.txt (не блокові short_001-050.txt)
    const singleShorts = files.filter(f => /^short_\d+\.txt$/.test(f.name));
    const count = singleShorts.length;
    console.log(`[Count] Знайдено існуючих шортів: ${count}`);
    return count;
  } catch (_) {
    return 0;
  }
}

// ── Теги з вагою ─────────────────────────────────────────────────────────────
// ── Фільтрація тегів від шуму ─────────────────────────────────────────────────
function normalizeTag(tag) {
  return tag
    .trim()
    .replace(/[''`]/g, '_')   // апостроф → підкреслення: пам'ять → пам_ять
    .replace(/\s+/g, '_')     // пробіли → підкреслення
    .replace(/__+/g, '_')     // подвійні підкреслення → одинарне
    .replace(/^_|_$/g, '');   // обрізати підкреслення по краях
}

function isValidTag(tag) {
  tag = normalizeTag(tag);
  
  // Мінімум 3 символи
  if (tag.length < 3) return false;
  
  // Має бути підкреслення (складений тег, не одне слово)
  if (!tag.includes('_')) return false;
  
  // Тільки українська + підкреслення (без англійської, без цифр-ID)
  if (/[a-zA-Z]{4,}/.test(tag)) return false; // допускаємо ШІ, ІІ, AI але не довгі англійські слова
  
  // Видалити очевидний шум
  const noisePatterns = [
    /^привіт/i,
    /^ID:/,
    /^nee\s/,
    /^но_/,
    /\.\.\./,
  ];
  
  if (noisePatterns.some(p => p.test(tag))) return false;
  
  return true;
}

async function updateTags(tags, config, sessionNum = null) {
  // tags — масив рядків, вже згенерований AI з фулу (через ai.js parseShortAndTags)
  if (!Array.isArray(tags) || !tags.length) return;

  // Додатковий фільтр на випадок якщо AI все ж повернув щось дивне
  const newTags = tags.filter(isValidTag).map(normalizeTag);
  
  if (!newTags.length) {
    console.log(`[Tags] пропущено всі теги — не пройшли фільтр`);
    return;
  }

  const storage = getStorage(config.storage);
  const tagsPath = `${config.platform}/tags.txt`;

  // Читаємо поточний tags.txt
  let tagsMap = {};
  let sessionCount = 0;
  
  try {
    const existing = await storage.read(config.cloudId, tagsPath);
    const allLines = existing.split('\n');
    
    // Витягуємо header якщо є (шукаємо "Сесій обробано: N")
    for (const line of allLines) {
      const m = line.match(/Сесій обробано: (\d+)/);
      if (m) {
        sessionCount = parseInt(m[1]);
        break;
      }
    }
    
    // Читаємо теги (пропускаємо header рядки)
    // Формат: тег×N [1,7,23]
    let inHeader = false;
    for (const line of allLines) {
      if (line.startsWith('===') || line === '') {
        inHeader = true;
        continue;
      }
      if (inHeader && !line.includes('×')) continue;
      
      const m = line.match(/^(.+?)×(\d+)(?:\s+\[([^\]]*)\])?$/);
      if (m) {
        const sessions = m[3] ? m[3].split(',').map(n => parseInt(n.trim())).filter(Boolean) : [];
        tagsMap[m[1].trim()] = { count: parseInt(m[2]), sessions };
      }
    }
  } catch (_) {} // файлу ще немає — починаємо з нуля

  // Оновлюємо лічильники + зберігаємо номери сесій
  for (const tag of newTags) {
    if (!tagsMap[tag]) tagsMap[tag] = { count: 0, sessions: [] };
    tagsMap[tag].count++;
    if (sessionNum && !tagsMap[tag].sessions.includes(sessionNum)) {
      tagsMap[tag].sessions.push(sessionNum);
    }
  }

  // Будуємо новий header
  const now = new Date().toLocaleString('uk-UA');
  const newSessionCount = sessionCount + 1;
  const headerContent = [
    '=== TAGS ===',
    `Оновлено: ${now}`,
    `Сесій обробано: ${newSessionCount}`,
    'Статус: активно, інкрементальний',
    '===',
    '',
  ];

  // Сортуємо за вагою (спадання) і зберігаємо
  const lines = Object.entries(tagsMap)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([tag, { count, sessions }]) => {
      const sesStr = sessions.length ? ` [${sessions.sort((a,b)=>a-b).join(',')}]` : '';
      return `${tag}×${count}${sesStr}`;
    });

  const content = headerContent.join('\n') + lines.join('\n');
  await storage.save(config.cloudId, tagsPath, content);
  console.log(`[Tags] оновлено (${newTags.length} валідних): ${newTags.slice(0, 3).join(', ')}${newTags.length > 3 ? '...' : ''}`);
}

// ── Утиліти ───────────────────────────────────────────────────────────────────
function pad(n, d = 4) { return String(n).padStart(d, '0'); }
async function stopProcessing() {
  processingState.running = false;
  processingState.stopped = true;
  chrome.alarms.clear('resume_after_limit');

  try {
    await saveRunLog(processingState.config || {}, 'MANUAL_STOP');
  } catch (e) {
    console.error('[RUN] saveRunLog error:', e);
  }

  await chrome.storage.local.set({ processingState });
  chrome.action.setBadgeText({ text: '' });
}
function getPlatformUrl(platform) {
  return {
    claude: 'https://claude.ai/*',
    gemini: 'https://gemini.google.com/*',
    gpt: 'https://chatgpt.com/*',
    deepseek: 'https://chat.deepseek.com/*',
  }[platform] || 'https://claude.ai/*';
}


async function detectShortFormat(config) {
  try {
    const storage = getStorage(config.storage);
    const files = await storage.listFolder(config.cloudId, `${config.platform}/short`).catch(() => []);
    let hasSingles = false;
    let hasBlocks = false;
    for (const f of files) {
      if (/^short_\d+\.txt$/.test(f.name)) hasSingles = true;
      if (/^short_\d+-\d+\.txt$/.test(f.name)) hasBlocks = true;
      if (hasSingles && hasBlocks) break;
    }
    return { hasSingles, hasBlocks };
  } catch (e) {
    return { hasSingles: false, hasBlocks: false };
  }
}

async function createBook(config, bookConfig) {
  const progress = (text) => {
    console.log('[SW] ' + text);
    safeSendMessage({ type: 'BOOK_PROGRESS', text });
  };

  const digits = config.digits || 3;

  try {
    const storage = getStorage(config.storage);
    const platformPath = config.platform;

    progress('Читаємо архів...');

    const [shortFiles, fullFiles] = await Promise.all([
      storage.listFolder(config.cloudId, `${platformPath}/short`).catch(() => []),
      storage.listFolder(config.cloudId, `${platformPath}/full`).catch(() => []),
    ]);

    const singleShortFiles = shortFiles.filter(f => /^short_\d+\.txt$/.test(f.name));

    let memoryContent = '';
    let tagsContent = '';
    try { memoryContent = await storage.read(config.cloudId, `${platformPath}/memory.txt`); } catch (_) {}
    try { tagsContent = await storage.read(config.cloudId, `${platformPath}/tags.txt`); } catch (_) {}

    // Перевірка — чи є взагалі що збирати
    if (!fullFiles.length && !singleShortFiles.length && !memoryContent && !tagsContent) {
      safeSendMessage({ type: 'BOOK_ERROR', error: 'Архів відсутній — немає файлів для створення книги' });
      return { success: false, error: 'empty' };
    }

    const results = [];

    async function saveBooks(content, dirName) {
      if (!content.trim()) return;
      const books = bookConfig.maxSizeMB
        ? splitIntoBooks(content, bookConfig.maxSizeMB)
        : [content];
      const bookDir = `${platformPath}/books/${dirName}`;
      for (let i = 0; i < books.length; i++) {
        const name = books.length > 1
          ? `book_${pad(i + 1, digits)}_of_${pad(books.length, digits)}.txt`
          : `book_001.txt`;
        progress(`Зберігаємо ${dirName}/${name} (${Math.round(books[i].length / 1024)} КБ)...`);
        try {
          await storage.save(config.cloudId, `${bookDir}/${name}`, books[i]);
          results.push(`${dirName}/${name}`);
        } catch (e) {
          console.error(`[SW] Помилка ${dirName}/${name}:`, e.message);
        }
      }
    }

    if (bookConfig.includeTags && tagsContent) {
      await saveBooks(tagsContent, 'tags');
    }

    if (bookConfig.includeMemory && memoryContent) {
      await saveBooks(memoryContent, 'memory');
    }

    if (bookConfig.includeShorts && singleShortFiles.length > 0) {
      let shortsContent = '═══════════════════════════════════════\n  ШОРТИ\n═══════════════════════════════════════\n\n';
      const BATCH = 10;
      for (let i = 0; i < singleShortFiles.length; i += BATCH) {
        const batch = singleShortFiles.slice(i, i + BATCH);
        progress(`Читаємо шорти (${Math.min(i + BATCH, singleShortFiles.length)}/${singleShortFiles.length})...`);
        const res = await Promise.all(batch.map(f => storage.read(config.cloudId, `${platformPath}/short/${f.name}`).catch(() => '')));
        for (const c of res) { if (c) shortsContent += c + '\n\n'; }
      }
      await saveBooks(shortsContent, 'short');
    }

    if (bookConfig.includeFulls && fullFiles.length > 0) {
      let fullsContent = '═══════════════════════════════════════\n  ФУЛИ\n═══════════════════════════════════════\n\n';
      const BATCH = 10;
      for (let i = 0; i < fullFiles.length; i += BATCH) {
        const batch = fullFiles.slice(i, i + BATCH);
        progress(`Читаємо фули (${Math.min(i + BATCH, fullFiles.length)}/${fullFiles.length})...`);
        const res = await Promise.all(batch.map(f => storage.read(config.cloudId, `${platformPath}/full/${f.name}`).catch(() => '')));
        for (const c of res) { if (c) fullsContent += c + '\n\n'; }
      }
      await saveBooks(fullsContent, 'full');
    }

    if (bookConfig.includeCombined) {
      let combined = '';
      if (tagsContent) combined += '═══════════════════════════════════════\n  ТЕГИ\n═══════════════════════════════════════\n\n' + tagsContent + '\n\n';
      if (memoryContent) combined += '═══════════════════════════════════════\n  ЗМІСТ\n═══════════════════════════════════════\n\n' + memoryContent + '\n\n';
      if (bookConfig.includeShorts && singleShortFiles.length > 0) {
        combined += '═══════════════════════════════════════\n  ШОРТИ\n═══════════════════════════════════════\n\n';
        const BATCH = 10;
        for (let i = 0; i < singleShortFiles.length; i += BATCH) {
          const batch = singleShortFiles.slice(i, i + BATCH);
          progress(`[Сублімована] Шорти (${Math.min(i + BATCH, singleShortFiles.length)}/${singleShortFiles.length})...`);
          const res = await Promise.all(batch.map(f => storage.read(config.cloudId, `${platformPath}/short/${f.name}`).catch(() => '')));
          for (const c of res) { if (c) combined += c + '\n\n'; }
        }
      }
      if (bookConfig.includeFulls && fullFiles.length > 0) {
        combined += '═══════════════════════════════════════\n  ФУЛИ\n═══════════════════════════════════════\n\n';
        const BATCH = 10;
        for (let i = 0; i < fullFiles.length; i += BATCH) {
          const batch = fullFiles.slice(i, i + BATCH);
          progress(`[Сублімована] Фули (${Math.min(i + BATCH, fullFiles.length)}/${fullFiles.length})...`);
          const res = await Promise.all(batch.map(f => storage.read(config.cloudId, `${platformPath}/full/${f.name}`).catch(() => '')));
          for (const c of res) { if (c) combined += c + '\n\n'; }
        }
      }
      if (combined.trim()) await saveBooks(combined, 'combined');
    }

    safeSendMessage({ type: 'BOOK_DONE', files: results });
    console.log('[SW] Книги готові:', results);
    return { success: true };

  } catch (err) {
    console.error('[SW] Помилка createBook:', err);
    safeSendMessage({ type: 'BOOK_ERROR', error: err.message });
    return { success: false, error: err.message };
  }
}

function splitIntoBooks(content, maxSizeMB) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  const books = [];
  let currentBook = '';
  let currentBytes = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    // Приблизний підрахунок: ASCII = 1 байт, інше (кирилиця) = 2 байти
    const lineBytes = line.split('').reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0) + 1;
    if (currentBook.length > 0 && currentBytes + lineBytes > maxBytes) {
      books.push(currentBook);
      currentBook = line + '\n';
      currentBytes = lineBytes;
    } else {
      currentBook += line + '\n';
      currentBytes += lineBytes;
    }
  }

  if (currentBook.length > 0) books.push(currentBook);
  return books.length > 0 ? books : [content];
}
