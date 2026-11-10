// utils/models.js — автооновлення списків моделей провайдерів
// Кеш зберігається в chrome.storage.local, TTL 24 години

const CACHE_KEY = 'mb_models_cache';
const TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_SCHEMA = 2; // 2: у моделях з'явилось поле maxOutput; записи старішої схеми оновлюються

// ── Метадані моделей (контекст, швидкість, вартість) ─────────────────────────
export const MODEL_META = {
  // Gemini
  'gemini-2.5-flash':         { context: 1000000, maxOutput: 65536, speed: 'fast',   cost: 'free' },
  'gemini-2.5-pro':           { context: 1000000, maxOutput: 65536, speed: 'medium', cost: 'paid' },
  'gemini-2.0-flash':         { context: 1000000, maxOutput: 8192, speed: 'fast',   cost: 'free' },
  'gemini-1.5-flash':         { context: 1000000, maxOutput: 8192, speed: 'fast',   cost: 'free' },
  'gemini-1.5-pro':           { context: 2000000, maxOutput: 8192, speed: 'medium', cost: 'paid' },
  // Groq
  'llama-3.3-70b-versatile':  { context: 128000,  speed: 'fast',   cost: 'free' },
  'llama-3.1-8b-instant':     { context: 128000,  speed: 'fast',   cost: 'free' },
  'gemma2-9b-it':             { context: 8192,    speed: 'fast',   cost: 'free' },
  'mixtral-8x7b-32768':       { context: 32768,   speed: 'fast',   cost: 'free' },
  'allam-2-7b':               { context: 4096,    speed: 'fast',   cost: 'free' },
  // Mistral
  'mistral-small-latest':     { context: 32000,   speed: 'fast',   cost: 'paid' },
  'mistral-large-latest':     { context: 128000,  speed: 'medium', cost: 'paid' },
  'open-mistral-7b':          { context: 32000,   speed: 'fast',   cost: 'free' },
  'open-mixtral-8x7b':        { context: 32000,   speed: 'medium', cost: 'free' },
  // OpenRouter free
  'meta-llama/llama-3.1-8b-instruct:free':   { context: 128000, speed: 'fast',   cost: 'free' },
  'meta-llama/llama-3.3-70b-instruct:free':  { context: 128000, speed: 'medium', cost: 'free' },
  'google/gemma-3-12b-it:free':              { context: 96000,  speed: 'fast',   cost: 'free' },
  'mistralai/mistral-7b-instruct:free':      { context: 32000,  speed: 'fast',   cost: 'free' },
  // Claude
  'claude-haiku-4-5-20251001': { context: 200000, maxOutput: 64000, speed: 'fast',   cost: 'paid' },
  'claude-sonnet-4-5':         { context: 200000, maxOutput: 64000, speed: 'medium', cost: 'paid' },
  // GPT
  'gpt-4o-mini':               { context: 128000, maxOutput: 16384, speed: 'fast',   cost: 'paid' },
  'gpt-4o':                    { context: 128000, maxOutput: 16384, speed: 'medium', cost: 'paid' },
  // DeepSeek
  'deepseek-chat':             { context: 64000, maxOutput: 8192,  speed: 'medium', cost: 'free' },
  // Qwen
  'qwen-plus':                 { context: 32000,  speed: 'fast',   cost: 'paid' },
  'qwen-turbo':                { context: 8000,   speed: 'fast',   cost: 'paid' },
  'qwen-max':                  { context: 32000,  speed: 'medium', cost: 'paid' },
  // HuggingFace
  'Qwen/Qwen2.5-72B-Instruct':              { context: 32000,  speed: 'slow',   cost: 'free' },
  'meta-llama/Llama-3.3-70B-Instruct':      { context: 128000, speed: 'slow',   cost: 'free' },
  'mistralai/Mistral-7B-Instruct-v0.3':     { context: 32000,  speed: 'slow',   cost: 'free' },
};

// Форматування підказки про модель
export function getModelHint(modelId) {
  const m = MODEL_META[modelId];
  if (!m) return null;
  const ctx = m.context >= 1000000 ? `${m.context/1000000}M` : `${(m.context/1000).toFixed(0)}K`;
  const speed = m.speed === 'fast' ? '⚡ швидка' : m.speed === 'medium' ? '◑ середня' : '🐢 повільна';
  const cost = m.cost === 'free' ? '✓ безкоштовна' : '$ платна';
  return `${ctx} контекст · ${speed} · ${cost}`;
}


// Провайдери з відомими безкоштовними/дефолтними моделями (fallback)
export const FALLBACK_MODELS = {
  openrouter: [
    { id: 'meta-llama/llama-3.1-8b-instruct:free',  label: 'Llama 3.1 8B (free)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free',  label: 'Llama 3.3 70B (free)' },
    { id: 'google/gemma-3-12b-it:free',              label: 'Gemma 3 12B (free)' },
    { id: 'mistralai/mistral-7b-instruct:free',      label: 'Mistral 7B (free)' },
    { id: 'openrouter/auto',                         label: 'Auto (платна)' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash',   label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B Versatile (free)' },
    { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B Instant (free)' },
    { id: 'gemma2-9b-it',             label: 'Gemma 2 9B (free)' },
    { id: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B (free)' },
  ],
  mistral: [
    { id: 'mistral-small-latest',  label: 'Mistral Small' },
    { id: 'mistral-large-latest',  label: 'Mistral Large' },
    { id: 'open-mistral-7b',       label: 'Open Mistral 7B (free)' },
    { id: 'open-mixtral-8x7b',     label: 'Open Mixtral 8x7B (free)' },
  ],
  qwen: [
    { id: 'qwen-plus',        label: 'Qwen Plus' },
    { id: 'qwen-turbo',       label: 'Qwen Turbo' },
    { id: 'qwen-max',         label: 'Qwen Max' },
  ],
  huggingface: [
    { id: 'Qwen/Qwen2.5-72B-Instruct',       label: 'Qwen 2.5 72B' },
    { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
    { id: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B' },
  ],
};

// ── Зрозумілі повідомлення про помилки ──────────────────────────────────────
function checkStatus(r, provider) {
  if (r.ok) return;
  const providerNames = {
    gemini: 'Google AI Studio',
    groq: 'Groq',
    mistral: 'Mistral',
    openrouter: 'OpenRouter',
  };
  const name = providerNames[provider] || provider;
  switch (r.status) {
    case 400: throw new Error(`Невірний запит до ${name}. Перевірте API-ключ.`);
    case 401: throw new Error(`API-ключ ${name} недійсний або відсутній — оновіть ключ у налаштуваннях.`);
    case 403: throw new Error(`Доступ заборонено (${name}). Ключ є, але немає дозволу — перевірте тарифний план.`);
    case 429: throw new Error(`Перевищено ліміт запитів ${name}. Спробуйте пізніше.`);
    case 404: throw new Error(`Модель або endpoint ${name} не знайдено.`);
    case 500:
    case 503: throw new Error(`Сервер ${name} тимчасово недоступний. Спробуйте пізніше.`);
    default:  throw new Error(`Помилка ${r.status} від ${name}.`);
  }
}

// ── Завантаження кешу ────────────────────────────────────────────────────────
async function loadCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(CACHE_KEY, r => resolve(r[CACHE_KEY] || {}));
  });
}

async function saveCache(cache) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [CACHE_KEY]: cache }, resolve);
  });
}

// ── Фетч моделей OpenRouter (без ключа) ────────────────────────────────────
async function fetchOpenRouterModels() {
  const r = await fetch('https://openrouter.ai/api/v1/models');
  checkStatus(r, 'openrouter');
  const data = await r.json();
  if (!data.data) throw new Error('no data');

  // Окремо free і платні, сортуємо
  const free = data.data
    .filter(m => m.id.endsWith(':free') || m.pricing?.prompt === '0')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => ({
      id: m.id,
      label: `${m.name || m.id} (free)`,
      context: m.context_length || null,
      maxOutput: m.top_provider?.max_completion_tokens || null,
      speed: null,
      cost: 'free',
    }));

  const paid = data.data
    .filter(m => !m.id.endsWith(':free') && m.pricing?.prompt !== '0')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => ({
      id: m.id,
      label: m.name || m.id,
      context: m.context_length || null,
      maxOutput: m.top_provider?.max_completion_tokens || null,
      speed: null,
      cost: 'paid',
    }));

  return [...free, ...paid, { id: 'openrouter/auto', label: 'Auto' }];
}

// ── Фетч моделей Gemini (потрібен ключ) ───────────────────────────────────
async function fetchGeminiModels(apiKey) {
  if (!apiKey) throw new Error('API-ключ Gemini не вказано — додайте ключ у налаштуваннях.');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  checkStatus(r, 'gemini');
  const data = await r.json();
  if (!data.models) throw new Error('no models');
  return data.models
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({
      id: m.name.replace('models/', ''),
      label: m.displayName || m.name.replace('models/', ''),
      context: m.inputTokenLimit || null,
      maxOutput: m.outputTokenLimit || null,
      speed: null,
      cost: null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ── Фетч моделей Groq (потрібен ключ) ────────────────────────────────────
async function fetchGroqModels(apiKey) {
  if (!apiKey) throw new Error('API-ключ Groq не вказано — додайте ключ у налаштуваннях.');
  const r = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  checkStatus(r, 'groq');
  const data = await r.json();
  if (!data.data) throw new Error('no data');
  return data.data
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => ({
      id: m.id,
      label: m.id,
      context: m.context_window || null,
      maxOutput: m.max_completion_tokens || null,
      speed: null,
      cost: 'free',
    }));
}

// ── Фетч моделей Mistral (потрібен ключ) ─────────────────────────────────
async function fetchMistralModels(apiKey) {
  if (!apiKey) throw new Error('API-ключ Mistral не вказано — додайте ключ у налаштуваннях.');
  const r = await fetch('https://api.mistral.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  checkStatus(r, 'mistral');
  const data = await r.json();
  if (!data.data) throw new Error('no data');
  return data.data
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => ({
      id: m.id,
      label: m.id,
      context: m.max_context_length || null,
      speed: null,
      cost: m.id.startsWith('open-') ? 'free' : 'paid',
    }));
}

// ── Головна функція: отримати моделі провайдера ───────────────────────────
// Повертає { models: [...], error: string|null }
export async function getModels(provider, apiKey = '') {
  const cache = await loadCache();
  const entry = cache[provider];
  const now = Date.now();

  // Повертаємо кеш якщо свіжий
  if (entry && entry.v === CACHE_SCHEMA && (now - entry.ts) < TTL_MS) {
    return { models: entry.models, error: null };
  }

  // Пробуємо оновити
  try {
    let models;
    switch (provider) {
      case 'openrouter':  models = await fetchOpenRouterModels(); break;
      case 'gemini':      models = await fetchGeminiModels(apiKey); break;
      case 'groq':        models = await fetchGroqModels(apiKey); break;
      case 'mistral':     models = await fetchMistralModels(apiKey); break;
      default:            models = FALLBACK_MODELS[provider] || [];
    }

    // Збагачуємо моделі метаданими з MODEL_META
    models = models.map(m => {
      const meta = MODEL_META[m.id];
      if (!meta) return m;
      return { ...m, context: m.context || meta.context, maxOutput: m.maxOutput || meta.maxOutput || null, metaCtx: !m.context && !!meta.context, metaOut: !m.maxOutput && !!meta.maxOutput, speed: m.speed || meta.speed, cost: m.cost || meta.cost };
    });

    cache[provider] = { ts: now, models, v: CACHE_SCHEMA };
    await saveCache(cache);
    console.log(`[Models] ${provider}: ${models.length} моделей оновлено`);
    return { models, error: null };

  } catch (e) {
    console.warn(`[Models] ${provider} fetch failed:`, e.message, '— використовуємо fallback');
    const fallback = (FALLBACK_MODELS[provider] || []).map(m => {
      const meta = MODEL_META[m.id];
      if (!meta) return m;
      return { ...m, context: meta.context, maxOutput: meta.maxOutput || null, metaCtx: !!meta.context, metaOut: !!meta.maxOutput, speed: meta.speed, cost: meta.cost };
    });
    return { models: fallback, error: e.message };
  }
}

// ── Примусове оновлення (ігнорує TTL) ────────────────────────────────────
export async function refreshModels(provider, apiKey = '') {
  const cache = await loadCache();
  delete cache[provider];
  await saveCache(cache);
  return getModels(provider, apiKey);
}

// ── Очистити весь кеш моделей ─────────────────────────────────────────────
export async function clearModelsCache() {
  await saveCache({});
}


// ── Ліміти тексту й відповіді ─────────────────────────────────────────────
// Усе виводиться з довідника моделей (MODEL_META або живі дані провайдера:
// context_length / inputTokenLimit / outputTokenLimit тощо) і з відсотків нижче.
// Окремо, явно, задаються ліміти безкоштовних тарифів на розмір запиту — це не
// властивість моделі, а обмеження провайдера (PROVIDER_REQUEST_CAPS).

export const RATIOS = {
  shortShare: 0.15,            // шорт ≈ 15% від поданого тексту (як вимагає промпт)
  memoryTagsShare: 0.10,       // MEMORY + TAGS ≈ +10% до довжини шорту
  outputHeadroom: 3.0,         // запас +300% до очікуваної відповіді (неточність оцінки + «міркування» моделі)
  outputCeilingOfContext: 0.25, // стеля відповіді = 25% контексту, якщо максимум відповіді моделі невідомий
  outputFloorOfCeiling: 0.25,  // нижня межа відповіді = 25% стелі (щоб малі сесії не впиралися в бюджет «міркувань»)
  outputFitHeadroom: 0.5,      // скільки тексту подавати: шорт (+10%) із запасом +50% має вміститися в стелю відповіді моделі
  charsPerToken: 2,            // перерахунок токени ↔ символи, консервативно для кирилиці
  refreshRetryShare: 0.05,     // повторна спроба оновити список моделей не частіше ніж раз на 5% від TTL кешу
  selfReportTrust: 0.5,        // значення, які модель повідомила про себе, використовуються на 50% (не перевірені)
  tpmShareOfRequest: 0.5,      // один запит не більше 50% хвилинного ліміту токенів провайдера (якщо ліміт відомий)
  pauseMargin: 0.1,            // запас 10% при розрахунку паузи між запитами за хвилинним лімітом
};

// Модель за замовчуванням для кожного провайдера (збігається з getApiConfig в ai.js)
export const DEFAULT_MODEL = {
  claude: 'claude-haiku-4-5-20251001',
  gpt: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.5-flash',
  openrouter: 'meta-llama/llama-3.1-8b-instruct:free',
  qwen: 'qwen-plus',
  huggingface: 'Qwen/Qwen2.5-72B-Instruct',
  mistral: 'mistral-small-latest',
  groq: 'llama-3.3-70b-versatile',
};

// Провайдери з фіксованою моделлю (вибраний у налаштуваннях openrouterModel ігнорується)
export const FIXED_MODEL_PROVIDERS = ['claude', 'gpt', 'deepseek'];

// Єдине запасне значення — коли контекст моделі зовсім невідомий (старе обережне)
export const UNKNOWN_MODEL_CHAR_LIMIT = 28000;
// Поріг для попередження в попапі: нижче — сесії можуть оброблятись не повністю
// (найбільші сесії архіву ≈ 120 000 символів)
export const LARGE_SESSION_CHARS = 130000;

// Ліміти безкоштовних тарифів на розмір запиту, символи (не розмір контексту моделі)
export const PROVIDER_REQUEST_CAPS = {
  groq: { default: 15000, 'llama-3.1-8b-instant': 12000 },
  mistral: { default: 20000 },
  huggingface: { default: 20000 },
};

// Провайдери, для яких є жива вибірка моделей з API (решта — лише MODEL_META)
const LIVE_PROVIDERS = ['openrouter', 'gemini', 'groq', 'mistral'];
const refreshAttempts = {};

// Під час обробки (service worker) попап може не відкриватись добами, тому довідник
// оновлюється тут: getModels віддає свіжий кеш або перезавантажує його з API.
// Невдалі спроби (немає мережі / ключа) не повторюються частіше за refreshRetryShare від TTL.
async function ensureFreshModels(provider, apiKey) {
  if (!LIVE_PROVIDERS.includes(provider)) return;
  const now = Date.now();
  if (refreshAttempts[provider] && now - refreshAttempts[provider] < TTL_MS * RATIOS.refreshRetryShare) return;
  refreshAttempts[provider] = now;
  try { await getModels(provider, apiKey || ''); } catch (e) { /* лишаємо наявний кеш / довідник */ }
}

// Хвилинний ліміт токенів, потрібний, щоб модель прочитала сесію такого розміру ПОВНІСТЮ:
// текст (символи → токени) + шорт (частка від тексту) мають вміститись у частку хвилинного ліміту.
export function tpmNeededFor(chars) {
  const inputTokens = chars / RATIOS.charsPerToken;
  const totalTokens = inputTokens * (1 + RATIOS.shortShare * (1 + RATIOS.memoryTagsShare));
  return Math.ceil(totalTokens / RATIOS.tpmShareOfRequest);
}

// Скільки символів тексту влізе в один запит при такому хвилинному ліміті
export function charsFitTpm(tpm) {
  return Math.floor(tpm * RATIOS.tpmShareOfRequest * RATIOS.charsPerToken);
}

// Стеля відповіді в токенах: максимум відповіді моделі, обмежений часткою контексту
function outputCeilingTokens(contextTokens, maxOutput) {
  const share = contextTokens ? Math.floor(contextTokens * RATIOS.outputCeilingOfContext) : null;
  if (maxOutput && share) return Math.min(maxOutput, share);
  return maxOutput || share || null;
}

// ── Виявлені ліміти (з помилок API / зі слів моделі) ───────────────────────
// Для моделей, яких немає в живому списку API, ліміти виявляються автоматично перед обробкою
// (ai.js: discoverLimits) і зберігаються тут з позначкою джерела.
const DISCOVERED_KEY = 'mb_model_discovered';
export const DISCOVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // повторне виявлення — раз на ~30 днів

async function loadDiscovered() {
  return new Promise(resolve => {
    chrome.storage.local.get(DISCOVERED_KEY, r => resolve(r[DISCOVERED_KEY] || {}));
  });
}

export async function getDiscovered(provider, model) {
  const all = await loadDiscovered();
  return all[`${provider}:${model}`] || null;
}

export async function saveDiscovered(provider, model, rec) {
  const all = await loadDiscovered();
  all[`${provider}:${model}`] = rec;
  await new Promise(resolve => chrome.storage.local.set({ [DISCOVERED_KEY]: all }, resolve));
}

// Хвилинний ліміт токенів, який провайдер повідомив у заголовках відповіді (напр. Mistral:
// x-ratelimit-limit-tokens-minute). Зберігається, щоб розмір запиту й паузи враховували його вже на першому запиті.
const LEARNED_RATE_KEY = 'mb_learned_rates';

export async function getLearnedRate(provider, model) {
  return new Promise(resolve => {
    chrome.storage.local.get(LEARNED_RATE_KEY, r => resolve((r[LEARNED_RATE_KEY] || {})[`${provider}:${model}`] || null));
  });
}

export async function saveLearnedRate(provider, model, rec) {
  const all = await new Promise(resolve => chrome.storage.local.get(LEARNED_RATE_KEY, r => resolve(r[LEARNED_RATE_KEY] || {})));
  all[`${provider}:${model}`] = rec;
  await new Promise(resolve => chrome.storage.local.set({ [LEARNED_RATE_KEY]: all }, resolve));
}

// Чи треба виявляти ліміти: жива вибірка API вже дала обидва значення — ні;
// свіжий запис виявлення (у т.ч. «нічого не знайшли») — ні.
export async function needsDiscovery(provider, model) {
  try {
    const cache = await loadCache();
    const live = cache[provider]?.models?.find(x => x.id === model);
    if (live && live.context && !live.metaCtx && live.maxOutput && !live.metaOut) return false;
  } catch (e) { /* кеш недоступний */ }
  const rec = await getDiscovered(provider, model);
  if (rec) {
    const ttl = rec.none ? TTL_MS : DISCOVERY_TTL_MS;
    if (Date.now() - rec.ts < ttl) return false;
  }
  return true;
}

// Дістає ліміти з тексту помилки API на завеликий запит. Формати різних провайдерів
// різні й змінюються, тож шукаємо толерантно; невпізнане просто повертає порожній об'єкт.
export function parseLimitsFromError(text) {
  const s = String(text || '');
  const out = {};
  const num = x => {
    const n = parseInt(String(x).replace(/[,_\s]/g, ''), 10);
    return Number.isFinite(n) && n >= 256 && n <= 10_000_000 ? n : null;
  };
  let m;
  // Gemini: "...supported range is from 1 (inclusive) to 65537 (exclusive)"
  if ((m = s.match(/range is from\s*\d+\s*\(inclusive\)\s*to\s*([\d,]+)\s*\(exclusive\)/i))) {
    const n = num(m[1]); if (n) out.maxOutput = n - 1;
  }
  // Anthropic: "max_tokens: 10000000 > 64000, which is the maximum allowed number of output tokens"
  if (!out.maxOutput && (m = s.match(/max_tokens:\s*\d+\s*>\s*([\d,]+),?\s*which is the maximum/i))) {
    const n = num(m[1]); if (n) out.maxOutput = n;
  }
  // OpenAI-подібні: "This model supports at most 16384 completion tokens"
  if (!out.maxOutput && (m = s.match(/supports at most\s*([\d,]+)\s*completion tokens/i))) {
    const n = num(m[1]); if (n) out.maxOutput = n;
  }
  // DeepSeek / Qwen: "valid range of max_tokens is [1, 8192]" / "Range of max_tokens should be [1, 8192]"
  if (!out.maxOutput && (m = s.match(/max_tokens[^\[\]]{0,60}\[\s*1\s*,\s*([\d,]+)\s*\]/i))) {
    const n = num(m[1]); if (n) out.maxOutput = n;
  }
  // Загальне: "max_tokens ... less than or equal to 32768"
  if (!out.maxOutput && (m = s.match(/max(?:_completion)?_tokens[^.]{0,80}?(?:less than or equal to|at most|no more than|<=)\s*`?([\d,]+)/i))) {
    const n = num(m[1]); if (n) out.maxOutput = n;
  }
  // Контекст: "maximum context length is 128000 tokens" / "exceeds the maximum number of tokens allowed (1048576)"
  if ((m = s.match(/(?:maximum context length|context (?:length|window|size))(?: is| of)?\s*(?:is\s*)?([\d,]{4,})\s*tokens?/i))) {
    const n = num(m[1]); if (n) out.context = n;
  }
  if (!out.context && (m = s.match(/exceeds the maximum number of tokens allowed\s*\(?([\d,]+)/i))) {
    const n = num(m[1]); if (n) out.context = n;
  }
  return out;
}

// Чи дав живий список API саме це значення (а не довідник) для моделі
export async function hasLiveField(provider, model, field) {
  try {
    const live = (await loadCache())[provider]?.models?.find(x => x.id === model);
    if (!live) return false;
    return field === 'context' ? !!(live.context && !live.metaCtx) : !!(live.maxOutput && !live.metaOut);
  } catch (e) { return false; }
}

// Чи є значення (context / maxOutput) для моделі в довіднику MODEL_META
export function metaHas(model, field) {
  return !!(model && MODEL_META[model]?.[field]);
}

function firstOf(list) {
  return list.length ? { value: list[0][0], source: list[0][1] } : { value: null, source: 'unknown' };
}

// Повертає { limit, source, contextTokens, maxOutput, ceilingTokens, tierCap, model, sources }
// source: 'context' (розмір контексту), 'output' (стеля відповіді моделі), 'tier' (ліміт тарифу провайдера), 'tpm' (хвилинний ліміт, повідомлений провайдером), 'unknown' (контекст невідомий)
// sources: звідки взято контекст і максимум відповіді — 'api-list' (живий список API), 'api-error'
//   (з тексту помилки API), 'довідник' (MODEL_META), 'self-report' (зі слів моделі, не перевірено), 'unknown'
// liveCtx — розмір контексту з живих даних провайдера, якщо вже відомий викликачу
// overheadChars — довжина системного промпту й few-shot (вимірюється в ai.js)
// apiKey — якщо передано (service worker), довідник моделей за потреби оновлюється з API провайдера
export async function getInputCharLimit(provider, modelId = null, liveCtx = null, overheadChars = 0, apiKey = null) {
  const model = FIXED_MODEL_PROVIDERS.includes(provider)
    ? DEFAULT_MODEL[provider]
    : (modelId || DEFAULT_MODEL[provider] || null);

  // кандидати в порядку довіри: живий список API → з помилки API → довідник → зі слів моделі
  const ctxC = [];
  const outC = [];
  if (liveCtx) ctxC.push([liveCtx, 'api-list']);
  if (model) {
    if (apiKey !== null) await ensureFreshModels(provider, apiKey);
    let live = null;
    try { live = (await loadCache())[provider]?.models?.find(x => x.id === model) || null; } catch (e) { /* кеш недоступний */ }
    let rec = null;
    try { rec = await getDiscovered(provider, model); } catch (e) { /* сховище недоступне */ }
    const f = rec?.fields || {};
    if (live?.context && !live.metaCtx) ctxC.push([live.context, 'api-list']);
    if (live?.maxOutput && !live.metaOut) outC.push([live.maxOutput, 'api-list']);
    if (f.context?.source === 'api-error') ctxC.push([f.context.value, 'api-error']);
    if (f.maxOutput?.source === 'api-error') outC.push([f.maxOutput.value, 'api-error']);
    if (MODEL_META[model]?.context) ctxC.push([MODEL_META[model].context, 'довідник']);
    if (MODEL_META[model]?.maxOutput) outC.push([MODEL_META[model].maxOutput, 'довідник']);
    if (f.context?.source === 'self-report') ctxC.push([Math.floor(f.context.value * RATIOS.selfReportTrust), 'self-report']);
    // Самозвіт моделі про макс. відповідь НЕ використовується: він лише штучно обмежував би текст (ministral-14b заявила 4096 і втратила 87% сесії)
  }
  const ctx = firstOf(ctxC);
  const out = firstOf(outC);
  const contextTokens = ctx.value;
  const maxOutput = out.value;

  const ceilingTokens = outputCeilingTokens(contextTokens, maxOutput);

  let limit = UNKNOWN_MODEL_CHAR_LIMIT;
  let source = 'unknown';
  if (contextTokens) {
    // контекст мінус місце під відповідь і промпт
    const availTokens = contextTokens - (ceilingTokens || 0) - Math.ceil(overheadChars / RATIOS.charsPerToken);
    limit = Math.max(0, Math.floor(availTokens * RATIOS.charsPerToken));
    source = 'context';
  }

  // Не подавати більше тексту, ніж модель здатна підсумувати в межах своєї стелі відповіді
  if (ceilingTokens) {
    const perChar = RATIOS.shortShare * (1 + RATIOS.memoryTagsShare) * (1 + RATIOS.outputFitHeadroom);
    const fitLimit = Math.floor(ceilingTokens * RATIOS.charsPerToken / perChar);
    if (fitLimit < limit) { limit = fitLimit; source = 'output'; }
  }

  // Хвилинний ліміт токенів, повідомлений самим провайдером (з заголовків попередніх відповідей):
  // один запит (текст + відповідь) не має перевищувати частку цього ліміту
  let learnedTpm = null;
  if (model) {
    try { learnedTpm = (await getLearnedRate(provider, model))?.tpm || null; } catch (e) { /* сховище недоступне */ }
  }

  // Статична межа тарифу (наше припущення) діє лише поки провайдер не повідомив реальний ліміт
  const caps = PROVIDER_REQUEST_CAPS[provider];
  const tierCap = caps ? ((model && caps[model]) || caps.default) : null;
  if (tierCap && !learnedTpm && tierCap < limit) { limit = tierCap; source = 'tier'; }

  if (learnedTpm) {
    const tpmCap = Math.floor(learnedTpm * RATIOS.tpmShareOfRequest * RATIOS.charsPerToken);
    if (tpmCap < limit) { limit = tpmCap; source = 'tpm'; }
  }

  return { limit, source, contextTokens, maxOutput, ceilingTokens, tierCap, learnedTpm, model,
           sources: { context: ctx.source, maxOutput: out.source } };
}

// Бюджет відповіді (max_tokens) для запиту: очікувана довжина шорту у відсотках
// від поданого тексту + запас, у межах [нижня межа; стеля] моделі.
export function outputTokensFor(inputChars, info) {
  const expectedChars = inputChars * RATIOS.shortShare * (1 + RATIOS.memoryTagsShare);
  const derived = Math.ceil(expectedChars / RATIOS.charsPerToken * (1 + RATIOS.outputHeadroom));
  const ceiling = info?.ceilingTokens || null;
  if (!ceiling) return derived;
  const floor = Math.ceil(ceiling * RATIOS.outputFloorOfCeiling);
  return Math.min(ceiling, Math.max(floor, derived));
}
