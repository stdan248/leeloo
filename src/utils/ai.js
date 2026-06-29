// utils/ai.js — генерація шорту через API моделі

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

function getContextLimit(platform, model) {
  if (platform === 'groq') {
    if (model === 'llama-3.1-8b-instant') return 12000;
    return 15000;
  }
  if (platform === 'mistral' || platform === 'huggingface') return 20000;
  return 28000;
}

export async function buildShort(fullText, platform, apiKey, sessionNum = null, openrouterModel = null, sessionDate = null) {
  if (!fullText) return '[контент недоступний]';
  const apiConfig = getApiConfig(platform, apiKey, openrouterModel);
  const contextLimit = getContextLimit(platform, openrouterModel);

  const body = { ...apiConfig.body };
  const dateHint = sessionDate ? `Дата сесії: ${sessionDate.slice(0, 10)}.\n` : '';
  const numHint = sessionNum ? `Номер цієї сесії: ${sessionNum}.\n${dateHint}\n` : (dateHint ? `${dateHint}\n` : '');
  const totalLen = fullText.length;
  const sizeHint = totalLen > 28000 ? `Увага: повний обсяг фулу — ${totalLen} символів (подано перші 28000). SHORT має бути ~${Math.round(totalLen * 0.15)} символів.\n` : '';

  const fewShot = `ПРИКЛАД ПРАВИЛЬНОГО ФОРМАТУ:
=SHORT=
Сесія 12 — «Налаштування інтеграції та обговорення архітектури.»

Основна робота — підключення зовнішнього сервісу до проєкту. Виникла проблема з авторизацією: токен не приймається через невірний формат — виправлено вручну. Обговорено структуру бази даних і спосіб зберігання даних. Прийнято рішення використовувати окремі таблиці для різних типів записів.

=MEMORY=
Технічне налаштування інтеграції, виправлення авторизації, рішення щодо структури БД.

=TAGS=
технічна_робота, інтеграція, архітектура, база_даних, рішення

ВИМОГИ:
- =SHORT=, =MEMORY= і =TAGS= — обов'язкові маркери
- SHORT: повний огляд ~15% від обсягу фулу (кілька абзаців для великих сесій)
- MEMORY: одне речення макс 150 символів — суть глибша ніж назва
- TAGS: 4-7 тегів через кому, тільки українська, апострофи дозволені
- НІЧОГО БІЛЬШЕ

---
ТЕКСТ СЕСІЇ ДЛЯ ОБРОБКИ:\n\n`;

  if (platform === 'gemini') {
    body.contents = [{ parts: [{ text: `${numHint}${sizeHint}${fewShot}${fullText.slice(0, contextLimit)}` }] }];
  } else {
    body.messages = [
      { role: 'user', content: `${numHint}${sizeHint}${fewShot}${fullText.slice(0, contextLimit)}` }
    ];
  }

  console.log(`[AI] → ${platform} запит (${fullText.length} символів, ліміт ${contextLimit})`);

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

  const result = extractText(data, platform);
  console.log(`[AI] ✓ Результат: ${result.slice(0, 80)}...`);
  return parseShortAndTags(result);
}

// ── Парсинг відповіді на { short, tags } ─────────────────────────────────────
function parseShortAndTags(raw) {
  const shortMatch  = raw.match(/=SHORT=\s*([\s\S]*?)(?==MEMORY=|=TAGS=|$)/);
  const memoryMatch = raw.match(/=MEMORY=\s*([\s\S]*?)(?==TAGS=|$)/);
  const tagsMatch   = raw.match(/=TAGS=\s*([\s\S]*?)$/);

  const short = shortMatch ? shortMatch[1].trim() : raw.trim();
  const memory = memoryMatch ? memoryMatch[1].trim() : '';
  const tagsRaw = tagsMatch ? tagsMatch[1].trim() : '';
  const tags = tagsRaw
    .split(',')
    .map(t => t.trim().replace(/['’ʼ]/g, "'"))
    .filter(t => t.length > 2 && (t.includes('_') || t.includes("'")));

  return { short, memory, tags };
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
        max_tokens: 12000,
        system: SYSTEM_PROMPT,
      },
    },
    gemini: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 12000 },
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
        max_tokens: 12000,
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
        max_tokens: 12000,
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
        max_tokens: 12000,
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
        model: 'qwen-plus',
        max_tokens: 12000,
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
        model: 'Qwen/Qwen2.5-72B-Instruct',
        max_tokens: 12000,
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
        model: 'mistral-small-latest',
        max_tokens: 12000,
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
        max_tokens: 12000,
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
    case 400: throw new Error(`Невірний запит до ${name}. Перевірте API-ключ або модель.`);
    case 401: throw new Error(`API-ключ ${name} недійсний або відсутній — оновіть ключ у налаштуваннях.`);
    case 403: throw new Error(`Доступ заборонено (${name}). Перевірте тарифний план або дозволи ключа.`);
    case 413: throw new Error(`Текст сесії занадто великий для ${name} — спробуйте скоротити або змінити модель.`);
    case 429: { const e = new Error(`Перевищено ліміт запитів ${name}. Спробуйте пізніше.`); e.code = 'RATE_LIMIT'; throw e; }
    case 404: throw new Error(`Модель або endpoint ${name} не знайдено — перевірте назву моделі.`);
    case 500:
    case 503: { const e = new Error(`Сервер ${name} тимчасово недоступний. Спробуйте пізніше.`); e.code = 'RATE_LIMIT'; throw e; }
    default:  throw new Error(`Помилка ${status} від ${name}.`);
  }
}

function extractText(data, platform) {
  if (platform === 'claude') {
    return data.content?.[0]?.text || '';
  }
  if (platform === 'gemini') {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  if (platform === 'gpt' || platform === 'deepseek' || platform === 'openrouter' || platform === 'qwen' || platform === 'huggingface' || platform === 'mistral' || platform === 'groq') {
    return data.choices?.[0]?.message?.content || '';
  }
  return '';
}
