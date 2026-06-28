// utils/models.js — автооновлення списків моделей провайдерів
// Кеш зберігається в chrome.storage.local, TTL 24 години

const CACHE_KEY = 'mb_models_cache';
const TTL_MS = 24 * 60 * 60 * 1000;

// ── Метадані моделей (контекст, швидкість, вартість) ─────────────────────────
export const MODEL_META = {
  // Gemini
  'gemini-2.5-flash':         { context: 1000000, speed: 'fast',   cost: 'free' },
  'gemini-2.5-pro':           { context: 1000000, speed: 'medium', cost: 'paid' },
  'gemini-2.0-flash':         { context: 1000000, speed: 'fast',   cost: 'free' },
  'gemini-1.5-flash':         { context: 1000000, speed: 'fast',   cost: 'free' },
  'gemini-1.5-pro':           { context: 2000000, speed: 'medium', cost: 'paid' },
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
  'claude-haiku-4-5-20251001': { context: 200000, speed: 'fast',   cost: 'paid' },
  'claude-sonnet-4-5':         { context: 200000, speed: 'medium', cost: 'paid' },
  // GPT
  'gpt-4o-mini':               { context: 128000, speed: 'fast',   cost: 'paid' },
  'gpt-4o':                    { context: 128000, speed: 'medium', cost: 'paid' },
  // DeepSeek
  'deepseek-chat':             { context: 64000,  speed: 'medium', cost: 'free' },
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
  if (entry && (now - entry.ts) < TTL_MS) {
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
      return { ...m, context: m.context || meta.context, speed: m.speed || meta.speed, cost: m.cost || meta.cost };
    });

    cache[provider] = { ts: now, models };
    await saveCache(cache);
    console.log(`[Models] ${provider}: ${models.length} моделей оновлено`);
    return { models, error: null };

  } catch (e) {
    console.warn(`[Models] ${provider} fetch failed:`, e.message, '— використовуємо fallback');
    const fallback = (FALLBACK_MODELS[provider] || []).map(m => {
      const meta = MODEL_META[m.id];
      if (!meta) return m;
      return { ...m, context: meta.context, speed: meta.speed, cost: meta.cost };
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
