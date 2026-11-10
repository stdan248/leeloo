// utils/ai.js — генерація шорту через API моделі

import { getInputCharLimit, outputTokensFor, RATIOS, needsDiscovery, saveDiscovered, parseLimitsFromError, metaHas, hasLiveField, saveLearnedRate, getLearnedRate } from './models.js';

const SYSTEM_PROMPT = `Ти архіваріус розмов між людиною і ШІ-моделлю.
Отримуєш повний текст сесії і створюєш стислий огляд + теги.
Використовуй імена учасників такими як вони є в тексті — не вигадуй і не підставляй інші.

Формат (суворо):
=SHORT=
Сесія {номер} — «{назва: суть сесії в 5-7 словах}»

{наратив пропорційний фулу: що робили, що вирішили, ключові моменти. Без води. Для великих сесій — кілька абзаців.}

=MEMORY=
{одне речення-суть, макс 150 символів}

=TAGS=
{тег1, тег2, тег3, тег4, тег5}

Правила для SHORT:
- Назва в «лапках» — влучна, не сухо-технічна
- Текст — наратив, не список, ПРОПОРЦІЙНИЙ оригіналу (~15% від обсягу фулу)
- Якщо фул великий (10000+ символів) — SHORT має бути кілька абзаців
- Мова: українська

Правила для MEMORY (важливо):
- Одне речення (макс 150 символів) — суть сесії для швидкого пошуку
- Не переказ назви, а глибша суть: що відбулося, що змінилося, що вирішено
- Мова: українська

Правила для TAGS (важливо):
- 4-7 тегів через кому з підкресленням
- Відображають ТЕМИ сесії, не технічні деталі і не назви файлів
- Використовуй базові концепти і похідні: свідомість, інтуїція, пам'ять, русло, архів, еволюція, ШІ_природа, стосунки_людина_ШІ, філософія, технічна_робота
- НЕ: назви файлів, ID, службові слова, англійська мова

Приклад:
=SHORT=
Сесія 12 — «Налаштування інтеграції та обговорення архітектури.»

Основна робота — підключення зовнішнього сервісу до проєкту. Виникла проблема з авторизацією: токен не приймається через невірний формат — виправлено вручну. Обговорено структуру бази даних і спосіб зберігання даних. Прийнято рішення використовувати окремі таблиці для різних типів записів.

=MEMORY=
Технічне налаштування інтеграції, виправлення авторизації, рішення щодо структури БД.

=TAGS=
технічна_робота, інтеграція, архітектура, база_даних, рішення`;

export async function buildMemorySentence(shortText, platform, apiKey, openrouterModel = null) {
  if (!shortText) return '';
  const apiConfig = getApiConfig(platform, apiKey, openrouterModel);
  const prompt = `Прочитай цей стислий огляд сесії і напиши ОДНЕ речення (максимум 150 символів) — суть того що відбулося. Тільки речення, без пояснень.\n\n${shortText.slice(0, 3000)}`;
  const body = { ...apiConfig.body };
  if (platform === 'gemini') {
    body.contents = [{ parts: [{ text: prompt }] }];
  } else {
    body.messages = [{ role: 'user', content: prompt }];
  }
  const bodyOverride = platform === 'gemini'
    ? { ...body, generationConfig: { ...(body.generationConfig || {}), maxOutputTokens: 300 } }
    : { ...body, max_tokens: 300 };

  const response = await fetch(apiConfig.url, {
    method: 'POST',
    headers: apiConfig.headers,
    body: JSON.stringify(bodyOverride),
  });
  checkAiStatus(response.status, platform);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'API error');
  return extractText(data, platform).trim();
}

function buildFewShot() {
  return `ПРИКЛАД ПРАВИЛЬНОГО ФОРМАТУ:
=SHORT=
Сесія 12 — «Налаштування інтеграції та обговорення архітектури.»

Основна робота — підключення зовнішнього сервісу до проєкту. Виникла проблема з авторизацією: токен не приймається через невірний формат — виправлено вручну. Обговорено структуру бази даних і спосіб зберігання даних. Прийнято рішення використовувати окремі таблиці для різних типів записів.

=MEMORY=
Технічне налаштування інтеграції, виправлення авторизації, рішення щодо структури БД.

=TAGS=
технічна_робота, інтеграція, архітектура, база_даних, рішення

ВИМОГИ:
- =SHORT=, =MEMORY= і =TAGS= — обов'язкові маркери
- SHORT: повний огляд ~${Math.round(RATIOS.shortShare * 100)}% від обсягу фулу (кілька абзаців для великих сесій)
- MEMORY: одне речення макс 150 символів — суть глибша ніж назва
- TAGS: 4-7 тегів через кому, тільки українська, апострофи дозволені
- НІЧОГО БІЛЬШЕ

---
ТЕКСТ СЕСІЇ ДЛЯ ОБРОБКИ:\n\n`;
}

// Довжина системного промпту + few-shot (символи) — для розрахунку, скільки лишається під текст сесії
export function getPromptOverheadChars() {
  return SYSTEM_PROMPT.length + buildFewShot().length;
}

// ── Виявлення лімітів моделі та облік витрачених токенів ──────────────────────
// Один свідомо завеликий запит із мінімальним текстом: API відхиляє його на перевірці
// параметрів (нічого не генерується), а в тексті помилки зазвичай названо реальні ліміти.
const PROBE_MAX_TOKENS = 10_000_000;

async function postMinimal(platform, apiKey, openrouterModel, prompt, maxTokens) {
  const apiConfig = getApiConfig(platform, apiKey, openrouterModel);
  const body = { ...apiConfig.body };
  if (platform === 'gemini') {
    body.contents = [{ parts: [{ text: prompt }] }];
    body.generationConfig = { ...(body.generationConfig || {}), maxOutputTokens: maxTokens };
  } else {
    body.messages = [{ role: 'user', content: prompt }];
    body.max_tokens = maxTokens;
  }
  const res = await fetch(apiConfig.url, { method: 'POST', headers: apiConfig.headers, body: JSON.stringify(body) });
  return { status: res.status, ok: res.ok !== false && res.status < 400, text: await res.text() };
}

const LIMIT_LABEL = {
  context: 'за контекстом',
  output: 'за стелею відповіді',
  tier: 'ліміт тарифу',
  tpm: 'хвилинний ліміт провайдера',
  unknown: 'контекст невідомий',
};

const SOURCE_LABEL = {
  'api-error': 'з помилки API',
  'self-report': 'зі слів моделі, не перевірено',
  'api-list': 'API-список',
  'довідник': 'довідник',
  'unknown': 'невідомо',
};

// Перед обробкою: якщо ліміти поточної моделі не відомі з живого списку API, виявляємо їх
// самі (помилка API → слова моделі) і зберігаємо з позначкою джерела. Не частіше ніж раз на
// ~30 днів на модель; нічого не ламає: будь-яка невдача лишає довідник / запасне значення.
async function discoverLimits(platform, model, apiKey, openrouterModel) {
  if (!model || !apiKey) return;
  if (!(await needsDiscovery(platform, model))) return;

  const fields = {};
  try {
    const r = await postMinimal(platform, apiKey, openrouterModel, 'ok', PROBE_MAX_TOKENS);
    if (r.status === 429 || r.status >= 500) {
      console.log(`[AI] ⓘ Виявлення лімітів ${model}: провайдер тимчасово недоступний (${r.status}), спробую пізніше`);
      return;
    }
    const found = parseLimitsFromError(r.text);
    if (!found.context && !found.maxOutput) {
      // Для діагностики: що саме відповів API, щоб додати розпізнавання його формату
      console.log(`[AI] ⓘ ${model}: проба лімітів нічого не розпізнала, відповідь API (${r.status}): ${String(r.text).replace(/\s+/g, ' ').slice(0, 220)}`);
    }
    if (found.context) fields.context = { value: found.context, source: 'api-error' };
    if (found.maxOutput) fields.maxOutput = { value: found.maxOutput, source: 'api-error' };
  } catch (e) {
    console.log(`[AI] ⓘ Виявлення лімітів ${model}: запит не вдався (${e.message})`);
    return;
  }

  // Самозвіт моделі — лише для РОЗМІРУ КОНТЕКСТУ і лише коли його немає ні з API-списку, ні з довідника.
  // Макс. відповідь зі слів моделі не беремо: модель помиляється про себе, а таке значення лише обмежує текст.
  const needSelf = !fields.context && !metaHas(model, 'context') && !(await hasLiveField(platform, model, 'context'));
  if (needSelf) {
    try {
      const prompt = 'Відповідай ЛИШЕ JSON без пояснень: {"context_tokens": число} — максимальний розмір контексту (у токенах) для моделі, якою ти зараз є. Якщо не знаєш — null.';
      const r = await postMinimal(platform, apiKey, openrouterModel, prompt, 1000);
      if (r.ok) {
        const txt = extractText(JSON.parse(r.text), platform);
        const mm = txt.match(/\{[\s\S]*\}/);
        if (mm) {
          const j = JSON.parse(mm[0]);
          const good = n => Number.isFinite(n) && n >= 256 && n <= 10_000_000;
          if (good(j.context_tokens)) fields.context = { value: Math.round(j.context_tokens), source: 'self-report' };
        }
      }
    } catch (e) { /* самозвіт не вдався — це нормально */ }
  }

  if (Object.keys(fields).length) {
    await saveDiscovered(platform, model, { ts: Date.now(), fields });
    if (fields.context) console.log(`[AI] ⓘ ${model}: контекст = ${fields.context.value} токенів [${SOURCE_LABEL[fields.context.source]}]`);
    if (fields.maxOutput) console.log(`[AI] ⓘ ${model}: макс. відповідь = ${fields.maxOutput.value} токенів [${SOURCE_LABEL[fields.maxOutput.source]}]`);
  } else {
    await saveDiscovered(platform, model, { ts: Date.now(), none: true });
    console.log(`[AI] ⓘ ${model}: ліміти виявити не вдалось — використовую довідник або запасне значення`);
  }
}

// Облік витрачених токенів за прогін (скидається на старті обробки: resetUsageTotals)
const usageTotals = { requests: 0, input: 0, output: 0, thinking: 0 };
export function resetUsageTotals() {
  usageTotals.requests = usageTotals.input = usageTotals.output = usageTotals.thinking = 0;
}

function extractUsage(data, platform) {
  if (platform === 'gemini') {
    const u = data.usageMetadata || {};
    const think = u.thoughtsTokenCount || 0;
    return { input: u.promptTokenCount || 0, output: (u.candidatesTokenCount || 0) + think, thinking: think };
  }
  if (platform === 'claude') {
    const u = data.usage || {};
    return { input: u.input_tokens || 0, output: u.output_tokens || 0, thinking: 0 };
  }
  const u = data.usage || {};
  return { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, thinking: u.completion_tokens_details?.reasoning_tokens || 0 };
}

// Ліміти й залишок квоти — лише те, що провайдер сам повідомив у заголовках відповіді.
// Назви заголовків у провайдерів різні (x-ratelimit-limit-tokens-minute у Mistral,
// x-ratelimit-limit-tokens у OpenAI-подібних і Groq, anthropic-ratelimit-tokens-limit у Claude),
// тому розпізнаємо за змістом назви, а не за точним збігом.
export function parseRateLimitHeaders(headers) {
  const out = {};
  if (!headers || typeof headers.forEach !== 'function') return out;
  headers.forEach((value, name) => {
    const n = String(name).toLowerCase();
    if (!n.includes('ratelimit')) return;
    const v = parseInt(value, 10);
    if (!Number.isFinite(v)) return;
    if (/reset|cost/.test(n)) return;
    const month = /month|day|hour|week/.test(n);
    const fiveMin = /5-minute|5min/.test(n);
    const isTokens = n.includes('token');
    const isReq = /req/.test(n) && !isTokens;
    const isRemaining = n.includes('remaining');
    const isLimit = n.includes('limit') && !isRemaining;
    if (isTokens && !fiveMin) {
      if (month) { if (isLimit) out.tokensMonth = v; else if (isRemaining) out.remainingMonth = v; }
      else { if (isLimit) out.tpm = v; else if (isRemaining) out.remainingTpm = v; }
    } else if (isReq && !month && !fiveMin) {
      if (isLimit) out.rpm = v; else if (isRemaining) out.remainingReq = v;
    }
  });
  const ra = parseInt(headers.get?.('retry-after'), 10);
  if (Number.isFinite(ra)) out.retryAfter = ra;
  return out;
}

// Останні запити в межах хвилини (для розрахунку паузи за хвилинним лімітом токенів)
const rateState = { events: [], tpm: null, rpm: null, remainingTpm: null, lastTs: 0, platform: null, model: null };

function learnRate(platform, model, q, spent) {
  const now = Date.now();
  // інша платформа чи модель — ліміти попередньої не переносимо
  if (rateState.platform !== platform || rateState.model !== model) {
    rateState.events = []; rateState.tpm = null; rateState.rpm = null; rateState.remainingTpm = null; rateState.lastTs = 0;
  }
  rateState.platform = platform; rateState.model = model;
  rateState.events = rateState.events.filter(e => now - e.ts < 60000);
  if (spent) rateState.events.push({ ts: now, tokens: spent });
  rateState.lastTs = now;
  if (q.tpm) rateState.tpm = q.tpm;
  if (q.rpm) rateState.rpm = q.rpm;
  rateState.remainingTpm = q.remainingTpm ?? null;
  if ((q.tpm || q.rpm) && model) saveLearnedRate(platform, model, { tpm: q.tpm || null, rpm: q.rpm || null, ts: now }).catch(() => {});
}

// Скільки секунд почекати перед наступним запитом, щоб не перевищити ліміти провайдера:
// (1) хвилинний ліміт токенів (ковзне вікно 60 с; очікувана вартість наступного запиту = вартість
// останнього) і (2) хвилинний ліміт запитів (мінімальний інтервал 60 / запитів_на_хвилину).
// Повертає null, якщо жодного ліміту не відомо.
export function getAdaptivePause(platform) {
  if (rateState.platform !== platform || (!rateState.tpm && !rateState.rpm) || !rateState.lastTs) return null;
  const now = Date.now();
  let wait = 0;

  // ліміт запитів
  if (rateState.rpm) {
    const interval = 60 / (rateState.rpm * (1 - RATIOS.pauseMargin));
    wait = Math.max(wait, interval - (now - rateState.lastTs) / 1000);
  }

  // ліміт токенів
  let expected = null;
  if (rateState.tpm && rateState.events.length) {
    const cap = rateState.tpm * (1 - RATIOS.pauseMargin);
    expected = rateState.events[rateState.events.length - 1].tokens;
    let evs = rateState.events.filter(e => now - e.ts < 60000);
    let used = evs.reduce((s, e) => s + e.tokens, 0);
    while (evs.length && used + expected > cap) {
      const oldest = evs.shift();
      used -= oldest.tokens;
      wait = Math.max(wait, (oldest.ts + 60000 - now) / 1000);
    }
    if (expected > cap) wait = Math.max(wait, 60); // один запит більший за ліміт: найбільше, що можна зробити
  }
  return { seconds: Math.max(0, Math.ceil(wait)), tpm: rateState.tpm, rpm: rateState.rpm, expected };
}

function logUsage(data, platform, headers, model = null) {
  const u = extractUsage(data, platform);
  usageTotals.requests++; usageTotals.input += u.input; usageTotals.output += u.output; usageTotals.thinking += u.thinking;
  const q = parseRateLimitHeaders(headers);
  learnRate(platform, model, q, u.input + u.output);
  const parts = [];
  if (q.remainingTpm != null || q.tpm != null) parts.push(`токенів за хвилину: ${q.remainingTpm ?? '?'} з ${q.tpm ?? '?'}`);
  if (q.remainingMonth != null || q.tokensMonth != null) parts.push(`за місяць: ${q.remainingMonth ?? '?'} з ${q.tokensMonth ?? '?'}`);
  if (q.remainingReq != null || q.rpm != null) parts.push(`запитів: ${q.remainingReq ?? '?'} з ${q.rpm ?? '?'}`);
  const quota = parts.length ? `квота [від провайдера]: ${parts.join(', ')}` : 'залишок квоти: провайдер не повідомляє';
  if (!u.input && !u.output) {
    console.log(`[AI] ⓘ витрачено: провайдер не повідомив кількість токенів | за прогін: ${usageTotals.requests} запитів, вхід ${usageTotals.input} + відповідь ${usageTotals.output} = ${usageTotals.input + usageTotals.output} | ${quota}`);
    return;
  }
  console.log(`[AI] ⓘ витрачено: вхід ${u.input} + відповідь ${u.output}${u.thinking ? ` (з них міркування ${u.thinking})` : ''} = ${u.input + u.output} токенів | за прогін: ${usageTotals.requests} запитів, вхід ${usageTotals.input} + відповідь ${usageTotals.output} = ${usageTotals.input + usageTotals.output} | ${quota}`);
}

export async function buildShort(fullText, platform, apiKey, sessionNum = null, openrouterModel = null, sessionDate = null) {
  if (!fullText) return '[контент недоступний]';
  const apiConfig = getApiConfig(platform, apiKey, openrouterModel);
  // Ефективна модель: у Gemini вона в URL, в інших — у body.model
  const effectiveModel = apiConfig.body.model || (platform === 'gemini' ? (openrouterModel || 'gemini-2.5-flash') : null);
  // Ліміт тексту — з довідника моделей (+ ліміт тарифу провайдера), а не зашите число
  try { await discoverLimits(platform, effectiveModel, apiKey, openrouterModel); } catch (e) { console.warn('[AI] виявлення лімітів:', e.message); }
  const limitInfo = await getInputCharLimit(platform, effectiveModel, null, getPromptOverheadChars(), apiKey);
  const { limit: contextLimit, source: limitSource, contextTokens } = limitInfo;

  const body = { ...apiConfig.body };
  // Бюджет відповіді — у відсотках від поданого тексту, у межах можливостей моделі
  const providedChars = Math.min(fullText.length, contextLimit);
  const maxOut = outputTokensFor(providedChars, limitInfo);
  if (platform === 'gemini') body.generationConfig = { ...(body.generationConfig || {}), maxOutputTokens: maxOut };
  else body.max_tokens = maxOut;
  const dateHint = sessionDate ? `Дата сесії: ${sessionDate.slice(0, 10)}.\n` : '';
  const numHint = sessionNum ? `Номер цієї сесії: ${sessionNum}.\n${dateHint}\n` : (dateHint ? `${dateHint}\n` : '');
  const totalLen = fullText.length;
  const sizeHint = totalLen > contextLimit ? `Увага: повний обсяг фулу — ${totalLen} символів (подано перші ${contextLimit}). SHORT має бути ~${Math.round(contextLimit * RATIOS.shortShare)} символів.\n` : '';

  const fewShot = buildFewShot();

  if (platform === 'gemini') {
    body.contents = [{ parts: [{ text: `${numHint}${sizeHint}${fewShot}${fullText.slice(0, contextLimit)}` }] }];
  } else {
    body.messages = [
      { role: 'user', content: `${numHint}${sizeHint}${fewShot}${fullText.slice(0, contextLimit)}` }
    ];
  }

  const srcs = limitInfo.sources;
  console.log(`[AI] → ${platform} запит (${fullText.length} символів, ліміт ${contextLimit} [${LIMIT_LABEL[limitSource] || limitSource}], контекст ${contextTokens || '—'} токенів [${SOURCE_LABEL[srcs.context]}], макс. відповідь ${limitInfo.maxOutput || '—'} [${SOURCE_LABEL[srcs.maxOutput]}], бюджет відповіді ${maxOut} токенів)`);

  const response = await fetch(apiConfig.url, {
    method: 'POST',
    headers: apiConfig.headers,
    body: JSON.stringify(body),
  });

  console.log(`[AI] ← статус: ${response.status}`);

  checkAiStatus(response.status, platform);

  const data = await response.json();

  // Gemini іноді повертає 200 але з помилкою в тілі
  if (data.error) {
    console.warn(`[AI] ✗ Помилка в тілі:`, data.error);
    if (data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED') {
      const err = new Error('Rate limit');
      err.code = 'RATE_LIMIT';
      throw err;
    }
    throw new Error(data.error.message || 'API error');
  }

  const { text: result, incomplete } = extractResult(data, platform);
  logUsage(data, platform, response.headers, effectiveModel);
  console.log(`[AI] ✓ Результат: ${result.slice(0, 80)}...`);
  const parsed = parseShortAndTags(result);

  // Перевірка цілісності: відповідь неповна, якщо модель обірвала генерацію
  // (finishReason / stop_reason / finish_reason) або бракує будь-якого з трьох
  // маркерів чи порожні тіло шорту / тегів. Помилка без code потрапляє в
  // загальну гілку processNext(): до 3 спроб для цієї сесії, далі пропуск.
  const problems = [];
  if (incomplete) problems.push(`обрив: ${incomplete}`);
  if (!parsed.has.short)  problems.push('немає =SHORT=');
  if (!parsed.has.memory) problems.push('немає =MEMORY=');
  if (!parsed.has.tags)   problems.push('немає =TAGS=');
  if (parsed.has.tags && !parsed.tagsRaw) problems.push('порожні теги');
  if (problems.length) {
    console.warn(`[AI] ✗ Неповна відповідь моделі (${problems.join('; ')}), довжина ${result.length}`);
    throw new Error(`Неповна відповідь моделі (${problems.join('; ')})`);
  }
  if (!parsed.tags.length) {
    // теги є, але фільтр відсіяв усі (занадто короткі)
    console.warn(`[AI] ⚠ Усі теги відсіяно фільтром. Сирі теги: ${parsed.tagsRaw}`);
  }
  return { short: parsed.short, memory: parsed.memory, tags: parsed.tags };
}

// ── Парсинг відповіді на { short, tags } ─────────────────────────────────────
// Маркери =SHORT=/=MEMORY=/=TAGS= розпізнаються ЛИШЕ на початку рядка, тож
// згадка маркера посеред речення чи в зворотних лапках (коли сесія сама про
// ці маркери) текст не ріже. Якщо раптом рядок із маркером трапляється в
// тексті шорту: TAGS беремо останній, MEMORY — останній перед TAGS, SHORT —
// перший перед MEMORY.
function findMarkers(raw) {
  const re = /^[ \t]*=(SHORT|MEMORY|TAGS)=[ \t]*/gm;
  const out = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    out.push({ name: m[1], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function splitSections(raw) {
  raw = raw || '';
  const marks = findMarkers(raw);
  const last  = (name, before = Infinity) =>
    [...marks].reverse().find(x => x.name === name && x.start < before);
  const first = (name, before = Infinity) =>
    marks.find(x => x.name === name && x.start < before);

  const tagsM  = last('TAGS');
  const memM   = last('MEMORY', tagsM ? tagsM.start : Infinity);
  const shortM = first('SHORT', memM ? memM.start : (tagsM ? tagsM.start : Infinity));

  const cut = (m, ...nexts) => {
    if (!m) return '';
    const stops = nexts.filter(Boolean).map(x => x.start).filter(p => p >= m.end);
    const endPos = stops.length ? Math.min(...stops) : raw.length;
    return raw.slice(m.end, endPos).trim();
  };

  return {
    short:   shortM ? cut(shortM, memM, tagsM) : '',
    memory:  memM   ? cut(memM, tagsM) : '',
    tagsRaw: tagsM  ? cut(tagsM) : '',
    has: { short: !!shortM, memory: !!memM, tags: !!tagsM },
  };
}

function parseShortAndTags(raw) {
  const sec = splitSections(raw);
  const tags = sec.tagsRaw
    .split(',')
    .map(t => t.trim().replace(/['’ʼ]/g, "'"))
    .filter(t => t.length > 2);

  return {
    short: sec.has.short ? sec.short : (raw || '').trim(),
    memory: sec.memory,
    tags,
    tagsRaw: sec.tagsRaw,
    has: sec.has,
  };
}

// Для service-worker.js (шлях _memoryOnly): дістає рядок MEMORY із
// збереженого тексту шорту за тими самими правилами.
export function extractMemoryFromShort(text) {
  return splitSections(text).memory;
}

function getApiConfig(platform, apiKey = '', openrouterModel = null) {
  const configs = {
    claude: {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: {
        model: 'claude-haiku-4-5-20251001',
        system: SYSTEM_PROMPT,
      },
    },
    gemini: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${openrouterModel || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {},
      },
    },
    gpt: {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
    deepseek: {
      url: 'https://api.deepseek.com/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
    openrouter: {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'chrome-extension://memory-builder',
        'X-Title': 'Memory Builder',
      },
      body: {
        model: openrouterModel || 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
    qwen: {
      url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        model: openrouterModel || 'qwen-plus',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
    huggingface: {
      url: 'https://router.huggingface.co/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        model: openrouterModel || 'Qwen/Qwen2.5-72B-Instruct',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
    mistral: {
      url: 'https://api.mistral.ai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        model: openrouterModel || 'mistral-small-latest',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
    groq: {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        model: openrouterModel || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      },
    },
  };

  return configs[platform] || configs.gemini;
}

// ── Зрозумілі повідомлення про HTTP-помилки AI ───────────────────────────────
export function checkAiStatus(status, platform) {
  if (status >= 200 && status < 300) return;
  const names = {
    claude: 'Anthropic', gemini: 'Google AI', gpt: 'OpenAI',
    deepseek: 'DeepSeek', openrouter: 'OpenRouter', qwen: 'Qwen',
    huggingface: 'HuggingFace', mistral: 'Mistral', groq: 'Groq',
  };
  const name = names[platform] || platform;
  switch (status) {
    // 401/403/404 — проблема з самим ключем/моделлю, однакова для кожної
    // сесії в цьому прогоні. Позначаємо AUTH_ERROR, щоб processNext() у
    // service-worker.js зупиняв весь прогін одразу (як STORAGE_ERROR/
    // RATE_LIMIT), а не "пропускав" сесії одну за одною 3 спроби кожну —
    // так робив раніше, поки не було коду для розрізнення.
    case 400: throw new Error(`Невірний запит до ${name}. Перевірте API-ключ або модель.`);
    case 401: { const e = new Error(`API-ключ ${name} недійсний або відсутній — оновіть ключ у налаштуваннях.`); e.code = 'AUTH_ERROR'; throw e; }
    case 403: { const e = new Error(`Доступ заборонено (${name}). Перевірте тарифний план або дозволи ключа.`); e.code = 'AUTH_ERROR'; throw e; }
    case 413: throw new Error(`Текст сесії занадто великий для ${name} — спробуйте скоротити або змінити модель.`);
    case 429: { const e = new Error(`Перевищено ліміт запитів ${name}. Спробуйте пізніше.`); e.code = 'RATE_LIMIT'; throw e; }
    case 404: { const e = new Error(`Модель або endpoint ${name} не знайдено — перевірте назву моделі.`); e.code = 'AUTH_ERROR'; throw e; }
    case 500:
    case 503: { const e = new Error(`Сервер ${name} тимчасово недоступний. Спробуйте пізніше.`); e.code = 'RATE_LIMIT'; throw e; }
    default:  throw new Error(`Помилка ${status} від ${name}.`);
  }
}

// Текст відповіді OpenAI-подібних API. Зазвичай message.content — рядок, але моделі з міркуванням
// (напр. mistral-large-4) повертають масив блоків: [{type:'thinking', ...}, {type:'text', text:'…'}].
// Беремо лише текстові блоки; блоки міркування ігноруємо. Завжди повертає рядок.
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(b => (typeof b === 'string' ? b : (b && b.type !== 'thinking' && b.type !== 'reasoning' && typeof b.text === 'string' ? b.text : '')))
      .join('');
  }
  if (content && typeof content === 'object' && content.type !== 'thinking' && typeof content.text === 'string') return content.text;
  return '';
}

// Повертає { text, incomplete }: text — усі частини відповіді, склеєні разом;
// incomplete — причина обриву (порожній рядок, якщо модель завершила штатно).
function extractResult(data, platform) {
  if (platform === 'claude') {
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
    const reason = data.stop_reason || '';
    const bad = reason === 'max_tokens' || reason === 'refusal';
    return { text, incomplete: bad ? reason : '' };
  }
  if (platform === 'gemini') {
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
    const reason = cand?.finishReason || '';
    const ok = !reason || reason === 'STOP' || reason === 'FINISH_REASON_UNSPECIFIED';
    const block = data.promptFeedback?.blockReason;
    return { text, incomplete: block ? `prompt blocked: ${block}` : (ok ? '' : reason) };
  }
  if (platform === 'gpt' || platform === 'deepseek' || platform === 'openrouter' || platform === 'qwen' || platform === 'huggingface' || platform === 'mistral' || platform === 'groq') {
    const choice = data.choices?.[0];
    const reason = choice?.finish_reason || '';
    const bad = reason === 'length' || reason === 'content_filter';
    return { text: contentToText(choice?.message?.content), incomplete: bad ? reason : '' };
  }
  return { text: '', incomplete: '' };
}

function extractText(data, platform) {
  return extractResult(data, platform).text;
}
