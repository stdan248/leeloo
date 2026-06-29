// popup.js — Memory Builder UI logic
import { LANG, t, setLang, currentLang } from './i18n.js';
import { icon } from './icons.js';

// ── Стан ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const state = {
  appMode: 'lite',
  platform: 'claude',
  storage: 'drive',
  mode: 'auto',
  aiPlatform: 'claude',
  archiveMode: 'full',
  shortFormat: 'both',
  blockSize: 50,
  selected: new Set(),
  existing: new Set(),
  ctimer: null,
  currentScreen: 0,
  prefetchReady: false,
  syncCloud: 'drive',
  syncAnalysis: null,
};

const DELAY_DEFAULTS = {
  claude: 5,
  gemini: 65,
  gpt: 5,
  deepseek: 5,
  openrouter: 30,
  qwen: 5,
  huggingface: 20,  // ліміти не публікуються, варіюються
  mistral: 15,      // free tier обмежений, точних цифр немає
  groq: 20,         // 30 RPM але TPM 12K — безпечніше 20 сек
};

const OPENROUTER_DELAY_DEFAULTS = {
  'meta-llama/llama-3.1-8b-instruct:free': 30,
  'meta-llama/llama-3.3-70b-instruct:free': 30,
  'google/gemma-3-12b-it:free': 30,
  'mistralai/mistral-7b-instruct:free': 30,
  'openrouter/auto': 5,
  'custom': 10,
};

const GROQ_DELAY_DEFAULTS = {
  'llama-3.3-70b-versatile': 20,  // 1000 RPD, 12K TPM
  'llama-3.1-8b-instant': 10,     // 14400 RPD, швидший
  'gemma2-9b-it': 12,
  'mixtral-8x7b-32768': 20,
  'custom': 20,
};

const SHORT_FORMAT_INFO = () => ({
  singles: t('shortSingles'),
  blocks:  t('shortBlocks'),
  both:    t('shortBoth'),
});

const MODE_INFO = () => ({
  new:    t('modeNew'),
  auto:   t('modeAuto'),
  all:    t('modeAll'),
  select: t('modeSelect'),
});

const STOR_LABELS = () => ({
  drive:    t('storDrive'),
  onedrive: t('storOnedrive'),
  dropbox:  t('storDropbox'),
  local:    t('storLocal'),
});

const API_KEY_LINKS = {
  claude: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/app/apikey',
  gpt: 'https://platform.openai.com/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  openrouter: 'https://openrouter.ai/keys',
  qwen: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key',
  huggingface: 'https://huggingface.co/settings/tokens',
  mistral: 'https://console.mistral.ai/api-keys',
  groq: 'https://console.groq.com/keys',
  other: '#',
};

const API_LABELS = {
  claude: 'Anthropic API ключ (sk-ant-...)',
  gemini: 'Google AI API ключ',
  gpt: 'OpenAI API ключ (sk-...)',
  deepseek: 'DeepSeek API ключ (sk-...),',
  openrouter: 'OpenRouter API ключ (sk-or-...)',
  qwen: 'Alibaba Cloud API ключ (sk-...)',
  huggingface: 'HuggingFace Access Token (hf-...)',
  mistral: 'Mistral API ключ',
  groq: 'Groq API ключ (gsk_...)',
  other: 'API ключ моделі',
};

// ── IndexedDB для збереження FileSystemDirectoryHandle ────────────────────────
const IDB_NAME = 'mb-local-storage';
const IDB_STORE = 'handles';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveLocalHandle(handle) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, 'localDir');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadLocalHandle() {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('localDir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (_) { return null; }
}




function showRestoreHint(show) {
  const hint = document.getElementById('restore-access-hint');
  if (hint) hint.style.display = show ? 'flex' : 'none';
}

async function pickLocalFolder() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveLocalHandle(handle);
    state.localDirHandle = handle;
    updateLocalPathDisplay(handle.name);
    saveSettings();
    return handle;
  } catch (e) {
    if (e.name !== 'AbortError') console.error('pickLocalFolder:', e);
    return null;
  }
}

async function restoreLocalHandle() {
  const handle = await loadLocalHandle();
  if (!handle) return;
  try {
    // Запитуємо дозвіл (може знадобитись клік від юзера — перевіряємо)
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      state.localDirHandle = handle;
      updateLocalPathDisplay(handle.name);
      showRestoreHint(false);
    } else {
      // Збережено, але дозвіл не надано — показуємо хінт стійко, чекаємо кліку
      updateLocalPathDisplay(handle.name, false);
      state.localDirHandle = handle;
      showRestoreHint(true);
    }
  } catch (_) {}
}

function updateLocalPathDisplay(name, granted = true) {
  const el = $('local-path');
  if (!el) return;
  el.textContent = name || t('localFolderNone');
  el.style.opacity = '1';
  el.style.color = granted ? '#f6f1eb' : '#aca39b';
}

// ── Синхронізація — UI шар (логіка в sync.js) ────────────────────────────────

const SYNC_CLOUD_LABELS = {
  drive:    'Google Drive — ID кореневої папки',
  onedrive: 'OneDrive — ID папки',
  dropbox:  'Dropbox — шлях до папки',
};

const SYNC_TOKEN_LINKS = {
  drive:    'https://developers.google.com/oauthplayground',
  onedrive: 'https://developer.microsoft.com/en-us/graph/graph-explorer',
  dropbox:  'https://www.dropbox.com/developers/apps',
};

function fmtSize(bytes) {
  if (bytes == null) return '?';
  if (bytes < 1024) return `${bytes} б`;
  return `${(bytes / 1024).toFixed(1)} КБ`;
}

function getSyncParams() {
  return {
    syncCloud:      state.syncCloud,
    cloudId:        $('cloud-id').value.trim(),
    cloudToken:     $('drive-token').value.trim(),
    platform:       state.platform === 'other' ? ($('plat-name').value || 'model') : state.platform,
    localDirHandle: state.localDirHandle,
    localPath: state.localDirHandle?.name || "",
  };
}

function setSyncStatus(html, color = '') {
  const el = $('sync-status');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = color || 'var(--text,#eee)';
  el.innerHTML = html;
}

function setSyncBtns(enabled) {
  const tc = $('btn-sync-to-cloud');
  const tl = $('btn-sync-to-local');
  if (tc) tc.disabled = !enabled;
  if (tl) tl.disabled = !enabled;
}

async function syncAnalyze() {
  setSyncStatus('🔍 Аналіз...', 'var(--text2,#aaa)');
  setSyncBtns(false);
  state.syncAnalysis = null;

  const { analyzeSync } = await import(chrome.runtime.getURL('src/utils/sync.js'));
  const result = await analyzeSync(getSyncParams());

  if (result.error) {
    setSyncStatus(`⚠ ${result.error}`, 'var(--warn,#FF9800)');
    return;
  }

  const { onlyLocal, onlyCloud, different, same } = result;
  state.syncAnalysis = { ...result, ...getSyncParams() };

  const lines = [];
  if (same.length)      lines.push(`<span style="opacity:0.5">✓ Однакові: ${same.length}</span>`);
  if (onlyLocal.length) lines.push(`<span style="color:var(--ok,#4CAF50)">↑ Тільки локально: ${onlyLocal.length}</span>`);
  if (onlyCloud.length) lines.push(`<span style="color:var(--info,#2196F3)">↓ Тільки в хмарі: ${onlyCloud.length}</span>`);
  if (different.length) lines.push(`<span style="color:var(--warn,#FF9800)">≠ Відрізняються: ${different.length}</span>`);
  if (!onlyLocal.length && !onlyCloud.length && !different.length)
    lines.push('<span style="color:var(--ok,#4CAF50)">✓ Архіви синхронізовані</span>');

  setSyncStatus(lines.join('<br>'));
  if (onlyLocal.length || onlyCloud.length || different.length) setSyncBtns(true);

  // Кнопка конфліктів якщо є відмінності
  if (different.length) {
    const el = $('sync-status');
    if (el) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.style.cssText = 'margin-top:8px;display:block';
      btn.textContent = `${t('conflictBtn')} (${different.length})`;
      btn.onclick = openConflictWindow;
      el.appendChild(btn);
    }
  }

  // Звіт
  const now = new Date().toLocaleString('uk-UA');
  const report = [
    `=== ЗВІТ СИНХРОНІЗАЦІЇ ===`,
    `Дата: ${now}`,
    `Хмара: ${state.syncCloud} / ${getSyncParams().cloudId}`,
    `Платформа: ${getSyncParams().platform}`,
    `===`,
    ``,
    `✓ Однакові (${same.length}):`,
    ...same.map(f => `  ${f}`),
    ``,
    `↑ Тільки локально (${onlyLocal.length}):`,
    ...onlyLocal.map(f => `  ${f}`),
    ``,
    `↓ Тільки в хмарі (${onlyCloud.length}):`,
    ...onlyCloud.map(f => `  ${f}`),
    ``,
    `≠ Відрізняються (${different.length}):`,
    ...different.map(f => `  ${f.name}  [💻 ${fmtSize(f.localSize)} vs ☁ ${fmtSize(f.cloudSize)}]`),
  ].join('\n');

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = $('sync-status');
  if (el) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync_report_${new Date().toISOString().slice(0,10)}.txt`;
    a.style.cssText = 'display:block;margin-top:6px;font-size:11px;color:var(--info,#2196F3)';
    a.textContent = t('fullReport');
    el.appendChild(a);
  }
}

async function openConflictWindow() {
  if (!state.syncAnalysis) return;
  // Передаємо параметри через session storage
  await chrome.storage.session.set({
    conflictParams: {
      different:  state.syncAnalysis.different,
      syncCloud:  state.syncAnalysis.syncCloud,
      cloudId:    state.syncAnalysis.cloudId,
      cloudToken: state.syncAnalysis.cloudToken,
    },
  });
  // Відкриваємо вікно і передаємо dirHandle через window
  const url = chrome.runtime.getURL('src/popup/conflict.html');
  const conflictWin = window.open(url, 'mb-conflicts', 'width=680,height=560,resizable=yes');
  // Чекаємо поки вікно завантажиться і передаємо handle
  conflictWin.addEventListener('load', () => {
    conflictWin._localDirHandle = state.localDirHandle || null;
  });
}

async function syncRun(direction) {
  if (!state.syncAnalysis) return;
  setSyncBtns(false);

  const { runSync } = await import(chrome.runtime.getURL('src/utils/sync.js'));
  const arrow = direction === 'to-cloud' ? '↑' : '↓';

  const result = await runSync({
    direction,
    analysis: state.syncAnalysis,
    syncCloud:   state.syncAnalysis.syncCloud,
    cloudId:     state.syncAnalysis.cloudId,
    cloudToken:  state.syncAnalysis.cloudToken,
    onProgress: ({ done, total, name }) => {
      setSyncStatus(`${arrow} ${done}/${total}: ${name}`, 'var(--text2,#aaa)');
    },
  });

  if (result.error) {
    setSyncStatus(`⚠ Помилка: ${result.error}`, 'var(--warn,#FF9800)');
    return;
  }
  setSyncStatus(`✓ Готово — синхронізовано ${result.done} файлів`, 'var(--ok,#4CAF50)');
  state.syncAnalysis = null;
}



// ── Lite mode ─────────────────────────────────────────────────────────────────

function applyAppMode(mode) {
  state.appMode = mode;
  const isLite = mode === 'lite';

  // Ширина попапу
  document.body.classList.toggle('lite-mode', isLite);

  // Новий toggle-mode
  const toggleModeBtn = $('toggle-mode');
  if (toggleModeBtn) toggleModeBtn.textContent = isLite ? t('modeProBtn') : t('modeLiteBtn');

  // Стара сумісність
  $('toggle-lite')?.classList.toggle('active', isLite);
  $('toggle-pro')?.classList.toggle('active', !isLite);

  const liteScr = $('scr-lite');
  const nav = $('steps-nav');
  if (liteScr) liteScr.classList.toggle('active', isLite);
  if (nav) nav.style.display = isLite ? 'none' : '';
  const hdrSteps = document.getElementById('hdr-steps');
  if (hdrSteps) hdrSteps.style.display = isLite ? 'none' : '';

  if (!isLite) {
    document.querySelectorAll('.screen:not(#scr-lite)').forEach(s => s.classList.remove('active'));
    chrome.storage.local.get(['mbConsent', 'mbLastStep', 'processingState']).then(r => {
      if (r.processingState?.running) {
        goTo(3); // йде обробка — показуємо екран обробки
      } else {
        goTo(r.mbLastStep === 2 ? 2 : (r.mbConsent ? 1 : 0));
      }
    });
  } else {
    chrome.storage.local.get('mbConsent').then(r => {
      if (!r.mbConsent) {
        // Перший запуск — показуємо згоду
        liteScr.classList.remove('active');
        document.querySelectorAll('.screen:not(#scr-lite)').forEach(s => s.classList.remove('active'));
        goTo(0);
      } else {
        document.querySelectorAll('.screen:not(#scr-lite)').forEach(s => s.classList.remove('active'));
        checkPrefetchStatus();
      }
    });
  }
}

window.__setAppMode = async (mode) => {
  applyAppMode(mode);
  const s = (await chrome.storage.local.get('mbSettings'))?.mbSettings || {};
  await chrome.storage.local.set({ mbSettings: { ...s, appMode: mode } });
  if (mode === 'pro') {
    const consent = await chrome.storage.local.get('mbConsent');
    goTo(consent.mbConsent ? 1 : 0);
  }
};

function liteLog(text, type) {
  const box = $('lite-log-box');
  if (!box) return;
  box.style.display = 'block';
  const now = new Date().toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  box.innerHTML = `<div class="log-line"><span class="log-time">${now}</span><span class="${type ? 'c-' + type : ''}">${text}</span></div>`;
}

function liteSetStatus(text, type) {
  const outer = $('lite-progress-outer');
  if (outer) outer.style.display = 'block';
  const bar = $('lite-status-bar');
  if (bar) bar.style.display = 'flex';
  const dot = $('lite-s-dot');
  const txt = $('lite-s-text');
  if (dot) dot.className = `dot ${type || 'idle'}`;
  if (txt) txt.textContent = text;
}

function liteSetProgress(done, total) {
  const wrap = $('lite-progress-wrap');
  if (wrap) wrap.style.display = 'block';
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const fill = $('lite-prog-fill');
  if (fill) fill.style.width = pct + '%';
  const label = $('lite-prog-label');
  if (label) label.textContent = `${done} / ${total} ${t('sessionsOf')}`;
  const pctEl = $('lite-prog-pct');
  if (pctEl) pctEl.textContent = pct + '%';
}

function updateLiteLocalPathDisplay(name, granted = true) {
  const el = $('lite-local-path');
  if (!el) return;
  if (name) {
    el.textContent = "/" + name;
    el.classList.add('set');
    el.style.display = '';
  } else {
    el.textContent = '';
    el.classList.remove('set');
    el.style.display = 'none';
  }
  el.style.opacity = '1';
  el.style.color = granted ? '#f6f1eb' : '#aca39b';
}

function showLiteRestoreHint(show) {
  const hint = $('lite-restore-hint');
  if (hint) hint.style.display = show ? 'flex' : 'none';
}

async function restoreLiteHandle() {
  const handle = await loadLocalHandle();
  if (!handle) return;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      state.localDirHandle = handle;
      updateLiteLocalPathDisplay(handle.name);
      showLiteRestoreHint(false);
    } else {
      updateLiteLocalPathDisplay(handle.name, false);
      state.localDirHandle = handle;
      showLiteRestoreHint(true);
    }
  } catch (_) {}
}

function buildLiteConfig() {
  return {
    platform: state.platform === 'other' ? ($('lite-plat-name')?.value || 'model') : state.platform,
    storage: 'local',
    mode: 'auto',
    aiPlatform: 'mistral',
    archiveMode: 'full',
    shortFormat: 'both',
    blockSize: 50,
    cloudId: '',
    driveToken: '',
    localDirHandle: state.localDirHandle,
    localPath: state.localDirHandle?.name || "",
    apiKey: $('lite-api-key').value,
    openrouterModel: null,
    numStart: 1,
    numDigits: 4,
    archiveSizeMB: 2,
    shortDelay: 15,
    limitWaitMinutes: 60,
    skipLast: false,
    sessions: [],
  };
}

function bindLiteEvents() {
  // Новий toggle-mode
  $('toggle-mode')?.addEventListener('click', () => {
    window.__setAppMode(state.appMode === 'pro' ? 'lite' : 'pro');
  });
  // Стара сумісність
  if ($('toggle-lite')) $('toggle-lite').onclick = () => window.__setAppMode('lite');
  if ($('toggle-pro')) $('toggle-pro').onclick = () => window.__setAppMode('pro');

  // Платформа
  bindChipRow('lite-plat-row', v => {
    state.platform = v;
    toggle('lite-plat-name-wrap', v === 'other');
    saveSettings();
    checkPrefetchStatus();
  });
  setActiveChip('lite-plat-row', state.platform);

  $('lite-btn-pick-folder').onclick = async () => {
    const existing = state.localDirHandle;
    if (existing) {
      try {
        const perm = await existing.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const granted = await existing.requestPermission({ mode: 'readwrite' });
          if (granted === 'granted') {
            updateLiteLocalPathDisplay(existing.name, true);
            showLiteRestoreHint(false);
          }
          return;
        }
      } catch (_) {}
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveLocalHandle(handle);
      state.localDirHandle = handle;
      updateLiteLocalPathDisplay(handle.name);
      showLiteRestoreHint(false);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('lite pick folder:', e);
    }
  };

  $('lite-btn-onboarding').onclick = () => {
    window.open('https://mistral.ai/', '_blank');
  };

  $('lite-btn-check-key').onclick = async () => {
    const btn = $('lite-btn-check-key');
    const status = $('lite-key-status');
    const apiKey = $('lite-api-key').value.trim();
    if (!apiKey) {
      status.style.display = 'block';
      status.style.color = 'var(--warn,#FF9800)';
      status.textContent = t('enterApiKey');
      return;
    }
    btn.disabled = true;
    btn.textContent = t('checking');
    status.style.display = 'none';
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_LIMIT', apiKey, platform: 'mistral', openrouterModel: null });
    btn.disabled = false;
    btn.textContent = t('btnCheckKey');
    status.style.display = 'block';
    status.style.color = res.ok ? 'var(--ok,#4CAF50)' : 'var(--warn,#FF9800)';
    status.textContent = res.message;
  };

  $('lite-api-key').oninput = async () => {
    const val = $('lite-api-key').value;
    const s = (await chrome.storage.local.get('mbSettings'))?.mbSettings || {};
    const apiKeys = { ...(s.apiKeys || {}), mistral: val };
    await chrome.storage.local.set({ mbSettings: { ...s, apiKeys, aiPlatform: 'mistral', apiKey: val, apiKeyFor: 'mistral' } });
  };

  $('lite-btn-book').onclick = async () => {
    const btn = $('lite-btn-book');
    const status = $('lite-book-status');
    if (!state.localDirHandle) {
      status.style.display = 'block';
      status.style.color = 'var(--warn,#FF9800)';
      status.textContent = t('pickFolderFirst');
      return;
    }
    btn.disabled = true;
    { const _bt = document.getElementById('lite-btn-book-text'); if (_bt) _bt.textContent = ' ' + t('starting'); }
    status.style.display = 'none';

    const config = buildLiteConfig();
    const bookConfig = { includeTags: false, includeMemory: true, includeShorts: true, includeFulls: true, includeCombined: true, maxSizeMB: 0.5 };

    const onProgress = (msg) => {
      if (msg.type === 'BOOK_PROGRESS') {
        { const _bt = document.getElementById('lite-btn-book-text'); if (_bt) _bt.textContent = ' ' + ' ' + msg.text; }
      } else if (msg.type === 'BOOK_DONE') {
        chrome.runtime.onMessage.removeListener(onProgress);
        { const _bt = document.getElementById('lite-btn-book-text'); if (_bt) _bt.textContent = ' ' + t('bookDone'); }
        btn.style.background = 'var(--success,#4CAF50)';
        setTimeout(() => { btn.disabled = false; const _bt = document.getElementById('lite-btn-book-text'); if (_bt) _bt.textContent = ' ' + t('bookCreate'); btn.style.background = ''; }, 3000);
      } else if (msg.type === 'BOOK_ERROR') {
        chrome.runtime.onMessage.removeListener(onProgress);
        btn.disabled = false;
        { const _bt = document.getElementById('lite-btn-book-text'); if (_bt) _bt.textContent = ' ' + t('bookCreate'); }
        status.style.display = 'block';
        status.style.color = 'var(--warn,#FF9800)';
        status.textContent = t('bookError') + ' ' + (msg.error || '');
      }
    };
    chrome.runtime.onMessage.addListener(onProgress);
    chrome.runtime.sendMessage({ type: 'CREATE_BOOK', config, bookConfig });
  };

  let liteRunning = false;
  const setLitePlayIcon = (mode) => { const e = document.getElementById('lite-icon-play'); if (e) e.innerHTML = icon(mode === 'stop' ? 'square' : 'play'); };
  let liteStopping = false;
  let liteSwTimer = null;
  let liteSwTimerSec = 0;
  const startBtn = $('lite-btn-start');

  // Відновлюємо стан якщо процес іде
  chrome.storage.local.get('processingState').then(ps => {
    if (ps.processingState?.running) {
      liteRunning = true;
      { const _st = document.getElementById('lite-btn-start-text'); if (_st) _st.textContent = ' ' + t('btnStop2'); }
      setLitePlayIcon('stop');
      startBtn.style.background = 'var(--warn,#FF9800)';
      liteSetStatus('Обробка...', 'run');
    } else {
      liteRunning = false;
      liteStopping = false;
      clearInterval(liteSwTimer); liteSwTimer = null;
      { const st = document.getElementById('lite-btn-start-text'); if (st) st.textContent = ' ' + t('btnStart'); }
      setLitePlayIcon('play');
      startBtn.style.background = '';
      startBtn.disabled = false;
      if (ps.processingState?.stopped) liteSetStatus('Зупинено', 'warn');
      chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' });
    }
  });

  startBtn.onclick = async () => {
    if (liteRunning) {
      if (liteStopping) return;
      liteStopping = true;
      clearInterval(liteSwTimer); liteSwTimer = null;
      { const _st = document.getElementById('lite-btn-start-text'); if (_st) _st.textContent = ' ' + t('btnStopping'); }
      setLitePlayIcon('stop');
      startBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'STOP_PROCESSING' });
      return;
    }
    if (!state.localDirHandle) {
      liteLog('Оберіть папку перед запуском', 'err');
      return;
    }
    try {
      let perm = await state.localDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await state.localDirHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { liteLog('Доступ до папки не надано', 'err'); return; }
      showLiteRestoreHint(false);
    } catch (e) { liteLog('Помилка дозволу: ' + e.message, 'err'); return; }

    liteRunning = true;
    { const _st = document.getElementById('lite-btn-start-text'); if (_st) _st.textContent = ' ' + t('btnStop2'); }
    setLitePlayIcon('stop');
    startBtn.style.background = 'var(--warn,#FF9800)';
    liteSetStatus('Обробка...', 'run');

    const hint = $('lite-sessions-hint');
    if (hint) { hint.style.display = 'flex'; const _ht = hint.querySelector('span[data-i18n]'); if (_ht) _ht.textContent = t('prefetchLoading'); }
    const config = buildLiteConfig();
    const result = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS', platform: config.platform });
    if (hint) hint.style.display = 'none';

    if (result?.error) {
      liteLog(result.error, 'err');
      liteRunning = false;
      { const st = document.getElementById('lite-btn-start-text'); if (st) st.textContent = ' ' + t('btnStart'); }
      setLitePlayIcon('play');
      startBtn.style.background = '';
      return;
    }
    const sessions = (result || []).filter(s => !state.existing.has(s.index));
    chrome.runtime.sendMessage({ type: 'START_PROCESSING', config: { ...config, sessions } });
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (state.appMode !== 'lite') return;
    switch (msg.type) {
      case 'SW_LOG': {
        if (!liteRunning || liteStopping) break;
        const liteText = msg.text.replace(/^\[.*?\]\s*/, '').slice(0, 60);
        clearInterval(liteSwTimer);
        liteSwTimerSec = 0;
        liteSetStatus(liteText + ' · 0s', 'run');
        liteSwTimer = setInterval(() => {
          liteSwTimerSec++;
          liteSetStatus(liteText + ' · ' + liteSwTimerSec + 's', 'run');
        }, 1000);
        break;
      }
      case 'PROGRESS':
        liteSetProgress(msg.done, msg.total);
        liteLog(`Сесія ${msg.session} — готово`, 'ok');
        break;
      case 'DONE':
        clearInterval(liteSwTimer); liteSwTimer = null;
        liteRunning = false; liteStopping = false;
        { const st = document.getElementById('lite-btn-start-text'); if (st) st.textContent = ' ' + t('btnStart'); }
        setLitePlayIcon('play');
        startBtn.style.background = '';
        startBtn.disabled = false;
        liteSetStatus('Готово ✓', 'ok');
        liteLog('Архів оновлено', 'ok');
        break;
      case 'STOPPED':
        clearInterval(liteSwTimer); liteSwTimer = null;
        liteRunning = false; liteStopping = false;
        { const st = document.getElementById('lite-btn-start-text'); if (st) st.textContent = ' ' + t('btnStart'); }
        setLitePlayIcon('play');
        startBtn.style.background = '';
        startBtn.disabled = false;
        liteSetStatus('Зупинено', 'warn');
        break;
      case 'ERROR_STOP':
        liteRunning = false; liteStopping = false;
        { const st = document.getElementById('lite-btn-start-text'); if (st) st.textContent = ' ' + t('btnStart'); }
        setLitePlayIcon('play');
        startBtn.style.background = '';
        startBtn.disabled = false;
        liteSetStatus('Помилка', 'err');
        liteLog(msg.message || 'Помилка обробки', 'err');
        const h1 = $('lite-sessions-hint'); if (h1) h1.style.display = 'none';
        break;
      case 'STORAGE_ERROR':
        liteRunning = false; liteStopping = false;
        { const st = document.getElementById('lite-btn-start-text'); if (st) st.textContent = ' ' + t('btnStart'); }
        setLitePlayIcon('play');
        startBtn.style.background = '';
        startBtn.disabled = false;
        liteSetStatus('Помилка збереження', 'err');
        showLiteRestoreHint(true);
        const h2 = $('lite-sessions-hint'); if (h2) h2.style.display = 'none';
        break;
    }
  });
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.classList.remove('theme-light', 'theme-dark');
  if (theme) document.documentElement.classList.add('theme-' + theme);
  state.theme = theme;
  const btnLight = $('hdr-theme-light');
  const btnDark  = $('hdr-theme-dark');
  if (!btnLight || !btnDark) return;
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === null && sysDark);
  btnLight.classList.toggle('hdr-theme-active', !dark);
  btnDark.classList.toggle('hdr-theme-active', dark);
}
async function saveTheme(theme) {
  const s = (await chrome.storage.local.get('mbSettings'))?.mbSettings || {};
  await chrome.storage.local.set({ mbSettings: { ...s, theme } });
}

function initIcons() {
  // Лого
  const logo = document.getElementById('hdr-logo-icon');
  if (logo) logo.innerHTML = icon('ai-spark');

  // Хедер
  const btnInfo   = $('hdr-btn-info');
  const btnDonate = $('hdr-btn-donate');
  const btnLight  = $('hdr-theme-light');
  const btnDark   = $('hdr-theme-dark');
  if (btnInfo)   btnInfo.innerHTML   = icon('text-search');
  if (btnDonate) { btnDonate.classList.remove('hdr-theme-active'); btnDonate.innerHTML = '<span data-i18n="btnDonate"></span>' + icon('coffee-cup'); }
  if (btnLight)  btnLight.innerHTML  = icon('sun');
  if (btnDark)   btnDark.innerHTML   = icon('moon');

  // Lite mode — карточки
  const el = id => document.getElementById(id);
  const set = (id, name) => { const e = el(id); if (e) e.innerHTML = icon(name); };
  set('lite-icon-platform',    'cpu');
  set('lite-icon-key',         'key-round');
  set('lite-icon-folder',      'folder');
  set('lite-icon-folder-open', 'folder-open');
  set('lite-icon-warn',        'triangle-alert');
  set('lite-icon-hourglass',   'hourglass');
  set('lite-icon-cloud-warn',  'triangle-alert');

  // Pro mode
  const confirmSnums = document.querySelectorAll('#scr-2 .snum');
  if (confirmSnums[0]) confirmSnums[0].innerHTML = icon('refresh-cw');
  if (confirmSnums[1]) confirmSnums[1].innerHTML = icon('book');

  const procSnum = document.querySelector('#scr-3 .snum');
  if (procSnum) procSnum.innerHTML = icon('hourglass');

  // Дзеркало prefetch-hint → proc-prefetch-hint
  const _srcHint = $('prefetch-hint');
  const _dstHint = $('proc-prefetch-hint');
  if (_srcHint && _dstHint) {
    new MutationObserver(() => {
      _dstHint.innerHTML = _srcHint.innerHTML;
      _dstHint.style.display = _srcHint.style.display;
    }).observe(_srcHint, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }


  set('pro-icon-proc',      'refresh-cw');
  set('pro-icon-done',      'check');
  set('pro-icon-cloud-warn','triangle-alert');
  set('pro-icon-cloud-warn',   'triangle-alert');
  set('lite-icon-book',        'book');
  set('lite-icon-play',        'play');
}

document.addEventListener('DOMContentLoaded', async () => {
  initIcons();

  // Перевірка підтримки File System Access API
  if (typeof window.showDirectoryPicker !== 'function') {
    const _ch = document.getElementById('lite-cloud-only-hint');
    const _ct = document.getElementById('lite-cloud-only-text');
    const _cb = document.getElementById('lite-btn-pick-folder');
    if (_ct) _ct.textContent = t('cloudOnlyHint');
    if (_ch) _ch.style.display = 'flex';
    if (_cb) { _cb.disabled = true; _cb.style.opacity = '0.4'; }
    const _ph = document.getElementById('pro-cloud-only-hint');
    const _pt = document.getElementById('pro-cloud-only-text');
    const _pb = document.getElementById('btn-pick-folder');
    if (_pt) _pt.textContent = t('cloudOnlyHintShort');
    if (_ph) _ph.style.display = 'flex';
    if (_pb) { _pb.disabled = true; _pb.style.opacity = '0.4'; }
  }
  await loadSavedSettings();
  // Завантажити мову
  const langData = await chrome.storage.local.get('mbLang');
  if (langData.mbLang) setLang(langData.mbLang);
  await saveSettings(); // збереження cloudId на верхній рівні
  bindEvents();
  bindLiteEvents();
  updateTree();
  applyLang(); // після bindEvents щоб не конфліктувати
  await restoreLiteHandle();
  const s = (await chrome.storage.local.get('mbSettings'))?.mbSettings || {};
  if (s.apiKeys?.mistral) $('lite-api-key').value = s.apiKeys.mistral;
  // Тема
  applyTheme(s.theme || null);
  $('hdr-theme-light')?.addEventListener('click', async () => {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeVal = sysDark ? 'light' : null;
    applyTheme(themeVal); await saveTheme(themeVal);
  });
  $('hdr-theme-dark')?.addEventListener('click', async () => {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeVal = sysDark ? null : 'dark';
    applyTheme(themeVal); await saveTheme(themeVal);
  });

  // Мова
  $('hdr-lang-ua')?.addEventListener('click', () => { setLang('ua'); applyLang(); });
  $('hdr-lang-en')?.addEventListener('click', () => { setLang('en'); applyLang(); });
  $('hdr-btn-info')?.addEventListener('click', () => { chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/doc.html') }); });
  $('hdr-btn-donate')?.addEventListener('click', () => { chrome.tabs.create({ url: 'https://send.monobank.ua/jar/3D9tga7Emy' }); });

  applyAppMode(state.appMode);
});

function applyLang() {
  // Оновити активну кнопку мови
  const langUa = $('hdr-lang-ua');
  const langEn = $('hdr-lang-en');
  if (langUa && langEn) {
    const isEn = currentLang === 'en';
    langUa.classList.toggle('hdr-theme-active', !isEn);
    langEn.classList.toggle('hdr-theme-active', isEn);
  }

  // Перекласти всі елементи з data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (!val) return;
    const iconSpan = el.querySelector('span[id^="lite-icon-"]');
    if (iconSpan) {
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) { node.textContent = " " + val; return; }
      }
      iconSpan.insertAdjacentText("afterend", " " + val);
    } else {
      el.textContent = val;
    }
  });

  // Перекласти placeholder атрибути
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    const val = t(key);
    if (val) el.placeholder = val;
  });

  // Елементи з іконками — перекладаємо текстовий span окремо
  const restoreText = document.getElementById('lite-restore-hint-text');
  if (restoreText) restoreText.textContent = t('liteRestoreHint');
  const bookText = document.getElementById('lite-btn-book-text');
  if (bookText) bookText.textContent = ' ' + t('btnBook');
  const startText = document.getElementById('lite-btn-start-text');
  if (startText) {
    chrome.storage.local.get('processingState').then(ps => {
      if (!ps.processingState?.running) startText.textContent = ' ' + t('btnStart');
    });
  }

  // Динамічно оновити словникові тексти
  const toggleModeBtn = $('toggle-mode');
  if (toggleModeBtn) {
    toggleModeBtn.textContent = state.appMode === 'lite' ? t('modeProBtn') : t('modeLiteBtn');
  }
  updateModeInfo();

  // Оновити prog-label якщо видимий
  const progLabel = $('prog-label');
  if (progLabel) {
    const parts = progLabel.textContent.match(/^(\d+) \/ (\d+)/);
    if (parts) progLabel.textContent = `${parts[1]} / ${parts[2]} ${t('sessionsOf')}`;
  }
  const liteProgLabel = $('lite-prog-label');
  if (liteProgLabel) {
    const liteParts = liteProgLabel.textContent.match(/^(\d+) \/ (\d+)/);
    if (liteParts) liteProgLabel.textContent = `${liteParts[1]} / ${liteParts[2]} ${t('sessionsOf')}`;
  }
  const progArch = $('prog-arch');
  if (progArch && progArch.textContent) {
    const archParts = progArch.textContent.split(' ');
    if (archParts.length > 1) progArch.textContent = t('archiveLabel') + ' ' + archParts.slice(1).join(' ');
  }
  updateStorLabel();
  updateShortFormatInfo();
}

function updateModeInfo() {
  if ($('mode-info')) $('mode-info').textContent = MODE_INFO()[state.mode] || '';
  if ($('archive-mode-info')) {
    const info = { full: t('archFull'), full_only: t('archFullOnly'), shorts_only: t('archShortsOnly') };
    $('archive-mode-info').textContent = info[state.archiveMode] || '';
  }
}

function updateStorLabel() {
  if ($('stor-label')) $('stor-label').textContent = STOR_LABELS()[state.storage] || STOR_LABELS().drive;
}

function updateShortFormatInfo() {
  if ($('short-format-info')) $('short-format-info').textContent = SHORT_FORMAT_INFO()[state.shortFormat] || '';
}

async function loadSavedSettings() {
  const saved = await chrome.storage.local.get('mbSettings');
  if (saved.mbSettings) {
    const s = saved.mbSettings;
    state.appMode = s.appMode || 'lite';
    state.platform = s.platform || 'claude';
    state.storage = s.storage || 'drive';
    state.mode = s.mode || 'auto';
    state.aiPlatform = s.aiPlatform || 'claude';
    state.archiveMode = s.archiveMode || 'full';
    state.shortFormat = s.shortFormat || 'both';
    state.blockSize = s.blockSize || 50;
    $('api-key').value = (s.apiKeys?.[s.aiPlatform || 'gemini']) || s.apiKey || '';
    const stor = s.storage || 'drive';
    $('cloud-id').value = (s.storageSettings?.[stor]?.cloudId) || s.cloudId || '';
    $('drive-token').value = (s.storageSettings?.[stor]?.token) || s.driveToken || '';
    state.cloudId = $('cloud-id').value;
    state.driveToken = $('drive-token').value;
    $('num-start').value = s.numStart || 1;
    $('num-digits').value = s.numDigits || 4;
    $('arch-size').value = s.archSize || 2;
    $('short-delay').value = s.shortDelay || 65;

    setActiveChip('plat-row', state.platform);
    setActiveChip('stor-row', state.storage);
    setActiveChip('mode-row', state.mode);
    setActiveChip('ai-row', state.aiPlatform);
    setActiveChip('archive-mode-row', state.archiveMode);
    setActiveChip('short-format-row', state.shortFormat);
    if ($('block-size')) $('block-size').value = state.blockSize;
    updateShortFormatUI();
    if (s.openrouterModel) {
      $('model-custom').value = s.openrouterModel;
    }
    updateModelSelect(state.aiPlatform, state.aiPlatform === (s.apiKeyFor || s.aiPlatform) ? $('api-key').value : '', s.openrouterModel);
    updateStorLabels();
    updateModeInfo();
    if (state.storage === 'local') await restoreLocalHandle();
    if (s.syncCloud) {
      state.syncCloud = s.syncCloud;
      setActiveChip('sync-cloud-row', s.syncCloud);

    }
  }

  const consent = await chrome.storage.local.get('mbConsent');
  const ps = await chrome.storage.local.get('processingState');
  if (ps.processingState?.running) {
    const { index, sessions } = ps.processingState;
    clearInterval(proSwTimer);
    proSwTimerSec = 0;
    setStatus(t('procRunning') + ' · 0s', 'run');
    proSwTimer = setInterval(() => {
      proSwTimerSec++;
      setStatus(t('procRunning') + ' · ' + proSwTimerSec + 's', 'run');
    }, 1000);
    setProgress(index, sessions?.length || 0);
    log(t('procResuming'), 'ok');
  } else if (ps.processingState?.stopped && ps.processingState?.index > 0) {
    // Зупинено — залишаємось на налаштуваннях, показуємо лог
    const { index, sessions } = ps.processingState;
    if (consent.mbConsent) goTo(1);
    // Показуємо хінт що є збережений прогрес
    const hint = $('prefetch-hint');
    if (hint) {
      hint.style.display = 'flex';
      hint.style.color = 'var(--warn, #FF9800)';
      hint.textContent = `${t('savedProgress')}: ${index}/${sessions?.length || '?'} ${t('sessionsOf')}. ${t('pressNext')}`;
    }
  } else {
    if (consent.mbConsent) goTo(1);
  }
}

async function saveSettings() {
  const prev = (await chrome.storage.local.get('mbSettings'))?.mbSettings || {};
  const apiKeys = { ...(prev.apiKeys || {}) };
  apiKeys[state.aiPlatform] = $('api-key').value;
  await chrome.storage.local.set({
    mbSettings: {
      appMode: state.appMode,
      platform: state.platform,
      storage: state.storage,
      mode: state.mode,
      aiPlatform: state.aiPlatform,
      archiveMode: state.archiveMode,
      shortFormat: state.shortFormat,
      blockSize: state.blockSize,
      apiKey: $('api-key').value,
      apiKeyFor: state.aiPlatform,
      apiKeys,
      cloudId: $('cloud-id').value,
      driveToken: $('drive-token').value,
      storageSettings: {
        ...(prev.storageSettings || {}),
        [state.storage]: {
          cloudId: $('cloud-id').value,
          token: $('drive-token').value,
        },
      },
      numStart: parseInt($('num-start').value),
      numDigits: parseInt($('num-digits').value),
      archSize: parseFloat($('arch-size').value),
      shortDelay: parseInt($('short-delay').value) || 65,
      openrouterModel: getSelectedModel(),
      syncCloud:      state.syncCloud,
      theme:         prev.theme,
    }
  });
}

// ── Прив'язка подій ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Consent
  $('btn-consent-ok').onclick = async () => {
    await chrome.storage.local.set({ mbConsent: true });
    if (state.appMode === 'lite') {
      applyAppMode('lite');
    } else {
      goTo(1);
    }
  };
  $('btn-consent-no').onclick = () => window.close();

  // Chip rows
  bindChipRow('plat-row', v => {
    state.platform = v;
    toggle('plat-name-wrap', v === 'other');
    updateStorLabels();
    updateTree();
    checkPrefetchStatus();
  });
  bindChipRow('stor-row', async v => {
    state.storage = v;
    const isLocal = v === 'local';
    toggle('cloud-fields', !isLocal);
    toggle('token-fields', !isLocal);
    toggle('local-fields', isLocal);
    toggle('sync-fields', isLocal);
    if (!isLocal) {
      const saved = await chrome.storage.local.get('mbSettings');
      const storSettings = saved.mbSettings?.storageSettings?.[v] || {};
      $('cloud-id').value = storSettings.cloudId || '';
      $('drive-token').value = storSettings.token || '';
      state.cloudId = $('cloud-id').value;
      state.driveToken = $('drive-token').value;
    } else {
      await restoreLocalHandle();
    }
    updateStorLabels();
    updateTree();
    saveSettings();
  });

  // Sync
  bindChipRow('sync-cloud-row', v => {
    state.syncCloud = v;
    state.syncAnalysis = null;
    setSyncBtns(false);
    const el = $('sync-status');
    if (el) el.style.display = 'none';
    saveSettings();
  });
  $('btn-sync-analyze').onclick = syncAnalyze;
  $('btn-sync-to-cloud').onclick = () => syncRun('to-cloud');
  $('btn-sync-to-local').onclick = () => syncRun('to-local');
  bindChipRow('mode-row', v => {
    state.mode = v;
    updateModeInfo();
    toggle('select-panel', v === 'select');
    if (v === 'select') buildGrid();
  });

  bindChipRow('archive-mode-row', v => {
    state.archiveMode = v;
    const info = { full: t('archFull'), full_only: t('archFullOnly'), shorts_only: t('archShortsOnly') };
    updateModeInfo();
    saveSettings();
  });

  bindChipRow('short-format-row', v => {
    state.shortFormat = v;
    updateShortFormatUI();
    saveSettings();
  });
  if ($('block-size')) $('block-size').oninput = () => {
    state.blockSize = parseInt($('block-size').value) || 50;
    saveSettings();
  };

  bindChipRow('ai-row', async v => {
    // зберігаємо ключ поточного провайдера
    const s = (await chrome.storage.local.get('mbSettings'))?.mbSettings || {};
    const apiKeys = s.apiKeys || {};
    apiKeys[state.aiPlatform] = $('api-key').value;
    await chrome.storage.local.set({ mbSettings: { ...s, apiKeys } });
    // переключаємо
    state.aiPlatform = v;
    $('api-key').value = apiKeys[v] || '';
    $('short-delay').value = DELAY_DEFAULTS[v] ?? 10;
    updateAiKeyLabel();
    updateModelSelect(v, apiKeys[v] || '');
    clearLimitStatus();
    saveSettings();
  });

  $('model-select').onchange = () => {
    const val = $('model-select').value;
    toggle('model-custom', val === 'custom');
    if (state.aiPlatform === 'openrouter') {
      $('short-delay').value = OPENROUTER_DELAY_DEFAULTS[val] ?? 30;
    } else if (state.aiPlatform === 'groq') {
      $('short-delay').value = GROQ_DELAY_DEFAULTS[val] ?? 15;
    }
    updateContextWarning(state.aiPlatform, val);
    clearLimitStatus();
    saveSettings();
  };
  $('model-custom').oninput = saveSettings;

  $('btn-refresh-models').onclick = async () => {
    const btn = $('btn-refresh-models');
    btn.textContent = '...';
    btn.disabled = true;
    const { refreshModels } = await import(chrome.runtime.getURL('src/utils/models.js'));
    await refreshModels(state.aiPlatform, $('api-key').value);
    await updateModelSelect(state.aiPlatform, $('api-key').value);
    btn.textContent = t('btnRefreshModels');
    btn.disabled = false;
  };

  // Live updates
  $('cloud-id').oninput = () => { updateTree(); saveSettings(); };
  $('api-key').oninput = saveSettings;
  $('drive-token').oninput = () => {
    saveSettings();
    if (state.storage === 'onedrive' && $('drive-token').value.length > 20) {
      chrome.runtime.sendMessage({ type: 'TOKEN_UPDATED' });
    }
  };
  $('plat-name').oninput = updateTree;
  $('r-from').oninput = buildGrid;
  $('r-to').oninput = buildGrid;

  // Navigation
  $('btn-to-confirm').onclick = async () => {
    // Валідація локальної папки
    if (state.storage === 'local') {
      if (!state.localDirHandle) {
        const handle = await pickLocalFolder();
        if (!handle) return; // юзер скасував
      }
    }
    const config = buildConfig();
    await detectArchiveShortFormat(config);
    buildConfirmTable();
    saveSettings();
    goTo(2);
  };

// ── Префетч даних сесій (тільки для Claude) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PREFETCH_READY') {
      state.prefetchReady = true;
      const btn = $('btn-to-confirm');
      const hint = $('prefetch-hint');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      if (hint) hint.style.display = 'none';
    }
  });

  checkPrefetchStatus();
  $('btn-back').onclick = () => goTo(1);
  $('btn-run').onclick = () => {
    // Перевірка токену хмарного сховища перед стартом
    if (state.storage !== 'local') {
      const token = $('drive-token')?.value?.trim();
      if (!token) {
        const hint = $('prefetch-hint');
        if (hint) {
          hint.style.display = 'flex';
          hint.style.color = 'var(--warn)';
          hint.innerHTML = `<span style="width:100%;text-align:center">${t('noTokenError')}</span>`;
        }
        return;
      }
    }
    goTo(3);
    startProcessing();
  };

  // Processing
  $('btn-resume').onclick = resumeNow;
  $('btn-stop').onclick = saveStop;
  $('btn-stop-main').onclick = saveStop;

  $('btn-pick-folder').onclick = async () => {
    const existing = state.localDirHandle;
    if (existing) {
      try {
        const perm = await existing.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          // Дозволу немає — відновлюємо доступ до існуючої папки
          const granted = await existing.requestPermission({ mode: 'readwrite' });
          if (granted === 'granted') {
            updateLocalPathDisplay(existing.name, true);
            showRestoreHint(false);
          }
          return;
        }
      } catch (_) {}
    }
    // Дозвіл вже є (або handle немає) — обираємо нову папку
    const handle = await pickLocalFolder();
    if (handle) showRestoreHint(false);
  };

  // Check limit
  $('btn-check-limit').onclick = checkLimit;

  // Done
  $('btn-copy-prompt').onclick = copyPrompt;
  $('btn-new-archive').onclick = () => {
    if (state.appMode === 'lite') {
      applyAppMode('lite');
    } else {
      goTo(1);
    }
  };
  $('btn-create-book').onclick = createBook;
}

// ── Навігація ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function goTo(n) {
  const screens = Array.from(document.querySelectorAll('.screen')).filter(s => s.id !== 'scr-lite');
  screens.forEach((s, i) => s.classList.toggle('active', i === n));
  // Ховаємо scr-lite коли показуємо Pro екран
  const liteScr = $('scr-lite');
  if (liteScr) liteScr.classList.remove('active');
  document.querySelectorAll('.ns, .hdr-step').forEach((el, i) => {
    const idx = parseInt(el.dataset.step ?? i);
    el.classList.remove('cur', 'done');
    if (idx === n) el.classList.add('cur');
    else if (idx < n) el.classList.add('done');
  });
  state.currentScreen = n;
  chrome.storage.local.set({ mbLastStep: n });
}

// ── Chips ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function bindChipRow(rowId, cb) {
  document.querySelectorAll(`#${rowId} .chip`).forEach(chip => {
    chip.onclick = () => {
      setActiveChip(rowId, chip.dataset.v);
      cb(chip.dataset.v);
    };
  });
}

function setActiveChip(rowId, val) {
  document.querySelectorAll(`#${rowId} .chip`).forEach(c => {
    c.classList.toggle('active', c.dataset.v === val);
  });
}

// ── Tree preview ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function updateTree() {
  const treeEl = $('tree-preview');
  if (!treeEl) return;
  const plat = getPlatName();
  const isLocal = state.storage === 'local';
  let root;
  if (isLocal) {
    const name = state.localDirHandle?.name || 'обрана-папка';
    root = `[Локально: ${name}]`;
  } else {
    const ci = $('cloud-id')?.value || 'root-id';
    const storName = { drive: 'Drive', onedrive: 'OneDrive', dropbox: 'Dropbox' }[state.storage] || 'Drive';
    root = `[${storName}: ${ci.slice(0, 14)}${ci.length > 14 ? '...' : ''}]`;
  }
  const lines = [
    `${root}/`,
    `  ${plat}/`,
    `    full/         → повні тексти`,
    `    short/        → стислі записи`,
    `    _system/      → службові сесії`,
    `    memory.txt    → зміст архіву`,
  ];
  treeEl.textContent = lines.join('\n');
}

const TOKEN_LINKS = {
  drive: {
    href: 'https://developers.google.com/oauthplayground',
    hint: 'Дія ~1 годину. Отримати на OAuth 2.0 Playground → Drive API v3',
  },
  onedrive: {
    href: 'https://developer.microsoft.com/en-us/graph/graph-explorer',
    hint: 'Дія ~1 годину. Отримати на Microsoft Graph Explorer',
  },
  dropbox: {
    href: 'https://www.dropbox.com/developers/apps',
    hint: 'Дія ~4 години. Отримати на Dropbox App Console → Generated access token',
  },
};

function updateStorLabels() {
  const isLocal = state.storage === 'local';
  const cf = $('cloud-fields');
  const tf = $('token-fields');
  const lf = $('local-fields');
  const sf = $('sync-fields');
  if (cf) cf.classList.toggle('hidden', isLocal);
  if (tf) tf.classList.toggle('hidden', isLocal);
  if (lf) lf.classList.toggle('hidden', !isLocal);
  if (sf) sf.classList.toggle('hidden', !isLocal);

  updateStorLabel();
  if (!isLocal) {
    const tl = TOKEN_LINKS[state.storage] || TOKEN_LINKS.drive;
    const link = document.getElementById('token-link');
    const hint = document.getElementById('token-hint');
    if (link) link.href = tl.href;
    if (hint) hint.textContent = tl.hint;
  }
  updateAiKeyLabel();
}

function updateAiKeyLabel() {
  const label = $('api-key-label');
  const link = $('api-key-link');
  const text = API_LABELS[state.aiPlatform] || API_LABELS.claude;
  label.childNodes[0].textContent = text + ' ';
  if (link) {
    link.href = API_KEY_LINKS[state.aiPlatform] || '#';
    link.style.display = (API_KEY_LINKS[state.aiPlatform] && API_KEY_LINKS[state.aiPlatform] !== '#') ? '' : 'none';
  }
}

function updateShortFormatUI() {
  const v = state.shortFormat;
  updateShortFormatInfo();
  if ($('block-size-wrap')) $('block-size-wrap').style.display = v === 'singles' ? 'none' : '';
}

async function detectArchiveShortFormat(config) {
  // Визначаємо формат по вмісту архіву
  try {
    const result = await chrome.runtime.sendMessage({ type: 'DETECT_SHORT_FORMAT', config });
    if (!result) return;
    const { hasSingles, hasBlocks } = result;
    let detected = null;
    if (hasSingles && hasBlocks) detected = 'both';
    else if (hasSingles) detected = 'singles';
    else if (hasBlocks) detected = 'blocks';

    if (!detected) return; // архів порожній — лишаємо налаштування

    const warn = $('short-format-warn');
    if (detected !== state.shortFormat) {
      // Розбіжність — попереджаємо і перемикаємо на режим архіву
      if (warn) {
        warn.style.display = 'block';
        const labels = { singles: 'окремі файли', blocks: 'блоки', both: 'обидва' };
        warn.textContent = `⚠️ Архів містить: ${labels[detected]}. Налаштування змінено відповідно.`;
      }
      state.shortFormat = detected;
      setActiveChip('short-format-row', detected);
      if ($('block-size')) $('block-size').value = state.blockSize;
      updateShortFormatUI();
      saveSettings();
    } else {
      if (warn) warn.style.display = 'none';
    }
  } catch (_) {}
}


// ── Session grid ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function buildGrid() {
  const from = parseInt($('r-from').value) || 1;
  const to = Math.min(parseInt($('r-to').value) || 30, from + 79);
  const grid = $('sess-grid');
  grid.innerHTML = '';
  for (let i = from; i <= to; i++) {
    const d = document.createElement('div');
    d.className = 'sbox' + (state.existing.has(i) ? ' ex' : state.selected.has(i) ? ' sel' : '');
    d.textContent = i;
    d.onclick = () => {
      if (state.existing.has(i)) return;
      if (state.selected.has(i)) { state.selected.delete(i); d.classList.remove('sel'); }
      else { state.selected.add(i); d.classList.add('sel'); }
    };
    grid.appendChild(d);
  }
}

// ── Ручний запуск префетчу ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function triggerPrefetch() {
  const hint = $('prefetch-hint');
  const btn = $('btn-prefetch');

  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  if (!tabs.length) {
    if (hint) {
      hint.style.display = 'flex';
      hint.style.color = 'var(--warn, #FF9800)';
      hint.textContent = t('openSite') + ' Claude';
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = t('prefetchLoading'); }
  if (hint) {
    hint.style.display = 'flex';
    hint.style.color = 'var(--text2, #aaa)';
    hint.textContent = t('prefetchLoading');
  }

  const tab = tabs[0];
  // Спочатку інжектуємо content script (якщо ще не завантажений)
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['src/content/claude.js'],
  }).catch(() => null);

  // Чекаємо ініціалізації
  await new Promise(r => setTimeout(r, 500));

  // Запускаємо префетч у вкладці
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => { if (typeof window.__mbPrefetchDates === 'function') window.__mbPrefetchDates(); },
  }).catch(() => null);

  // Далі checkPrefetchStatus відстежить прогрес
  checkPrefetchStatus();

  if (btn) { btn.disabled = false; btn.textContent = t('prefetchList'); }
}

// ── Перевірка статусу префетчу ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let _prefetchInterval = null;
let _prefetchCallId = 0;

async function checkPrefetchStatus() {
  const callId = ++_prefetchCallId;
  if (_prefetchInterval) { clearInterval(_prefetchInterval); _prefetchInterval = null; }
  const isLite = state.appMode === 'lite';
  const hint = isLite ? $('lite-prefetch-hint') : $('prefetch-hint');
  const procHint = $('proc-prefetch-hint');
  const openHint = isLite ? $('lite-open-hint') : hint;
  const prefetchBtn = isLite ? null : $('btn-prefetch');
  const btn = $('btn-to-confirm');

  // Скидаємо openHint при кожному виклику
  if (openHint && openHint !== hint) openHint.style.display = 'none';

  const platformUrls = {
    claude: 'https://claude.ai/*',
    gpt: 'https://chatgpt.com/*',
    gemini: 'https://gemini.google.com/*',
    deepseek: 'https://chat.deepseek.com/*',
  };

  const url = platformUrls[state.platform];
  if (!url) return;

  const platformNames = { claude: 'Claude', gpt: 'ChatGPT', gemini: 'Gemini', deepseek: 'DeepSeek' };
  const platName = platformNames[state.platform] || state.platform;

  // Показуємо "Очікування..." одразу, ще до перевірки вкладок
  if (hint) {
    hint.style.display = 'flex';
    hint.style.color = 'var(--text2, #aaa)';
    const _hIcon = icon('hourglass').replace('width="24" height="24"', 'width="16" height="16"');
    hint.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center;width:100%"><span style="width:16px;height:16px;display:inline-flex;flex-shrink:0">${_hIcon}</span><span>${t('prefetchWaiting') || 'Очікування...'}</span></span>`;
  }

  const allTabs = await chrome.tabs.query({ url });
  if (!allTabs.length) {
    if (openHint) {
      openHint.style.display = 'flex';
      openHint.style.color = 'var(--warn, #FF9800)';
      openHint.innerHTML = icon('triangle-alert').replace('width="24" height="24"', 'width="14" height="14"') + ` ${t('openSite')} ${platName}`;
    }
    const watchInterval = setInterval(async () => {
      const tabs = await chrome.tabs.query({ url });
      if (tabs.length) {
        clearInterval(watchInterval);
        if (hint) hint.style.display = 'none';
        if (openHint) openHint.style.display = 'none';
        checkPrefetchStatus();
      }
    }, 2000);
    return;
  }

  const tabs = await chrome.tabs.query({ url, active: true });
  const tab = tabs.length ? tabs[0] : allTabs[0];

  // Інжектуємо content script якщо треба
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [`src/content/${state.platform}.js`],
  }).catch(() => null);

  // Чекаємо поки content script завершить ініціалізацію + показуємо живий прогрес
  const waitMax = ['gemini', 'deepseek'].includes(state.platform) ? 300 : 20;
  for (let i = 0; i < waitMax; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (callId !== _prefetchCallId) return;
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ done: window.__mbLoadDone, status: window.__mbPrefetchStatus?.() }),
    }).catch(() => null);
    const r = res?.[0]?.result;
    if (r?.status?.total > 0 && hint) {
      hint.style.display = 'flex';
      hint.style.color = 'var(--text2, #aaa)';
      hint.textContent = `${t('prefetchLoading')} ${r.status.total}`;
    }
    if (r?.done === true) break;
  }
  if (callId !== _prefetchCallId) return;

  // Перевіряємо одразу
  const initResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__mbPrefetchStatus?.() || { ready: false, total: 0, loaded: 0 },
  }).catch(() => null);
  const initStatus = initResult?.[0]?.result;

  if (initStatus?.ready || (initStatus?.total > 0 && initStatus?.loaded >= initStatus?.total)) {
    if (hint) {
      hint.style.display = 'flex';
      hint.style.color = 'var(--ok, #4CAF50)';
      hint.textContent = state.platform === 'claude'
        ? `${t('prefetchLoaded')} ${initStatus.loaded}/${initStatus.total}`
        : initStatus.total > 0
          ? `${t('prefetchLoaded')}: ${initStatus.total}`
          : `${t('prefetchLoaded')}`;
    }
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    return;
  }

  // Чекаємо завершення
  _prefetchInterval = setInterval(async () => {
    const stillOpen = await chrome.tabs.query({ url });
    if (!stillOpen.length) {
      clearInterval(_prefetchInterval); _prefetchInterval = null;
      if (openHint) {
        openHint.style.display = 'flex';
        openHint.style.color = 'var(--warn, #FF9800)';
        openHint.innerHTML = icon('triangle-alert').replace('width="24" height="24"', 'width="14" height="14"') + ` ${t('openSite')} ${platName}`;
      }
      const watchInterval = setInterval(async () => {
        const tabs2 = await chrome.tabs.query({ url });
        if (tabs2.length) {
          clearInterval(watchInterval);
          if (hint) hint.style.display = 'none';
          checkPrefetchStatus();
        }
      }, 2000);
      return;
    }

    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__mbPrefetchStatus?.() || { ready: false, total: 0, loaded: 0 },
    }).catch(() => null);
    const s = r?.[0]?.result;
    if (!s) { clearInterval(_prefetchInterval); _prefetchInterval = null; return; }

    if (s.ready || (s.loaded >= s.total && s.total > 0)) {
      clearInterval(_prefetchInterval); _prefetchInterval = null;
      state.prefetchReady = true;
      if (hint) {
        hint.style.display = 'flex';
        hint.style.color = 'var(--ok, #4CAF50)';
        hint.textContent = state.platform === 'claude'
          ? `${t('prefetchLoaded')} ${s.loaded}/${s.total}`
          : s.total > 0
            ? `${t('prefetchLoaded')}: ${s.total}`
            : `${t('prefetchLoaded')}`;
      }
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    } else if (s.total > 0) {
      if (hint) {
        hint.style.display = 'flex';
        hint.style.color = 'var(--text2, #aaa)';
        hint.textContent = state.platform === 'claude'
          ? `↻ Сортування за датою... ${s.loaded}/${s.total}`
          : `${t('prefetchLoading')} ${s.loaded}`;
      }
    }
  }, 1000);
}

// ── Confirm table ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function buildConfirmTable() {
  const digits = parseInt($('num-digits').value) || 4;
  const start = parseInt($('num-start').value) || 1;
  const hint = $('prefetch-hint');
  const prefetchInfo = hint?.textContent?.match(/(\d+)\/(\d+)/);
  const singleCount = hint?.textContent?.match(/:\s*(\d+)$/);
  const totalSessions = prefetchInfo ? `${prefetchInfo[1]} ${t('loaded')}` : singleCount ? `${singleCount[1]} ${t('loaded')}` : '—';
  const modeLabels = {
    new: t('ctModeNew'),
    auto: t('ctModeAuto'),
    all: t('ctModeAll'),
    select: `${state.selected.size} ${t('ctModeSelect')}`,
  };
  const hasAI = state.archiveMode !== 'full_only';
  const modelLabel = hasAI ? ($('model-select')?.value || state.aiPlatform) : null;
  const aiPlatLabel = { claude: 'Claude', gemini: 'Gemini', gpt: 'GPT', deepseek: 'DeepSeek', openrouter: 'OpenRouter', qwen: 'Qwen', huggingface: 'HuggingFace', mistral: 'Mistral', groq: 'Groq' }[state.aiPlatform] || state.aiPlatform;

  const rows = [
    [t('ctPlatform'), getPlatName()],
    [t('ctStorage'), { drive: 'Google Drive', onedrive: 'OneDrive', dropbox: 'Dropbox', local: `${t('ctLocalVal')}: ${state.localDirHandle?.name || '?'}` }[state.storage]],
    [t('ctNumer'), `${t('ctNumerFrom')} ${String(start).padStart(digits, '0')} (${digits} ${t('ctNumerDigits')})`],
    [t('ctSessions'), modeLabels[state.mode] || state.mode],
    [t('ctTotal'), totalSessions],
    [t('ctLimit'), `${$('arch-size').value} MB`],
    ...(hasAI ? [
      [t('ctProvider'), aiPlatLabel],
      [t('ctAiModel'), modelLabel || '—'],
      [t('ctShorts'), { singles: t('ctShortSingles'), blocks: `${t('ctShortBlocks')} ${state.blockSize}`, both: `${t('ctShortBoth')} ${state.blockSize})` }[state.shortFormat] || state.shortFormat],
    ] : []),
    [t('ctSystem'), t('ctSystemVal')],
    [t('ctPrompt'), t('ctPromptVal')],
    ...($('skip-last').checked ? [[t('ctSkip'), t('ctSkipVal')]] : []),
  ];
  $('confirm-table').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
}

// ── Processing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function startProcessing() {
  const config = buildConfig();

  // Для local storage — запитуємо дозвіл заздалегідь (поки popup відкритий)
  if (config.storage === 'local') {
    const handle = state.localDirHandle;
    if (!handle) { log('Оберіть локальну папку перед запуском', 'err'); return; }
    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { log('Доступ до папки не надано', 'err'); return; }
      showRestoreHint(false);
    } catch (e) { log('Помилка дозволу: ' + e.message, 'err'); return; }
  }

  const result = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS', platform: config.platform });
  if (result?.error) { log(result.error, 'err'); return; }

  let sessions = filterSessions(result || [], config);

  chrome.runtime.sendMessage({ type: 'START_PROCESSING', config: { ...config, sessions } });
}

function buildConfig() {
  const cloudId = $('cloud-id').value || state.cloudId || '';
  const driveToken = $('drive-token').value || state.driveToken || '';
  return {
    platform: state.platform === 'other' ? $('plat-name').value || 'model' : state.platform,
    storage: state.storage,
    mode: state.mode,
    aiPlatform: state.aiPlatform,
    archiveMode: state.archiveMode,
    shortFormat: state.shortFormat,
    blockSize: state.blockSize || 50,
    cloudId,
    driveToken,
    localDirHandle: state.storage === 'local' ? state.localDirHandle : null,
    localPath: state.storage === 'local' ? (state.localDirHandle?.name || '') : '',
    apiKey: $('api-key').value,
    openrouterModel: getSelectedModel(),
    numStart: parseInt($('num-start').value) || 1,
    numDigits: parseInt($('num-digits').value) || 4,
    archiveSizeMB: parseFloat($('arch-size').value) || 2,
    shortDelay: parseInt($('short-delay').value) || 65,
    limitWaitMinutes: 60,
    skipLast: $('skip-last').checked,
    sessions: [],
  };
}

function filterSessions(all, config) {
  if (config.mode === 'select') return all.filter(s => state.selected.has(s.index));
  if (config.mode === 'all') return all;
  if (config.mode === 'new') {
    const maxExisting = Math.max(0, ...state.existing);
    return all.filter(s => s.index > maxExisting);
  }
  return all.filter(s => !state.existing.has(s.index));
}

function resumeNow() {
  clearInterval(state.ctimer);
  toggle('limit-banner', false);
  chrome.runtime.sendMessage({ type: 'RESUME_PROCESSING' });
}

function saveStop() {
  clearInterval(state.ctimer);
  toggle('limit-banner', false);
  chrome.runtime.sendMessage({ type: 'STOP_PROCESSING' });
  setStatus(t('stopStatus'), 'warn');
  log(t('stopLog'), 'warn');
}


// ── Слухач повідомлень від background ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let proSwTimer = null;
let proSwTimerSec = 0;

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'PROGRESS':
      setProgress(msg.done, msg.total, msg.archName);
      log(`Сесія ${msg.session} — готово`, 'ok');
      break;

    case 'MISSING_FOUND':
      if (msg.count === 0) {
        log('✅ Пропущених сесій не знайдено — архів повний', 'ok');
        setStatus('Архів повний', 'ok');
      } else {
        log(`🔍 ${t('foundMissing')}: ${msg.count} — ${t('startingProc')}`, 'warn');
        setStatus(`Обробка ${msg.count} пропущених сесій...`, 'info');
      }
      break;

    case 'SKIPPED':
      log(`⚡ Сесія ${msg.session} пропущена (${msg.reason})`, 'warn');
      break;

    case 'RATE_LIMITED':
      setStatus('Ліміт моделі. Очікування...', 'warn');
      toggle('limit-banner', true);
      startCountdown(msg.waitMinutes * 60);
      break;

    case 'LIMIT_RESUMED':
      toggle('limit-banner', false);
      setStatus('Відновлення...', 'run');
      break;

    case 'RATE_LIMITED_STOP':
      setStatus('Ліміт вичерпано — зупинення. Спробуй pivot UTC.', 'warn');
      log('Ліміт API вичерпано після 3 спроб. Відновлення — кнопка "Продовжити зараз".', 'warn');
      toggle('limit-banner', true);
      break;

    case 'TOKEN_EXPIRED_STOP':
      setStatus('🔴 Токен OneDrive протух — обробку зупинено.', 'error');
      log('Оновити access_token у Graph Explorer і запустити знову.', 'error');
      break;

    case 'STORAGE_ERROR':
      setStatus('🔴 Помилка збереження — обробку зупинено.', 'error');
      log(`Перевірте токен доступу до хмарного сховища і запустіть знову. ${msg.message || ''}`, 'error');
      if (state.storage === 'local') showRestoreHint(true);
      break;

    case 'ERROR_STOP':
      setStatus('🔴 Обробку зупинено після 3 помилок поспіль.', 'error');
      log(`Помилка: ${msg.message || 'невідома'}. Перевірте API-ключ, модель або розмір сесій і запустіть знову.`, 'error');
      break;

    // ── НОВЕ: вкладку закрито під час обробки ──
    case 'TAB_CLOSED':
      setStatus('⚠️ Вкладку Claude закрито — обробку зупинено', 'warn');
      log('Відкрийте вкладку Claude щоб продовжити', 'warn');
      break;

    case 'SW_LOG': {
      const proText = msg.text.replace(/^\[.*?\]\s*/, '').slice(0, 70);
      clearInterval(proSwTimer);
      proSwTimerSec = 0;
      setStatus(proText + ' · 0s', 'run');
      proSwTimer = setInterval(() => {
        proSwTimerSec++;
        setStatus(proText + ' · ' + proSwTimerSec + 's', 'run');
      }, 1000);
      break;
    }

    case 'DONE':
      buildDoneScreen(msg.systemPrompt);
      goTo(4);
      break;
  }
});

// ── Перевірка ліміту ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function checkLimit() {
  const btn = $('btn-check-limit');
  const status = $('limit-status');
  const apiKey = $('api-key').value.trim();
  const platform = state.aiPlatform;

  if (!apiKey) {
    status.style.display = 'block';
    status.style.color = 'var(--warn)';
    status.textContent = t('enterApiKey');
    return;
  }

  btn.disabled = true;
  btn.textContent = t('checking');
  status.style.display = 'none';

  const res = await chrome.runtime.sendMessage({ type: 'CHECK_LIMIT', apiKey, platform, openrouterModel: getSelectedModel() });

  btn.disabled = false;
  btn.textContent = t('btnCheckLimit');
  status.style.display = 'block';
  status.style.color = res.ok ? 'var(--ok, #4CAF50)' : 'var(--warn, #FF9800)';
  status.textContent = res.message;
}

// ── UI helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function updateContextWarning(provider, modelId) {
  const el = $('model-context-warn');
  if (!el) return;

  // Ліміт обробки (символи які реально подаємо в AI)
  const PROCESS_LIMITS = {
    groq: { default: 15000, 'llama-3.1-8b-instant': 12000 },
    mistral: { default: 20000 },
    huggingface: { default: 20000 },
  };

  let hint = '';
  try {
    const mod = await import(chrome.runtime.getURL('src/utils/models.js'));
    // Підказка з MODEL_META
    const metaHint = mod.getModelHint(modelId);
    if (metaHint) {
      hint = metaHint;
    } else {
      // Підказка з живих даних моделі (OpenRouter дає context_length)
      const sel = $('model-select');
      const opt = sel ? Array.from(sel.options).find(o => o.value === modelId) : null;
      if (opt?.dataset?.context) {
        const ctx = parseInt(opt.dataset.context);
        const ctxStr = ctx >= 1000000 ? `${ctx/1000000}M` : `${(ctx/1000).toFixed(0)}K`;
        hint = `${ctxStr} контекст`;
      }
    }
  } catch(e) {}

  // Додаємо попередження про скорочення якщо потрібно
  const provLimits = PROCESS_LIMITS[provider];
  if (provLimits) {
    const limit = provLimits[modelId] || provLimits.default;
    el.style.color = 'var(--warn,#FF9800)';
    el.textContent = (hint ? hint + ' · ' : '') + `${t('contextTrimmed')} ${limit.toLocaleString()} ${t('symbols')}`;
  } else if (hint) {
    el.style.color = 'var(--ok,#4CAF50)';
    el.textContent = hint;
  } else {
    el.style.color = 'var(--ok,#4CAF50)';
    el.textContent = t('fullContext');
  }
}

function clearLimitStatus() {
  const s = $('limit-status');
  if (s) { s.style.display = 'none'; s.textContent = ''; }
}

function setStatus(text, type) {
  $('s-dot').className = `dot ${type || 'idle'}`;
  $('s-text').textContent = text;
}

function setProgress(done, total, archName) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  $('prog-fill').style.width = pct + '%';
  $('prog-label').textContent = `${done} / ${total} ${t('sessionsOf')}`;
  $('prog-pct').textContent = pct + '%';
  if (archName) $('prog-arch').textContent = t('archiveLabel') + ' ' + archName;
}

function log(text, type) {
  const box = $('log-box');
  const now = new Date().toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = document.createElement('div');
  d.className = 'log-line';
  d.innerHTML = `<span class="log-time">${now}</span><span class="${type ? 'c-' + type : ''}">${text}</span>`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function addArchChip(name, type) {
  const c = document.createElement('div');
  c.className = `arch-chip${type === 'active' ? ' active' : type === 'sys' ? ' sys' : ''}`;
  c.textContent = name;
  $('arch-chips').appendChild(c);
}

function startCountdown(seconds) {
  let rem = seconds;
  state.ctimer = setInterval(() => {
    rem--;
    const m = Math.floor(rem / 60), s = rem % 60;
    const el = $('countdown');
    if (el) el.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    if (rem <= 0) clearInterval(state.ctimer);
  }, 1000);
}

function buildDoneScreen(systemPrompt) {
  const badges = [
    'Архів оновлено',
    '_system/ збережено',
    'memory.txt готовий',
    'Системний промпт ✓',
  ];
  $('done-badges').innerHTML = badges.map(t => `<div class="dbadge">${t}</div>`).join('');
  $('mem-prompt').textContent = systemPrompt || '';
}

function copyPrompt() {
  const text = $('mem-prompt').textContent;
  navigator.clipboard.writeText(text).then(() => {
    $('btn-copy-prompt').textContent = t('copyOk');
    setTimeout(() => $('btn-copy-prompt').textContent = t('copyBtn'), 2000);
  });
}

function createBook() {
  const btn = $('btn-create-book');
  const config = buildConfig();
  const bookConfig = {
    includeTags:     $('book-tags').checked,
    includeMemory:   $('book-memory').checked,
    includeShorts:   $('book-shorts').checked,
    includeFulls:    $('book-fulls').checked,
    includeCombined: $('book-combined').checked,
    maxSizeMB: parseFloat($('book-max-size').value) || null,
  };

  btn.disabled = true;
  btn.textContent = t('starting');

  const reset = () => {
    btn.disabled = false;
    btn.textContent = t('bookCreate');
    btn.style.background = '';
  };

  const onProgress = (msg) => {
    if (msg.type === 'BOOK_PROGRESS') {
      btn.textContent = '\u23F3 ' + msg.text;
    } else if (msg.type === 'BOOK_DONE') {
      chrome.runtime.onMessage.removeListener(onProgress);
      btn.textContent = t('bookDone');
      btn.style.background = 'var(--success, #4CAF50)';
      setTimeout(reset, 3000);
    } else if (msg.type === 'BOOK_ERROR') {
      chrome.runtime.onMessage.removeListener(onProgress);
      reset();
      alert('Помилка: ' + (msg.error || 'невідома'));
    }
  };
  chrome.runtime.onMessage.addListener(onProgress);

  chrome.runtime.sendMessage({ type: 'CREATE_BOOK', config, bookConfig });
}

// ── Utils ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function toggle(id, show) { $(id).classList.toggle('hidden', !show); }
function getPlatName() {
  return state.platform === 'other' ? ($('plat-name').value || 'model') : state.platform;
}

// Провайдери що мають вибір моделі
const MODEL_SELECT_PROVIDERS = ['openrouter', 'gemini', 'groq', 'mistral', 'qwen', 'huggingface'];

function getSelectedModel() {
  const sel = $('model-select').value;
  if (sel === 'custom') return $('model-custom').value.trim() || null;
  return sel || null;
}

async function updateModelSelect(provider, apiKey = '', savedModel = null) {
  const show = MODEL_SELECT_PROVIDERS.includes(provider);
  toggle('model-select-wrap', show);
  if (!show) return;

  const label = { openrouter: 'Модель OpenRouter', gemini: 'Модель Gemini', groq: 'Модель Groq', mistral: 'Модель Mistral', qwen: 'Модель Qwen', huggingface: 'Модель HuggingFace' };
  $('model-select-label').textContent = label[provider] || 'Модель';

  const sel = $('model-select');
  sel.innerHTML = '<option>' + t('loadingModels') + '</option>';

  // Показати/сховати повідомлення про помилку моделей
  let modelErr = $('model-error');
  if (!modelErr) {
    modelErr = document.createElement('div');
    modelErr.id = 'model-error';
    modelErr.style.cssText = 'color:var(--warn,#FF9800);font-size:12px;margin-top:4px;display:none';
    sel.parentNode.appendChild(modelErr);
  }
  modelErr.style.display = 'none';

  let models = [];
  try {
    const mod = await import(chrome.runtime.getURL('src/utils/models.js'));
    const result = await mod.getModels(provider, apiKey);
    models = result.models || result; // сумісність зі старою версією
    if (result.error) {
      modelErr.textContent = '\u26a0 ' + result.error;
      modelErr.style.display = 'block';
    }
  } catch (e) {
    modelErr.textContent = '\u26a0 Не вдалось завантажити моделі: ' + e.message;
    modelErr.style.display = 'block';
  }

  sel.innerHTML = models.map(m => `<option value="${m.id}"${m.context ? ` data-context="${m.context}"` : ''}>${m.label}</option>`).join('');
  sel.innerHTML += '<option value="custom">' + t('modelOther') + '</option>';
  toggle('model-custom', false);

  // Попередження про контекст
  let ctxWarn = $('model-context-warn');
  if (!ctxWarn) {
    ctxWarn = document.createElement('div');
    ctxWarn.id = 'model-context-warn';
    ctxWarn.style.cssText = 'font-size:12px;margin-top:4px';
    sel.parentNode.appendChild(ctxWarn);
  }
  updateContextWarning(provider, sel.value);

  const target = savedModel || state.openrouterModel;
  if (target) {
    const found = Array.from(sel.options).find(o => o.value === target);
    if (found) { sel.value = target; }
    else { sel.value = 'custom'; $('model-custom').value = target; toggle('model-custom', true); }
    updateContextWarning(provider, sel.value);
  }
}
