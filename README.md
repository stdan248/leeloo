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

## What it does

1. Numbers all conversation sessions
2. Stores full transcripts in `full/`
3. Automatically generates short, tagged summaries in `short/`
4. Maintains `memory.txt` — a concise overview of the entire archive
5. Logs internal service sessions to `_system/` (kept separate from the archive)
6. Automatically updates the model's system prompt on every launch

---

## Setup

### Google Drive
- Create a root folder for the archive
- Copy the folder ID from the URL: `drive.google.com/drive/folders/**THIS_IS_THE_ID**`
- Paste the ID into the "Google Drive — root folder ID" field

### API keys (for generating summaries)
| Platform | Where to get it |
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

## Archive structure

```
[Root folder]/
  claude/
    full/
      full_001-099.txt    ← full transcripts, sessions 1-99
      full_100-201.txt    ← sessions 100-201
    short/
      short_001-099.txt   ← tagged short summaries
    _system/
      sys_001_processing_1.txt  ← internal service sessions (not for reading)
    memory.txt            ← summary of the entire archive
```

---

## Processing modes

| Mode | Description |
|-------|------|
| **New sessions** | Adds sessions after the last one saved. For regular use. |
| **Automatic** | Fills gaps in the archive. For recovery after failures. |
| **All** | Rebuilds the archive from scratch. |
| **Select** | Manually pick specific sessions. |

---

## Limits

**Archive:** once a set size is reached (2 MB by default), a new file is created with a marked session range.

**Model:** once the API limit is reached, progress is saved automatically. "Resume now" or "Stop and save" buttons are available.

---

## System prompt

After processing finishes, the extension automatically inserts this into the model's system prompt:

```
<memory_archive>
This is your archive of all conversations with the user.
Path: [Drive: ...]/claude/
...
</memory_archive>
```

The model sees this prompt on every new request.

---

## Permissions

| Permission | Why |
|--------|--------|
| `storage` | Save extension settings |
| `scripting` | Insert the system prompt |
| `tabs` | Find the open model tab |
| `alarms` | Auto-resume after hitting a limit |
| `identity` | OAuth for cloud storage |

---

## Supported platforms

- **Browsers:** Chrome, Edge, Brave (Manifest V3)
- **Models:** Claude (claude.ai), Gemini (gemini.google.com), ChatGPT (chatgpt.com), DeepSeek (chat.deepseek.com)
- **Storage:** Google Drive, OneDrive, Dropbox, local
