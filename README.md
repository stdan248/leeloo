# Leeloo :) — AI Memory Builder

**Never lose a conversation with AI again.** Leeloo is a Chrome extension that automatically archives your Claude, Gemini, ChatGPT, and DeepSeek conversations — full transcripts, smart summaries, and searchable memory — straight to your own storage: Google Drive, Dropbox, OneDrive, or local disk.

No cloud lock-in. No third-party server reading your chats. Your conversations stay yours.

## Why Leeloo

- 🗂️ **Multi-platform archiving** — Claude, Gemini, ChatGPT, DeepSeek (and more via "Other")
- ☁️ **Your storage, your rules** — Google Drive, OneDrive, Dropbox, or fully local
- 🧠 **Smart memory, not just backup** — auto-generates tagged summaries per session and a running `memory.txt` index of the whole archive
- 🤖 **Bring your own AI for summaries** — pick any model to generate the shorts, independent of which platform you're archiving: Claude, Gemini, GPT, DeepSeek, OpenRouter, Qwen, HuggingFace, Mistral, Groq
- 🔄 **Self-updating context** — automatically inserts the memory archive into the model's system prompt on every session, so the AI you're talking to actually knows its own history with you
- ⚡ **Lite mode** — single-screen, minimal setup, local-only, for when you just want it to work
- 🇺🇦 🇬🇧 Full UA/EN localization, dark theme

## Demo

📺 [Watch the demo video](https://youtu.be/BnSpNMiTV-M)

![Leeloo Lite mode popup](src/img/docs/2.1.png)

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `leeloo/` folder

---

## Що робить

1. Нумерує всі сесії розмов
2. Зберігає повні тексти у `full/`
3. Автоматично генерує стислі записи з тегами у `short/`
4. Веде `memory.txt` — короткий зміст усього архіву
5. Записує службові сесії в `_system/` (окремо від архіву)
6. Автоматично оновлює системний промпт моделі при кожному запуску

---

## Налаштування

### Google Drive
- Створіть кореневу папку для архіву
- Скопіюйте ID папки з URL: `drive.google.com/drive/folders/**ЦЕ_І_Є_ID**`
- Вставте ID у поле "Google Drive — ID кореневої папки"

### API ключі (для генерації шортів)
| Платформа | Де отримати |
|-----------|-------------|
| Claude | console.anthropic.com → API Keys |
| Gemini | aistudio.google.com → Get API key |
| GPT | platform.openai.com → API keys |
| DeepSeek | platform.deepseek.com → API keys |
| OpenRouter | openrouter.ai → Keys |
| Qwen | dashscope.console.aliyun.com → API keys |
| HuggingFace | huggingface.co → Settings → Access Tokens |
| Mistral | console.mistral.ai → API keys |
| Groq | console.groq.com → API keys |

---

## Структура архіву

```
[Коренева папка]/
  claude/
    full/
      full_001-099.txt    ← повні тексти сесій 1-99
      full_100-201.txt    ← сесії 100-201
    short/
      short_001-099.txt   ← стислі записи з тегами
    _system/
      sys_001_обробка_1.txt  ← службові сесії (не читати)
    memory.txt            ← зміст усього архіву
```

---

## Режими обробки

| Режим | Опис |
|-------|------|
| **Нові сесії** | Додає сесії після останньої збереженої. Для регулярного використання. |
| **Автоматично** | Заповнює пропуски в архіві. Для відновлення після збоїв. |
| **Всі** | Переробляє архів з нуля. |
| **Вибрати** | Ручний вибір конкретних сесій. |

---

## Ліміти

**Архіву:** при досягненні заданого розміру (за замовчуванням 2 MB) створюється новий файл з позначкою діапазону сесій.

**Моделі:** при досягненні ліміту API прогрес зберігається автоматично. Є кнопки "Продовжити зараз" або "Зупинити і зберегти".

---

## Системний промпт

Після завершення обробки розширення автоматично вставляє до системного промпту моделі:

```
<memory_archive>
Це твій архів усіх розмов із користувачем.
Шлях: [Drive: ...]/claude/
...
</memory_archive>
```

Модель бачить цей промпт при кожному новому запиті.

---

## Дозволи

| Дозвіл | Навіщо |
|--------|--------|
| `storage` | Зберігати налаштування розширення |
| `scripting` | Вставляти системний промпт |
| `tabs` | Знайти відкриту вкладку моделі |
| `alarms` | Автовідновлення після ліміту |
| `identity` | OAuth для хмарних сховищ |

---

## Підтримувані платформи

- **Браузери:** Chrome, Edge, Brave (Manifest V3)
- **Моделі:** Claude (claude.ai), Gemini (gemini.google.com), ChatGPT (chatgpt.com), DeepSeek (chat.deepseek.com)
- **Сховища:** Google Drive, OneDrive, Dropbox, локально
