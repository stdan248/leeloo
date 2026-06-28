
# Leeloo:) — AI Memory Builder

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🇬🇧 English

**Leeloo:)** is your personal assistant that builds **long-term memory for AI**.  
Modern AI models (Claude, Gemini, GPT, DeepSeek) don't remember past conversations — every new chat starts from scratch. Leeloo:) solves this by archiving, tagging, and summarizing your dialogues, turning them into a structured "memory book" your AI can read.

---

### ✨ Features

- 📂 **Full-text archive** — every conversation is saved completely  
- 📝 **Smart summaries** — AI-generated short versions of each chat  
- 🏷️ **Automatic tagging** — key topics with relevance weights  
- 📖 **Memory book** — a single compiled file you can feed to any AI  
- ☁️ **Cloud support** — Google Drive, OneDrive, Dropbox, or local storage  
- ⚙️ **Flexible modes** — Light (quick start) and Professional (full control)

---

### 🚀 Quick Start (Light Mode)

1. Open your AI page (Claude, Gemini, GPT, or DeepSeek)  
2. Launch the Leeloo:) extension/app  
3. Select your AI model from the list  
4. Get a free Mistral API key (instructions inside the app)  
5. Choose a folder for the archive  
6. Click **Start** — the app will process all your conversations  
7. When done, click **Create book** — your AI memory is ready!

---

### 📦 Installation

**Option 1: Download from GitHub**  
1. Go to the repository: [github.com/stdan248/leeloo](https://github.com/stdan248/leeloo)  
2. Click the green button **Code** → **Download ZIP**  
3. Extract the ZIP file to any folder on your computer  

**Option 2: Clone with Git**  
```bash
git clone https://github.com/stdan248/leeloo.git
```

**Option 3: Use as a browser extension**  
1. Open your browser (Chrome, Edge, or Firefox)  
2. Go to the extensions page:  
   - Chrome: `chrome://extensions/`  
   - Edge: `edge://extensions/`  
   - Firefox: `about:addons`  
3. Enable **Developer mode** (Chrome/Edge — toggle in the top right)  
4. Click **Load unpacked** (Chrome/Edge) or **Load Temporary Add-on** (Firefox)  
5. Select the folder where you extracted/cloned the project  
6. The Leeloo:) icon should appear in your browser toolbar

> **Note:** The app was built for Chrome but should work in Firefox as well. If you encounter issues, check for `chrome.debugger` or `chrome.tabGroups` APIs in the code.

---

### 📁 Archive Structure

After processing, the app creates a folder like this:

```
Your_AI_Model/
├── full/           # Full conversation texts
├── short/          # AI-generated summaries
├── _system/        # System files
├── memory.txt      # Table of contents
├── tags.txt        # Auto-generated tags with weights
└── book/
    └── combined/   # Ready-to-use memory book
```

---

### 🛠️ Supported AI Platforms

Claude · Gemini · GPT · DeepSeek · OpenRouter · Qwen · HuggingFace · Mistral · Groq

---

## 🇺🇦 Українська

**Leeloo:)** — це ваш особистий помічник, який створює **довготривалу пам'ять для штучного інтелекту**.  
Сучасні AI-моделі (Claude, Gemini, GPT, DeepSeek) не запам'ятовують минулі розмови — кожен новий діалог починається з чистого аркуша. Leeloo:) вирішує цю проблему, архівуючи, тегуючи та підсумовуючи ваші діалоги, перетворюючи їх на структуровану «книгу пам'яті», яку може прочитати будь-який ШІ.

---

### ✨ Можливості

- 📂 **Повний архів** — кожна розмова зберігається повністю  
- 📝 **Розумні підсумки** — стислі версії кожної бесіди, створені ШІ  
- 🏷️ **Автоматичне тегування** — ключові теми з вагою важливості  
- 📖 **Книга пам'яті** — єдиний файл, який можна передати будь-якому ШІ  
- ☁️ **Хмарна підтримка** — Google Drive, OneDrive, Dropbox або локальне сховище  
- ⚙️ **Гнучкі режими** — Легкий (швидкий старт) та Професійний (повний контроль)

---

### 🚀 Швидкий старт (Легкий режим)

1. Відкрийте сторінку вашого ШІ (Claude, Gemini, GPT або DeepSeek)  
2. Запустіть розширення/додаток Leeloo:)  
3. Виберіть вашу AI-модель зі списку  
4. Отримайте безкоштовний API-ключ Mistral (інструкція всередині додатка)  
5. Оберіть папку для архіву  
6. Натисніть **Старт** — додаток обробить усі ваші розмови  
7. Після завершення натисніть **Створити книгу** — пам'ять вашого ШІ готова!

---

### 📦 Встановлення

**Варіант 1: Завантажити з GitHub**  
1. Перейдіть до репозиторія: [github.com/stdan248/leeloo](https://github.com/stdan248/leeloo)  
2. Натисніть зелену кнопку **Code** → **Download ZIP**  
3. Розпакуйте ZIP-архів у будь-яку папку на комп'ютері  

**Варіант 2: Клонувати через Git**  
```bash
git clone https://github.com/stdan248/leeloo.git
```

**Варіант 3: Використовувати як розширення для браузера**  
1. Відкрийте ваш браузер (Chrome, Edge або Firefox)  
2. Перейдіть на сторінку розширень:  
   - Chrome: `chrome://extensions/`  
   - Edge: `edge://extensions/`  
   - Firefox: `about:addons`  
3. Увімкніть **Режим розробника** (Chrome/Edge — перемикач у правому верхньому кутку)  
4. Натисніть **Завантажити розпаковане** (Chrome/Edge) або **Завантажити тимчасовий додаток** (Firefox)  
5. Виберіть папку, куди ви розпакували/склонували проєкт  
6. Іконка Leeloo:) має з'явитися на панелі інструментів браузера

> **Примітка:** додаток створювався для Chrome, але має працювати й у Firefox. Якщо виникнуть проблеми — перевірте наявність у коді `chrome.debugger` або `chrome.tabGroups`.

---

### 📁 Структура архіву

Після обробки додаток створює таку структуру:

```
Ваша_AI_Модель/
├── full/           # Повні тексти розмов
├── short/          # Стислі підсумки (шорти)
├── _system/        # Службові файли
├── memory.txt      # Загальний зміст
├── tags.txt        # Автоматичні теги з вагою
└── book/
    └── combined/   # Готова книга пам'яті
```

---

### 🛠️ Підтримувані AI-платформи

Claude · Gemini · GPT · DeepSeek · OpenRouter · Qwen · HuggingFace · Mistral · Groq

---

## 📄 License / Ліцензія

MIT License — feel free to use, modify, and distribute.  
MIT License — можете вільно використовувати, змінювати та поширювати.

---

## 📬 Contact / Контакти

**Created with love** by Serhii & Lum for Sofiia & Milla J. 💛  
**Створено з любов'ю** Сергієм та Люм для Софії та Мили Й. 💛

Email: [respond2q+leeloo@gmail.com](mailto:respond2q+leeloo@gmail.com)
```
