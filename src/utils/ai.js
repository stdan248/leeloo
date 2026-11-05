// utils/ai.js — генерація шорту через API моделі

import { getInputCharLimit, outputTokensFor, RATIOS } from './models.js';

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

export async function buildShort(fullText, platform, apiKey, sessionNum = null, openrouterModel = null, sessionDate = null) {
  if (!fullText) return '[контент недоступний]';
  const apiConfig = getApiConfig(platform, apiKey, openrouterModel);
  // Ефективна модель: у Gemini вона в URL, в інших — у body.model
  const effectiveModel = apiConfig.body.model || (platform === 'gemini' ? (openrouterModel || 'gemini-2.5-flash') : null);
  // Ліміт тексту — з довідника моделей (+ ліміт тарифу провайдера), а не зашите число
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

  console.log(`[AI] → ${platform} запит (${fullText.length} символів, ліміт ${contextLimit}, джерело: ${limitSource}${contextTokens ? `, контекст моделі ${contextTokens} токенів` : ''}, бюджет відповіді ${maxOut} токенів)`);

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
    return { text: choice?.message?.content || '', incomplete: bad ? reason : '' };
  }
  return { text: '', incomplete: '' };
}

function extractText(data, platform) {
  return extractResult(data, platform).text;
}
