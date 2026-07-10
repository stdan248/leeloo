# Leeloo :) — технічний довідник проекту

*Складено Люмом безпосередньо з вихідного коду (архів `memory-builder_0607.zip`, 49 файлів, ~7800 рядків JS). Мета документа — швидке орієнтування в наступних сесіях без повторного читання всього коду.*

*Звірено й доповнено 10.07 за живими `service-worker.js`/`popup.js` (баг з `state.existing`, розсинхрон `session_map`).*

---

## 1. Огляд архітектури

Leeloo — Chrome-розширення (Manifest V3), яке архівує розмови з AI-платформами (Claude, Gemini, GPT, DeepSeek) у власне сховище користувача (Google Drive / OneDrive / Dropbox / локальний диск), генерує стислі AI-огляди сесій і підтримує зведений `memory.txt`, який потім вставляється в системний промпт моделі.

```
manifest.json
├── background/service-worker.js   — мозок розширення: обробка, драйвери сховищ, ліміти
├── content/{claude,gemini,gpt,deepseek}.js — витяг сесій зі сторінки платформи
├── popup/
│   ├── popup.html/js/css   — головний UI (Lite/Pro режими)
│   ├── conflict.html/js    — вікно вирішення конфліктів синхронізації
│   ├── doc.html/js         — вбудована документація (UA+EN, секції: about/privacy/terminology/light/pro/book/faq/contacts; навігація будується автоматично з ключів об'єкта contentData[lang].sections)
│   ├── i18n.js             — словники UA/EN
│   └── icons.js            — SVG-іконки (Lucide, stroke=currentColor)
└── utils/
    ├── storage.js   — фасад: getStorage(type) → драйвер
    ├── drive.js / onedrive.js / dropbox.js / local.js — драйвери сховищ
    ├── sync.js      — порівняння локал↔хмара, застосування рішень
    ├── ai.js        — виклики AI-провайдерів для генерації шортів
    ├── memory.js    — побудова memory.txt
    └── models.js    — метадані моделей провайдерів (контекст/швидкість/ціна)
```

**Потік залежностей:** `popup.js` не працює з мережею напряму — всі важкі операції (обробка сесій, звернення до сховищ, AI-виклики) делегуються в `service-worker.js` через `chrome.runtime.sendMessage`. `service-worker.js`, у свою чергу, викликає `utils/*` модулі. Content-скрипти — це "руки" на сторінці платформи: вони читають DOM/localStorage/fetch-перехоплення і віддають дані через `window.__mb*` функції, які service worker викликає через `chrome.scripting.executeScript`.

---

## 2. Ключові структури даних

### Формат файлів в архіві (на диску/в хмарі)
```
[Root]/
  {platform}/                     ← claude / gemini / gpt / deepseek / кастомна назва
    full/full_NNNN.txt            ← повний текст сесії, один файл на сесію
    short/short_NNNN.txt          ← стислий AI-огляд, один файл на сесію
    short/short_NNNN-MMMM.txt     ← "блок" — кілька шортів в одному файлі (режим blocks)
    memory.txt                    ← зведений індекс усіх сесій (генерується автоматично)
    tags.txt                      ← теги з вагою: тег×кількість [номери_сесій]
    session_map.txt                ← стабільна нумерація: sessionId → NNNN
    session_meta.json              ← метадані по кожній сесії (originalChars, lastChars, дати)
    _system/                       ← службові run-логи (run_{reason}_{timestamp}.log), не для читання
    books/{tags,memory,short,full,combined}/book_NNN.txt  ← експортовані "книги пам'яті"
```

### Роздільники й маркери всередині файлів
- `<<<SESSION_SEP>>>` — роздільник записів у "блокових" шорт-файлах (`appendSorted`)
- `SESSION_ID: ...` / `SESSION_NUM: ...` / `SESSION_DATE: ...` — заголовок кожного full/short запису
- `=SHORT=` / `=MEMORY=` / `=TAGS=` — маркери в AI-відповіді, які парсить `parseShortAndTags()` (ai.js)
- `NNN | id | «назва»` — формат рядка в `memory.txt` (memory.js, `formatEntry`)
- `тег×N [1,7,23]` — формат рядка в `tags.txt`

### Об'єкт `config` (передається між popup.js ↔ service-worker.js)
Містить: `platform, storage, mode, aiPlatform, archiveMode, shortFormat, blockSize, cloudId, driveToken, localDirHandle, apiKey, openrouterModel, numStart, numDigits, archiveSizeMB, shortDelay, skipLast, sessions[]`.

### `processingState` (живе в service-worker, дублюється в `chrome.storage.local`)
`{ running, paused, sessions[], index, archiveSize, archiveStart, sysIndex, config, metaUpdating, retryCount }` — це те, що дозволяє відновити обробку після зупинки/перезапуску SW.

---

## 3. Потоки виконання (flows)

### 3.1 Архівування сесій (основний потік)
1. Popup: користувач тисне «Старт» → `startProcessing()` в popup.js будує `config` (`buildConfig()`/`buildLiteConfig()`).
2. Popup просить у SW список сесій (`GET_SESSIONS`) → SW інжектить `content/{platform}.js` у вкладку → бере `window.__mbGetSessions()`.
3. Popup фільтрує сесії (`filterSessions`: new/all/select/auto) і шле `START_PROCESSING` у SW разом з обраними сесіями.
   - Фільтри `new`/дефолт (не-auto, не-all, не-select) спираються на `state.existing` (Set номерів уже заархівованих сесій) — **не на `session_map`**, а на реальний стан диска. Наповнюється через `refreshExisting()` → повідомлення `GET_EXISTING` → SW-функція `computeExistingNums(config)` (читає full/short/memory, враховує `archiveMode`/`shortFormat`). Викликається перед стартом обробки і перед показом сітки ручного вибору. **До 10.07 цей Set ніде не заповнювався** (дефолтна ініціалізація `new Set()` так і лишалась порожньою) — через це режим "нові сесії" фактично обробляв усе з нуля; виправлено додаванням `GET_EXISTING`.
   - **Перевірка диска в `startProcessing` (SW) тепер працює для всіх режимів, крім `all`** (раніше — лише для `auto`). Вона розставляє прапорці `session._shortOnly`/`session._memoryOnly` (full вже є, бракує лише short/memory — `processNext` тоді не перечитує full) для будь-якого режиму; а **відсіювання** повністю готових сесій зі списку — і далі робиться лише в `auto`. Це закриває клас багів "full вже готовий, а short відстав (обрив на AI-кроці) → 'нові сесії' даремно перезаписують готовий full" — саме так і сталось 10.07 (short відставав від full на ~80 сесій).
4. SW (`startProcessing` → `processNext`, рекурсивний цикл по одній сесії):
   - У режимі `auto` — звіряє з тим, що вже є на диску (`existingFullNums`, `existingShortNums`, `existingBlockNums`, `existingMemoryNums`), обробляє лише пропущене.
   - Стабільна нумерація через `session_map.txt` (`applySessionMap`) — щоб номер сесії не "плив" між прогонами.
   - Для кожної сесії: `fetchSessionContent()` — навігація на сторінку сесії, скрол (Gemini/DeepSeek потребують lazy-load скролу, Claude/GPT — ні), очікування стабілізації тексту (2 однакових виміри підряд).
   - Зберігає `full/full_NNNN.txt` (`saveToArchive('full', ...)`).
   - Якщо режим не `full_only` — через `interruptibleDelay(shortDelay)` чекає (rate-limit AI), викликає `buildShort()` (ai.js) → зберігає `short/`, оновлює `tags.txt` (`updateTags`).
   - Після кожної сесії оновлює `memory.txt` одразу (щоб не втратити прогрес при перериванні).
   - Помилки: `RATE_LIMIT` → до 3 повторних спроб із затримкою; `STORAGE_ERROR` → одразу стоп; інші → 3 спроби, потім стоп.
5. `finalize()` → `buildSystemPrompt()` формує мапу архіву (шлях + структура + reading strategy, БЕЗ вмісту файлів) → `injectSystemPrompt()` ставить `window.__memoryBuilderPrompt` + подію `mb:system-prompt` на сторінці (не пряме вставлення в чат — чи ловлять це content-скрипти, не перевірено).

### 3.2 Синхронізація локал↔хмара
1. Popup: `syncAnalyze()` → динамічний імпорт `utils/sync.js` → `analyzeSync({ syncCloud, cloudId, cloudToken, platform, localDirHandle })`.
2. `sync.js` рекурсивно обходить локальну папку (`listLocalFiles`) і хмарну (`listCloudFiles`, з повним відносним шляхом `platform/short/short_0415.txt`), порівнює по `Map<name, {size, modified}>`.
3. Результат: `{ onlyLocal, onlyCloud, different, same }`. `different` містить обʼєкти з `name` (повний шлях), `localSize/cloudSize/localModified/cloudModified`.
4. За наявності `different` — кнопка відкриває `conflict.html` (`openConflictWindow`), параметри йдуть через `chrome.storage.session`.
5. `conflict.js`: користувач обирає напрямок (`local`/`cloud`/`skip`) для кожного файлу → `applyDecisions()` читає з одного сховища і пише в інше через `LocalStorage`/хмарний драйвер, використовуючи те саме `name` (повний шлях) з кроку 2 — тобто шлях не губиться.

### 3.3 Створення "книги пам'яті" (`createBook`, SW)
Читає `tags.txt`/`memory.txt`/усі `short/`/усі `full/` (батчами по 10 файлів через `Promise.all`), конкатенує за обраними опціями (`bookConfig.include*`), за потреби ріже на частини по `maxSizeMB` (`splitIntoBooks`, лічить кирилицю як 2 байти), зберігає в `{platform}/books/{tags,memory,short,full,combined}/book_NNN.txt`.

---

## 4. Драйвери сховищ — специфіка й обмеження

| Драйвер | Адресація | Пошук перед записом? | Ризик дублікатів |
|---|---|---|---|
| **Google Drive** (`drive.js`) | внутрішній `fileId`, ім'я НЕ унікальне | так, через `q=name='...' and parentId in parents` | **був** — eventual consistency пошукового індексу; виправлено кешем `fileIdCache` в пам'яті модуля (кешує ID одразу після create/update, не чекаючи індексації) |
| **OneDrive** (`onedrive.js`) | `fileId` для файлів; папки через `getOrCreateFolder` з `conflictBehavior` | так, `$filter=name eq '...'` | **був, гірший** — `getOrCreateFolder` мав `conflictBehavior: 'rename'`, що при гонитві мовчки плодило папки-дублікати (`short (1)`). Виправлено: `conflictBehavior: 'fail'` + кеш `folderIdCache`/`fileIdCache` + обробка 409 (повторний пошук замість падіння) |
| **Dropbox** (`dropbox.js`) | адресація за **шляхом**, не ID | ні — `save()` одразу йде на `files/upload` з `mode: 'overwrite', autorename: false` | вразливості немає за дизайном — шлях унікальний за визначенням, немає проміжного пошуку |
| **Local** (`local.js`) | File System Access API, `FileSystemDirectoryHandle` з IndexedDB | немає мережевого пошуку, працює напряму з хендлами | немає — `createWritable()`/`close()` атомарний по своїй природі на рівні браузера (хоча технічно робить temp-file+rename під капотом — важливо, якщо ця сама папка одночасно спостерігається OS-клієнтом хмари, див. розділ 5) |

Усі драйвери реалізують однаковий інтерфейс: `read, save, append, appendSorted, getFileSizeMB, listFolder, getOrCreateFolder` (крім Dropbox — там `getOrCreateFolder` спрощений, і local.js — там немає `rename`). `storage.js` — єдина точка вибору драйвера (`getStorage(type)`).

---

## 5. Відомі особливості й нюанси

- **MV3 service worker вивантажується при простої.** Будь-який кеш у пам'яті (`fileIdCache`, `folderIdCache`) живе лише поки SW активний. Для одного безперервного прогону обробки це не проблема (SW весь час "прокинутий"), але після паузи/повторного відкриття попапу кеш обнуляється — і це нормально, це не баг.
- **File System Access API — атомарний запис через temp-file+rename.** Якщо локальна папка Leeloo одночасно перебуває всередині папки, яку стежить OS-клієнт хмари (OneDrive/Dropbox desktop), rename-swap може заплутати той клієнт (сприйняти як видалення+створення). Це причина крихкості "гібридного" режиму — краще використовувати власні хмарні драйвери Leeloo, а не double-stacking з OS-синком.
- **Google Drive не має унікальних імен файлів у папці** — на відміну від Dropbox/файлової системи. Це джерело класу багів "два файли з однаковим іменем різного розміру" (виправлено кешем, див. розділ 4, але варто пам'ятати при подальших змінах у `drive.js`).
- **Gemini/DeepSeek потребують скролу для lazy-load** повідомлень сесії; Claude/GPT/DeepSeek (при завантаженні сторінки, не скролу!) — ні. Перевірка стабільності контенту йде через порівняння довжини тексту на 2 послідовних вимірах (`stableCount >= 2`).
- **`session_map.txt` може "тікати" вперед від реального вмісту архіву.** `applySessionMap()` присвоює номер сесії одразу при старті обробки — ще до того, як контент реально збережеться. Тому при перерваних/невдалих прогонах `session_map.txt` може показувати більший останній номер, ніж `session_meta.json`/`memory.txt` (реально підтверджені записи). Розрив між ними — ознака "загублених" сесій (номер призначено, вміст не дописано); лікується прогоном **auto**-режиму (звіряє з диском, добирає пропущене), а не "новими сесіями" (яка після фіксу 10.07 теж дивиться на диск, але лише на *повністю* заархівовані номери, тож розрив однаково варто спершу закрити auto-режимом).
- **`session_map.txt` — критичний файл для платформ `gemini, claude, deepseek` (не для `gpt`)**: без нього номер сесії "плаває" між прогонами обробки. Якщо ID загублено (немає в мапі) — є fallback повного пошуку по всіх `full_*.txt` файлах за маркером `SESSION_ID:` (`readFullFromDrive`).
- **Rate-limit обробляється по-різному залежно від коду помилки:** `err.code === 'RATE_LIMIT'` дає до 3 автоматичних повторів із затримкою; `STORAGE_ERROR` зупиняє одразу без повторів (це навмисно — проблема зі сховищем не самолікується часом).
- **Lite-режим** — спрощена конфігурація (`buildLiteConfig`): завжди `storage: 'local'`, `mode: 'auto'`, `aiPlatform: 'mistral'` за замовчуванням, коротша затримка (15с). Розрахований на "просто працює" без хмарних токенів.
- **Кирилиця важить вдвічі більше при розрахунку розміру "книги"** (`splitIntoBooks`) — рахує 2 байти на символ з кодом > 127, ASCII — 1 байт. Наближено, не точний UTF-8 підрахунок, але для цілей розбиття на частини достатньо.
- **System prompt = мапа архіву, показується вручну, не памʼять.** `buildSystemPrompt()` (SW, ~759) — тільки шлях/структура, без вмісту. Генерується одразу після `finalize()` (обробка сесій, кнопка "Старт"), НЕ після створення книги — це різні моменти, doc.js раніше плутав це (виправлено 08.07). **Підтверджено Сергієм 08.07: `injectSystemPrompt()` (~811, window var + подія `mb:system-prompt`) НЕ працює — нічого автоматично в модель не потрапляє.** Єдиний робочий шлях — користувач сам копіює промпт з фінального екрану і додає його в system instructions AI вручну (описано в doc.js, 4.5). Реальний retrieval — заплановано, не реалізовано. Альтернативний ручний обхід: `createBook()` (3.3) або нативні Drive-connectors платформ (є в Claude.ai/Gemini/ChatGPT з ручним підтвердженням, нема в DeepSeek).

---

## 6. Термінологія проекту

| Термін | Значення |
|---|---|
| **Фул (full)** | повний текст сесії, зберігається в `full/full_NNNN.txt` |
| **Шорт (short)** | стислий AI-згенерований огляд сесії (`=SHORT=` блок), `short/short_NNNN.txt` |
| **Мемо / memory** | одне речення-суть сесії (`=MEMORY=` блок), йде рядком у зведений `memory.txt` |
| **Блок (block)** | режим `shortFormat: 'blocks'` — кілька шортів в одному файлі `short_NNNN-MMMM.txt`, розділені `<<<SESSION_SEP>>>` |
| **Session map** | файл стабільної відповідності `sessionId → порядковий номер`, щоб номери не з'їжджали між прогонами |
| **Auto-режим (`mode: 'auto'`)** | обробка лише пропущених сесій — звіряє, чого бракує на диску, і добирає |
| **Lite / Pro** | два UI-режими: Lite — спрощений (тільки локальний диск, мінімум налаштувань), Pro — повний контроль над усіма параметрами |
| **Книга (book)** | експортований зведений файл (тегів/memory/шортів/фулів/усього разом) для передачі в контекст іншій моделі |
| **_system** | службова папка з run-логами обробки, не призначена для читання людиною чи AI |
| **Прогрес-мітка / бейдж** | іконка розширення в Chrome показує статус (`...`, `NN/MM`, `✓`, `⏸`, `!`) через `chrome.action.setBadgeText` |
