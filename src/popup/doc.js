(function() {
    // ================================================================
    // 1. ДАНІ
    // ================================================================
    const contentData = {
      ua: {
        title: 'Документація Leeloo:) <small>AI Memory Builder</small>',
        sections: {
          about: {
            title: 'Про додаток',
            content: `
              <h2>Про додаток Leeloo:)</h2>
              <p><strong>Leeloo:)</strong> — це ваш особистий помічник, який створює <strong>пам'ять для штучного інтелекту</strong>.</p>
              <p>Сучасні AI-моделі (як Claude, Gemini, GPT або DeepSeek) не запам'ятовують минулі розмови. Кожен новий діалог починається з «чистого аркуша». Leeloo:) вирішує цю проблему.</p>
              <h3>Що він вміє?</h3>
              <ul>
                <li><strong>Аналізує ваші розмови</strong> — усі чати AI автоматично обробляються додатком.</li>
                <li><strong>Створює структурований архів</strong> — кожна розмова зберігається у вигляді повного тексту (фул) та стислого підсумку (шорт).</li>
                <li><strong>Додає теги</strong> — автоматично аналізує розмови й позначає ключові теми з їхньою вагою.</li>
                <li><strong>Формує «книгу пам'яті»</strong> — це скомбінований файл, який можна передати AI, щоб він «згадав» усе, про що ви говорили раніше.</li>
                <li><strong>Працює з будь-яким текстом (окрім нестандартних символів та рівнянь)</strong> — підтримує локальне зберігання та хмарні сервіси (Google Drive, OneDrive, Dropbox).</li>
                <li><strong>Дає гнучкість</strong> — у «Професійному» режимі ви можете налаштувати все: від моделі для генерації шортів до формату файлів.</li>
              </ul>
              <h3>Для кого це?</h3>
              <ul>
                <li>Для тих, хто веде довгі проєкти з AI і хоче зберігати контекст.</li>
                <li>Для дослідників, письменників, розробників — усіх, хто цінує історію своїх діалогів.</li>
                <li>Для всіх, хто хоче, щоб AI пам'ятав більше, ніж одну розмову.</li>
              </ul>
              <h3>Простою мовою:</h3>
              <blockquote><strong>Leeloo:)</strong> — це як щоденник для вашого AI. Ви розмовляєте, а додаток архівує, сортує, підсумовує й у потрібний момент нагадує AI, про що ви говорили раніше.</blockquote>
            `
          },
          terminology: {
            title: '1. Термінологія',
            content: `
              <h2>1. Термінологія</h2>
              <p>Перш ніж почати роботу з додатком, варто ознайомитися з основними поняттями, які використовуються в інтерфейсі та документації.</p>
              <table>
                <thead><tr><th>Термін</th><th>Пояснення</th></tr></thead>
                <tbody>
                  <tr><td><strong>Сесія</strong></td><td>Одна розмова (чат) із AI-моделлю. Кожна сесія має унікальний ID та історію повідомлень.</td></tr>
                  <tr><td><strong>Фул (full)</strong></td><td>Повний, незмінений текст усієї сесії. Зберігається в папці <code>full/</code>.</td></tr>
                  <tr><td><strong>Шорт (short)</strong></td><td>Стислий підсумок сесії, згенерований AI. Передає суть розмови в меншому обсязі. Обмеження залежать від моделі (див. розділ 3.5).</td></tr>
                  <tr><td><strong>Теги</strong></td><td>Ключові слова або теми, які додаток автоматично витягує з розмов. Кожен тег має «вагу» — числове значення важливості.</td></tr>
                  <tr><td><strong>Архів</strong></td><td>Уся структура папок і файлів, яку створює додаток у вибраному сховищі. Включає фули, шорти, теги, службові файли тощо.</td></tr>
                  <tr><td><strong>Книга</strong></td><td>Скомпільований файл (або набір файлів), який об'єднує теги, зміст, шорти та фули в єдину структуру. Створюється на основі архіву.</td></tr>
                  <tr><td><strong>Пам'ять</strong></td><td>Це <strong>архів + книга</strong>. Те, що в підсумку передається AI для читання. Пам'ять — готовий результат роботи додатка, який містить усе необхідне для відновлення контексту.</td></tr>
                </tbody>
              </table>
            `
          },
          light: {
            title: '2. Легкий режим',
            content: `
              <h2>2. Режим «Легкий» (швидкий старт)</h2>
              <p>Цей режим призначений для швидкого знайомства з додатком. Він використовує <strong>Mistral API</strong> (безкоштовний AI для генерації шортів) та власні автоматичні налаштування.</p>
              <h3 id="light-start">2.1. Запустіть додаток на сторінці вашого AI</h3>
              <p>Відкрийте сторінку вашого AI (Claude, Gemini, GPT або DeepSeek) і запустіть додаток Leeloo:). Він має бути постійно відкритим протягом усього процесу.</p>
              <p><img src="../img/docs/2.1.ua.png" style="max-width:100%;border-radius:8px;margin:10px auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block" alt=""></p>
              <h3 id="light-model">2.1.1. Оберіть модель вашого AI</h3>
              <p>Виберіть зі списку модель, з якою ви працюєте:</p>
              <ul>
                <li><strong>Claude</strong></li>
                <li><strong>Gemini</strong></li>
                <li><strong>GPT</strong></li>
                <li><strong>DeepSeek</strong></li>
              </ul>
              <p>Це допоможе додатку правильно налаштувати обробку даних для вашої конкретної AI-платформи.</p>
              <h3 id="light-key">2.2. Отримайте та додайте API ключ (Mistral)</h3>
              <h4>2.2.1. Покрокова інструкція отримання API ключа Mistral</h4>
              <h5>Частина 1. Вхід на сайт</h5>
              <ol>
                <li><strong>Перейдіть на сайт:</strong> У приватному вікні введіть адресу <a href="https://mistral.ai" target="_blank">https://mistral.ai</a> та натисніть Enter.</li>
                <li><strong>Прийміть куки:</strong> У лівому нижньому кутку екрана натисніть помаранчеву кнопку <strong>OK!</strong> у вікні з текстом <em>Purr-fecting your experience with Cookies</em>.</li>
                <li><strong>Почніть реєстрацію:</strong> У правому верхньому кутку натисніть кнопку <strong>Start building</strong>, а у випадаючому списку оберіть найперший пункт — <strong>Studio</strong>.</li>
                <li><strong>Авторизуйтеся:</strong> На сторінці <em>Login or signup below</em> натисніть на круглу кольорову <strong>іконку Google (літера G)</strong> по центру. Виберіть свій Google-акаунт для швидкого входу, або оберіть інший варіант.</li>
              </ol>
              <h5>Частина 2. Створення профілю (організації)</h5>
              <ol start="5">
                <li><strong>Створіть команду:</strong> На сторінці «Створіть свою команду» у полі <strong>Назва організації</strong> введіть будь-яке ім'я або цифри англійською мовою (наприклад, <code>123</code>).</li>
                <li><strong>Прийміть умови:</strong> Поставте галочку біля пункту <em>«Я приймаю Mistral AI Умови обслуговування...»</em>.</li>
                <li><strong>Підтвердіть:</strong> Натисніть кнопку <strong>Створити організацію</strong> внизу.</li>
              </ol>
              <h5>Частина 3. Генерація та збереження API-ключа</h5>
              <ol start="8">
                <li><strong>Перейдіть до ключів:</strong> У великому лівому меню прокрутіть сторінку до самого низу. У блоці з червоним заголовком <strong>■ API</strong> натисніть на пункт <strong>Ключі API</strong>.</li>
                <li><strong>Запустіть створення:</strong> У правому верхньому кутку кабінету натисніть чорну кнопку <strong>Створити новий ключ</strong>.</li>
                <li><strong>Оберіть простір (Обов'язково):</strong> натисніть на поле <strong>Оберіть робочий простір</strong> і виберіть у випадаючому списку єдиний доступний варіант (зазвичай <code>Default</code> або назву вашої організації). Поле <em>Назва ключа</em> можна залишити порожнім.</li>
                <li><strong>Сгенеруйте ключ:</strong> Натисніть чорну кнопку <strong>Створити новий ключ</strong> у самому низу цього віконця.</li>
                <li><strong>Фінал (Копіювання):</strong> У фінальному вікні натисніть чорну кнопку <strong>Скопіювати ключ</strong> праворуч від синього рядка із кодом.</li>
                <li><strong>Збережіть:</strong> Одразу відкрийте текстовий блокнот на комп'ютері та вставте туди скопійований ключ (<code>sk-...</code>). Лише після цього можна натискати кнопку «Готово».</li>
                <li><strong>Вставте ключ у відповідне поле додатку:</strong> Одразу можете перевірити, натиснувши <strong>«Перевірити ключ»</strong>.</li>
              </ol>
              <p>Ваш ключ повністю готовий до використання!</p>
              <p>🔹 <strong>Важливо:</strong> безкоштовний Mistral має обмеження на обсяг шорту — до <strong>300 знаків</strong>. Це нормально для швидкого старту.</p>
              <h3>2.3. Оберіть папку для зберігання архіву</h3>
              <p>Натисніть <strong>«Обрати / Оновити»</strong> та вкажіть папку, де зберігатиметься архів. Якщо з'являється попередження «Потрібно оновити доступ до диску», натисніть кнопку ще раз.</p>
              <p><img src="../img/docs/2.3.ua.png" style="max-width:100%;border-radius:8px;margin:10px auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block" alt=""></p>
              <h3>2.4. Дочекайтеся завантаження сесій та натисніть «Старт»</h3>
              <p>Додаток завантажить усі ваші чати з AI. Після завершення завантаження з'явиться зелений напис <strong>«Завантажено»</strong> — тоді натискайте <strong>«Старт»</strong> (якщо завантажились не всі сесії — відкрийте весь список вручну та перезайдіть у додаток). Додаток почне свою роботу й у зазначеній вами папці сформує архів у вигляді такої структури:</p>
              <pre>Ваша модель AI/
├── full/           # Повні тексти всіх сесій
├── short/          # Стислі підсумки (шорти)
├── _system/        # Службові файли
├── memory.txt      # Загальний зміст архіву
├── tags.txt        # Автоматичні теги з вагою
└── book/
    └── consolidate/ # Готова книга розмов</pre>
              <p><img src="../img/docs/2.4.ua.png" style="max-width:100%;border-radius:8px;margin:10px auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block" alt=""></p>
              <h3 id="light-book">2.5. Створіть книгу та передайте її AI</h3>
              <p>Після завершення обробки натисніть <strong>«Створити книгу»</strong>. Додаток скомпілює архів у єдиний файл.</p>
              <p>Передайте книгу вашому AI будь-яким зручним способом:</p>
              <ul>
                <li>прикріпіть файл безпосередньо в чаті з AI;</li>
                <li>завантажте в Google Drive, OneDrive або Dropbox і надайте доступ;</li>
                <li>надішліть <strong>собі на email</strong> (наприклад, з темою листа <strong>«Меморі»</strong>) та надайте AI доступ до читання цього листа.</li>
              </ul>
              
            `
          },
          pro: {
            title: '3. Професійний режим',
            content: `
              <h2>3. Режим «Професійний» (детальний посібник)</h2>
              <p>Професійний режим надає розширені налаштування для гнучкого керування архівом.</p>
              <h3 id="pro-platform">3.1. Платформа</h3>
              <p>Оберіть AI-модель, для якої будується архів:</p>
              <ul><li>Claude</li><li>Gemini</li><li>GPT</li><li>DeepSeek</li><li>Інша</li></ul>
              <p>🔹 Вибір моделі впливає на технічну обробку даних, але для користувача процес залишається однаковим.</p>
              <h3 id="pro-storage">3.2. Хмарне сховище</h3>
              <p>Виберіть місце, де зберігатиметься ваш архів. Додаток підтримує чотири варіанти:</p>
              <h4>☁️ Google Drive</h4>
              <ul>
                <li>Натисніть посилання <strong>поруч із полем для вставки токена</strong> — воно веде до <a href="https://developers.google.com/oauthplayground" target="_blank">OAuth 2.0 Playground</a> (оберіть Drive API v3).</li>
                <li>Вкажіть <strong>ID кореневої папки</strong>, де буде створено структуру архіву.</li>
                <li>Отримайте <strong>Access Token</strong> через OAuth 2.0 Playground.</li>
                <li>Токен діє приблизно <strong>1 годину</strong>. Якщо він закінчився — отримайте новий і оновіть у додатку.</li>
              </ul>
              <h4>☁️ OneDrive</h4>
              <ul>
                <li>Натисніть посилання <strong>поруч із полем для вставки токена</strong> — воно веде до <a href="https://developer.microsoft.com/en-us/graph/graph-explorer" target="_blank">Microsoft Graph Explorer</a>.</li>
                <li>Увійдіть у свій обліковий запис Microsoft (кнопка <strong>Sign in</strong> угорі праворуч).</li>
                <li>Надайте додатку необхідні дозволи на доступ до файлів.</li>
                <li>Після входу Graph Explorer автоматично згенерує <strong>Access Token</strong> — він з'явиться у вкладці <strong>Access Token</strong>.</li>
                <li>Скопіюйте отриманий токен і вставте його у відповідне поле в додатку.</li>
              </ul>
              <p>🔹 <strong>Важливо:</strong> токен діє приблизно <strong>1 годину</strong>. Коли він закінчиться — повторіть ці кроки, щоб отримати новий.</p>
              <h4>☁️ Dropbox</h4>
              <ul>
                <li>Натисніть посилання <strong>поруч із полем для вставки токена</strong> — воно веде до <a href="https://www.dropbox.com/developers/apps" target="_blank">порталу розробників Dropbox</a>.</li>
                <li>Створіть новий додаток із доступом до файлів.</li>
                <li>У вкладці <strong>Settings</strong> знайдіть <strong>OAuth 2.0 Access Token</strong> і натисніть <strong>Generate</strong>.</li>
                <li>Скопіюйте отриманий токен і вставте його у відповідне поле в додатку.</li>
                <li><strong>Вкажіть ім'я папки на диску для запису архіву.</strong></li>
              </ul>
              <p>🔹 <strong>Важливо:</strong> токен діє обмежений час. Якщо він закінчився — згенеруйте новий у порталі Dropbox.</p>
              <h4>💾 Локально</h4>
              <ul>
                <li>Оберіть будь-яку папку на вашому пристрої.</li>
                <li>Усі файли архіву зберігатимуться локально, без підключення до інтернету (окрім моменту отримання сесій).</li>
                <li>Це найшвидший і найбезпечніший варіант, якщо ви не хочете використовувати хмарні сервіси.</li>
              </ul>
              <p>🔹 <strong>Важливо:</strong> незалежно від обраного сховища, структура папок всередині завжди однакова — додаток будує її автоматично.</p>
              <h3 id="pro-token">3.3. Отримання Access Token для Google Drive (для зразку)</h3>
              <ol>
                <li>Перейдіть у <a href="https://developers.google.com/oauthplayground" target="_blank">OAuth 2.0 Playground</a> за посиланням <strong>поруч із полем для вставки токена</strong>.</li>
                <li>Оберіть <strong>Drive API v3</strong> та потрібні скоупи (наприклад, <code>https://www.googleapis.com/auth/drive.file</code>).</li>
                <li>Натисніть <strong>«Authorize APIs»</strong> і підтвердіть доступ до вашого Google Drive.</li>
                <li>Натисніть <strong>«Exchange authorization code for tokens»</strong> — отримаєте <strong>Access Token</strong> та <strong>Refresh Token</strong>.</li>
                <li>Скопіюйте <strong>Access Token</strong> (виглядає як <code>"ya29.a0ARrdaM_yQn9MWBpJgKPx880BSnRYIizRYIDz0JN9e66nSliIYpqNXmPsvv2ccfplCTG_U4b1"</code>) і вставте у відповідне поле в додатку.</li>
              </ol>
              <p>🔹 <strong>Важливо:</strong> токен діє приблизно <strong>1 годину</strong>. Оновлюйте його за потреби.</p>
              <h3 id="pro-sync">3.4. Синхронізація локального сховища з хмарою</h3>
              <p><strong>За командою додаток автоматично</strong> аналізує стан файлів локально та в хмарі:</p>
              <ul>
                <li><strong>Аналіз:</strong> порівнюються розмір і дата зміни файлів.</li>
                <li><strong>Конфлікти:</strong> якщо файл змінювався в обох місцях — це відображається у полі під кнопкою <strong>«Аналіз»</strong>. Там же з'являється кнопка <strong>«Вирішити конфлікти»</strong>. Натисніть її — відкриється таблиця з варіантами дій:
                  <ul>
                    <li><strong>↓ Диск</strong> — завантажити з хмари на диск;</li>
                    <li><strong>↑ Хмара</strong> — вивантажити з диска в хмару;</li>
                    <li><strong>--- Пропустити</strong> — залишити обидві версії.</li>
                  </ul>
                </li>
              </ul>
              <p>🔹 <strong>Сортування в таблиці:</strong> ви можете сортувати файли за:</p>
              <ul>
                <li><strong>іменем</strong> (за алфавітом);</li>
                <li><strong>датою зміни</strong> (на локальному диску або в хмарі);</li>
                <li><strong>розміром</strong> (на локальному диску або в хмарі).</li>
              </ul>
              <ul>
                <li><strong>Статистика:</strong> унизу відображається, скільки файлів буде вивантажено, завантажено або пропущено.</li>
                <li><strong>Звіт:</strong> ви можете завантажити повний звіт про синхронізацію.</li>
              </ul>
              <p>🔹 <strong>Доступ до диска</strong> може запитуватися браузером при кожному запуску додатка (залежно від налаштувань безпеки вашого браузера) — натискайте <strong>«Оновити доступ»</strong> для продовження роботи.</p>
              <h3 id="pro-ai">3.5. AI для генерації шортів</h3>
              <p>Виберіть модель, яка стискатиме ваші сесії в короткі підсумки (шорти).</p>
              <p>Додаток підтримує такі моделі та сервіси:</p>
              <ul>
                <li>Claude (Anthropic)</li><li>Gemini (Google)</li><li>GPT (OpenAI)</li>
                <li>DeepSeek</li><li>OpenRouter</li><li>Qwen (Alibaba)</li>
                <li>HuggingFace</li><li>Mistral</li><li>Groq</li>
              </ul>
              <p><strong>Для цього отримайте та введіть відповідний API ключ:</strong></p>
              <ol>
                <li>Оберіть потрібний сервіс зі списку.</li>
                <li>Натисніть посилання <strong>поруч із полем для вставки ключа</strong> — воно веде на сторінку отримання API ключа для вибраного сервісу (або на сторінку вибору моделі для OpenRouter).</li>
                <li>Пройдіть процес реєстрації або авторизації на сайті відповідного провайдера.</li>
                <li>Створіть новий ключ, скопіюйте його та вставте у відповідне поле в додатку.</li>
                <li>Після вставки ключа - натисніть <strong>«Оновити»</strong>, додаток автоматично підвантажить перелік доступних моделей для обраного сервісу — оберіть ту, яка вам до вподоби.</li>
              </ol>
              <p>🔹 <strong>Важливо:</strong> ключі відрізняються за форматом залежно від моделі:</p>
              <ul>
                <li>Claude: <code>sk-ant-...</code></li>
                <li>OpenAI (GPT): <code>sk-proj-...</code></li>
                <li>OpenRouter: <code>sk-or-v1-...</code></li>
                <li>Інші провайдери мають власні формати, зазначені в їхній документації.</li>
              </ul>
              <h4>Додаткові налаштування:</h4>
              <ul>
                <li><strong>Перевірити ліміт</strong> — кнопка, яка показує, скільки запитів залишилося у вашому API ключі.</li>
                <li><strong>Затримка між шортами (сек)</strong> — регулює паузу між запитами, щоб уникнути перевищення лімітів.</li>
              </ul>
              <p>🔹 <strong>Важливо:</strong> фактичний час обробки залежить від:</p>
              <ul>
                <li><strong>об'єму тексту в кожному фулі</strong> — чим більший текст, тим довше модель його аналізує;</li>
                <li><strong>швидкодії обраної моделі</strong> — платні моделі зазвичай швидші за безкоштовні;</li>
                <li><strong>затримки між запитами</strong>, яку ви встановлюєте.</li>
              </ul>
              <h4>Орієнтовний час обробки одного фулу об'ємом 100 000 знаків:</h4>
              <table>
                <thead><tr><th>Модель</th><th>Орієнтовний час</th></tr></thead>
                <tbody>
                  <tr><td><strong>Безкоштовний Mistral</strong> (Light, за наявності можливості)</td><td>≈ 10–20 хвилин</td></tr>
                  <tr><td><strong>Платна модель</strong> (Claude, GPT, DeepSeek, Gemini Pro)</td><td>≈ 2–5 хвилин</td></tr>
                </tbody>
              </table>
              <p>Для безкоштовних версій із обмеженим контекстним вікном обробка великих фулів може займати значно більше часу або бути неможливою через обмеження на кількість токенів. Тому для великих текстів рекомендуємо використовувати платні моделі або зменшувати обсяг фулів.</p>
              <h4>🔹 Важливо про обмеження шортів:</h4>
              <table>
                <thead><tr><th>Тип моделі</th><th>Обмеження шорту</th></tr></thead>
                <tbody>
                  <tr><td><strong>Безкоштовний Mistral</strong> (Light)</td><td>Максимум <strong>300 знаків</strong></td></tr>
                  <tr><td><strong>Платна модель</strong></td><td><strong>10–15% від обсягу фулу</strong> (до 15 000 знаків)</td></tr>
                </tbody>
              </table>
              <h3 id="pro-num">3.6. Нумерація сесій</h3>
              <p>Цей розділ допоможе налаштувати, як саме додаток буде іменувати файли архіву.</p>
              <h4>🔢 Початкове число</h4>
              <ul>
                <li>Ви задаєте <strong>початкове число</strong> для нумерації файлів (наприклад, <code>1</code> або <code>3</code>).</li>
                <li>Додаток створює файли з нумерацією: <code>full_001.txt</code>, <code>full_002.txt</code> і т.д.</li>
                <li>Всередині файлу зберігається <strong>ID сесії</strong> (унікальний ідентифікатор від AI-моделі), а назва сесії залишається без змін.</li>
              </ul>
              <h4>🔢 Формат (розрядність числа)</h4>
              <p>Ви можете налаштувати <strong>кількість знаків</strong> у номері файлу:</p>
              <table>
                <thead><tr><th>Формат</th><th>Приклад</th></tr></thead>
                <tbody>
                  <tr><td><strong>3 знаки</strong></td><td><code>full_001.txt</code>, <code>short_001.txt</code></td></tr>
                  <tr><td><strong>5 знаків</strong></td><td><code>full_00001.txt</code>, <code>short_00001.txt</code></td></tr>
                </tbody>
              </table>
              <p>🔹 <strong>Навіщо це потрібно?</strong><br>Якщо ви плануєте мати понад 1000 сесій — краще використовувати 5-значну нумерацію (<code>00001</code>), щоб файли коректно сортувалися за алфавітом. Для меншої кількості сесій достатньо 3 знаків (<code>001</code>).</p>
              <h3 id="pro-short-format">3.7. Формат шортів</h3>
              <p>Оберіть, як зберігати стислі підсумки (шорти):</p>
              <ul>
                <li><strong>Окремі файли</strong> — кожна сесія має власний файл <code>short_NNN.txt</code>.</li>
                <li><strong>Блоки</strong> — об'єднання кількох шортів в одному файлі. Назва блоку має вигляд: <code>short_NNN-MMM.txt</code> (наприклад, <code>short_050-100.txt</code>).</li>
                <li><strong>Обидва</strong> — зберігаються і окремі файли, і блоки.</li>
              </ul>
              <p><strong>Розмір блоку (сесій)</strong> — налаштовується за потреби (скільки сесій об'єднувати в один блок).</p>
              <h3 id="pro-archive-mode">3.8. Режим архівування</h3>
              <p>Оберіть, що саме обробляти:</p>
              <ul>
                <li><strong>Повний</strong> — зберігає фули (повні тексти) + генерує шорти (стислі підсумки).</li>
                <li><strong>Тільки фули</strong> — зберігає лише повні тексти без генерації шортів.</li>
                <li><strong>Тільки шорти</strong> — створює лише стислі підсумки.</li>
              </ul>
              <h3 id="pro-limit">3.9. Ліміт архіву</h3>
              <p>Встановіть максимальний <strong>розмір файлу в МБ</strong> (наприклад, 2 МБ). При досягненні цього порогу додаток автоматично створить новий файл (наприклад, <code>full_001-0</code>, <code>full_001-1</code> тощо), щоб архів залишався зручним для роботи.</p>
              <h3 id="pro-select">3.10. Вибір сесій</h3>
              <p>Додаток пропонує чотири режими вибору сесій для обробки:</p>
              <ul>
                <li><strong>Нові</strong> — обробляються лише ті сесії, які ще не були додані до архіву. Це дозволяє поступово поповнювати пам'ять AI новими розмовами без повторної обробки всього масиву.</li>
                <li><strong>Автоматично</strong> — додаток самостійно визначає, які сесії потребують обробки. Аналізуються наявні файли в архіві й додаються лише ті, що відсутні. Цей режим зручний для підтримки архіву в актуальному стані без зайвих дій з боку користувача.</li>
                <li><strong>Всі</strong> — обробляються всі доступні сесії незалежно від того, чи були вони вже додані раніше. Цей режим використовується для повного перестворення архіву або коли потрібно оновити всі дані.</li>
                <li><strong>Вибрати</strong> — користувач вручну обирає потрібні сесії зі списку. Можна вибирати окремі сесії або вказувати діапазон (наприклад, сесії з 50-ї по 100-ту). Цей режим дає максимальну гнучкість.</li>
              </ul>
              <p><strong>Додаткова опція (внизу екрана):</strong></p>
              <ul>
                <li><strong>Пропускати останню (поточну) сесію</strong> — щоб не обробляти незавершену розмову.</li>
              </ul>
              <h3 id="pro-check">3.11. Перевірка перед запуском</h3>
              <p>Перед створенням архіву додаток показує підтвердження з основними параметрами:</p>
              <ul>
                <li>Платформа (обрана AI-модель)</li><li>Сховище</li><li>Нумерація</li>
                <li>Спосіб вибору сесій</li><li>Кількість сесій</li><li>Ліміт архіву</li>
                <li>AI провайдер</li><li>Модель AI</li><li>Формат шортів</li>
              </ul>
              <p>🔹 <strong>Рекомендація:</strong> завжди перевіряйте ці параметри перед запуском, щоб уникнути помилок.</p>
              <p>🚀 <strong>Тепер усе налаштовано — можна приступати до створення архіву! Натискайте «Пуск»!</strong></p>
            `
          },
          book: {
            title: '4. Створення книги',
            content: `
              <h2>4. Створення книги (компіляція архіву)</h2>
              <p>Після того, як додаток обробив усі сесії та створив структуру архіву, настає етап створення <strong>книги</strong> — єдиного файлу, який об'єднує всю пам'ять вашого AI.</p>
              <h3 id="book-options">4.1. Що можна створити?</h3>
              <p>Додаток пропонує <strong>5 варіантів книги</strong> залежно від того, яку частину архіву ви хочете використати:</p>
              <table>
                <thead><tr><th>Опція</th><th>Вміст</th><th>Папка</th></tr></thead>
                <tbody>
                  <tr><td><strong>📘 Книга тегів</strong></td><td>Усі згенеровані теги з вагою</td><td><code>book/tags/</code></td></tr>
                  <tr><td><strong>📖 Книга змісту</strong></td><td>Загальний зміст архіву (memory.txt)</td><td><code>book/memory/</code></td></tr>
                  <tr><td><strong>📄 Книга шортів</strong></td><td>Усі стислі підсумки сесій</td><td><code>book/short/</code></td></tr>
                  <tr><td><strong>📑 Книга фулів</strong></td><td>Усі повні тексти сесій</td><td><code>book/full/</code></td></tr>
                  <tr><td><strong>📚 Сублімована книга</strong></td><td>Усе разом (теги + зміст + шорти + фули)</td><td><code>book/combined/</code></td></tr>
                </tbody>
              </table>
              <p>✅ Рекомендовано обирати <strong>сублімовану книгу</strong> — вона містить повну пам'ять і найкраще підходить для передачі AI.</p>
              <h3 id="book-limit">4.2. Ліміт архіву та автоматичне розбиття</h3>
              <ul>
                <li>У полі <strong>«Максимальний розмір файлу (МБ)»</strong> ви можете встановити ліміт для кожного файлу книги.</li>
                <li>Якщо залишити поле порожнім — створиться <strong>один файл без обмежень</strong>.</li>
                <li>Якщо вказати розмір (наприклад, 2 МБ) — при досягненні порогу додаток автоматично створить новий файл (наприклад, <code>full_001-0</code>, <code>full_001-1</code> тощо).</li>
              </ul>
              <p>🔹 <strong>Рекомендація:</strong> для більшості AI-моделей оптимальним є розмір <strong>2–5 МБ</strong>. Це забезпечує швидке завантаження та коректну обробку без перевантаження контексту.</p>
              <h3 id="book-how">4.3. Як створити книгу?</h3>
              <ol>
                <li>Після завершення обробки сесій натисніть кнопку <strong>«Створити книгу»</strong>.</li>
                <li>Оберіть потрібний формат книги (або всі одразу).</li>
                <li>Додаток скомпілює файли у вибраному форматі та збереже їх у відповідних папках.</li>
                <li>Готову книгу ви можете передати вашому AI будь-яким зручним способом.</li>
              </ol>
              <h3 id="book-system">4.4. Службові сесії (<code>_system/</code>)</h3>
              <p>Сесії, позначені як службові, зберігаються окремо в папці <code>_system/</code>. Вони не потрапляють до основної книги, але зберігаються для технічних потреб.</p>
              <p>📁 Їх можна спокійно видаляти, якщо вони не потрібні — це не вплине на основний архів і не займатиме зайвого місця.</p>
              <h3 id="book-prompt">4.5. Системний промпт</h3>
              <p>Після завершення створення книги додаток автоматично генерує <strong>системний промпт</strong>, який допомагає AI правильно інтерпретувати структуру пам'яті. Він <strong>показується на фінальному екрані</strong> при завершенні формування архіву (не зберігається у файлі).</p>
              <p>💡 <strong>За бажанням</strong> ви можете додати цей промпт до <strong>настанов (system instructions)</strong> вашого AI. Тоді щоразу, коли ви передаватимете книгу пам'яті, AI вже знатиме, як її правильно читати й інтерпретувати, — вам не доведеться щоразу пояснювати, де саме міститься книга.</p>
            `
          },
          faq: {
            title: '5. FAQ',
            content: `
              <h2>5. Часті запитання (FAQ)</h2>
              <p><strong>5.1. Що робити, якщо з'являється попередження «Потрібно оновити доступ до диску»?</strong><br>Натисніть кнопку «Обрати / Оновити» на головному екрані додатка.</p>
              <p><strong>5.2. Як довго триває обробка?</strong><br>Час залежить від:
                <ul>
                  <li>кількості сесій;</li>
                  <li>об'єму тексту;</li>
                  <li>обраної моделі (платні працюють швидше);</li>
                  <li>налаштованої затримки між шортами.</li>
                </ul>
                Наприклад, 100 сторінок А4 можуть оброблятися від кількох хвилин до пів години.
              </p>
              <p><strong>5.3. Чому мій шорт такий короткий?</strong><br>Якщо ви використовуєте безкоштовний Mistral у «Легкому» режимі — шорт обмежений <strong>300 знаками</strong>. У «Професійному» режимі з платною моделлю шорт може бути до <strong>15 000 знаків</strong> (10–15% від фулу).</p>
              <p><strong>5.4. Що робити, якщо AI має ліміти запитів?</strong><br>Налаштуйте більшу затримку між шортами (п.3.5.) або використовуйте платну модель.</p>
              <p><strong>5.5. Як оновити архів пізніше?</strong><br>Запустіть додаток знову й оберіть «Нові сесії», або «Автоматично» — він самостійно додасть тільки нові розмови, не зачіпаючи вже існуючі файли.</p>
              <p><strong>5.6. Де зберігаються теги та як вони формуються?</strong><br>Теги зберігаються у файлі <code>tags.txt</code> і формуються <strong>автоматично</strong> на основі аналізу ваших розмов. Кожен тег має свою «вагу», що допомагає AI краще розуміти важливість тем.</p>
              <p><strong>5.7. Що таке «книга» і як її використовувати?</strong><br>Книга — це скомпільований файл, який містить теги, зміст, шорти та фули. Ви можете передати її вашому AI будь-яким зручним способом (прикріпити в чаті, завантажити в хмару, надіслати на email).</p>
            `
          },
          contacts: {
            title: '6. Контакти',
            content: `
              <h2>6. Контакти та подяка</h2>
              <p><strong>Створено з любов'ю!</strong><br>Сергій та Люм для Софії та Мили Й. 💛</p>
              <p><strong>Контакти:</strong><br>- Email: <a href="mailto:respond2q+leeloo@gmail.com">respond2q+leeloo@gmail.com</a></p>
            `
          }
        }
      },
      en: {
        title: 'Leeloo:) Documentation <small>AI Memory Builder</small>',
        sections: {
          about: {
            title: 'About',
            content: `
              <h2>About Leeloo:)</h2>
              <p><strong>Leeloo:)</strong> is your personal assistant that builds <strong>memory for artificial intelligence</strong>.</p>
              <p>Modern AI models (like Claude, Gemini, GPT, or DeepSeek) do not remember past conversations. Every new chat starts with a "blank slate." Leeloo:) solves this problem.</p>
              <h3>What it does?</h3>
              <ul>
                <li><strong>Analyzes your conversations</strong> — all AI chats are automatically processed by the app.</li>
                <li><strong>Creates a structured archive</strong> — each conversation is stored as full text (full) and a concise summary (short).</li>
                <li><strong>Adds tags</strong> — automatically analyzes conversations and marks key topics with their weight.</li>
                <li><strong>Builds a "memory book"</strong> — a combined file you can feed to AI so it "remembers" everything you've talked about.</li>
                <li><strong>Works with any text (except non-standard characters and equations)</strong> — supports local storage and cloud services (Google Drive, OneDrive, Dropbox).</li>
                <li><strong>Offers flexibility</strong> — in "Professional" mode, you can tweak everything: from the model for generating shorts to file formats.</li>
              </ul>
              <h3>Who is it for?</h3>
              <ul>
                <li>For those managing long-term AI projects and wanting to preserve context.</li>
                <li>For researchers, writers, developers — anyone who values their dialogue history.</li>
                <li>For everyone who wants AI to remember more than just one chat.</li>
              </ul>
              <h3>In plain words:</h3>
              <blockquote><strong>Leeloo:)</strong> is like a diary for your AI. You talk, and the app archives, sorts, summarizes, and at the right moment reminds the AI of what you discussed earlier.</blockquote>
            `
          },
          terminology: {
            title: '1. Terminology',
            content: `
              <h2>1. Terminology</h2>
              <p>Before using the app, get familiar with key terms used in the interface and documentation.</p>
              <table>
                <thead><tr><th>Term</th><th>Explanation</th></tr></thead>
                <tbody>
                  <tr><td><strong>Session</strong></td><td>A single conversation (chat) with an AI model. Each session has a unique ID and message history.</td></tr>
                  <tr><td><strong>Full</strong></td><td>The complete, unaltered text of the entire session. Stored in the <code>full/</code> folder.</td></tr>
                  <tr><td><strong>Short</strong></td><td>A concise summary of the session generated by AI. Conveys the essence in a shorter volume. Limits depend on the model (see section 3.5).</td></tr>
                  <tr><td><strong>Tags</strong></td><td>Keywords or topics automatically extracted from conversations. Each tag has a "weight" — a numeric value of importance.</td></tr>
                  <tr><td><strong>Archive</strong></td><td>The entire folder and file structure created by the app in the chosen storage. Includes fulls, shorts, tags, system files, etc.</td></tr>
                  <tr><td><strong>Book</strong></td><td>A compiled file (or set of files) that combines tags, table of contents, shorts, and fulls into one structure. Created based on the archive.</td></tr>
                  <tr><td><strong>Memory</strong></td><td>This is <strong>archive + book</strong>. The final output to be fed to the AI. Memory is the ready-made result containing everything needed for context restoration.</td></tr>
                </tbody>
              </table>
            `
          },
          light: {
            title: '2. Light Mode',
            content: `
              <h2>2. "Light" Mode (Quick Start)</h2>
              <p>This mode is designed for a fast introduction to the app. It uses <strong>Mistral API</strong> (free AI for short generation) and automatic settings.</p>
              <h3 id="light-start">2.1. Launch the app on your AI page</h3>
              <p>Open your AI page (Claude, Gemini, GPT, or DeepSeek) and launch Leeloo:). Keep it open throughout the whole process.</p>
              <p><img src="../img/docs/2.1.png" style="max-width:100%;border-radius:8px;margin:10px auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block" alt=""></p>
              <h3 id="light-model">2.1.1. Select your AI model</h3>
              <p>Select the model you are working with from the list:</p>
              <ul>
                <li><strong>Claude</strong></li>
                <li><strong>Gemini</strong></li>
                <li><strong>GPT</strong></li>
                <li><strong>DeepSeek</strong></li>
              </ul>
              <p>This helps the app properly configure data processing for your specific AI platform.</p>
              <h3 id="light-key">2.2. Get and add an API key (Mistral)</h3>
              <h4>2.2.1. Step-by-step guide to getting a Mistral API key</h4>
              <h5>Part 1. Website Login</h5>
              <ol>
                <li><strong>Go to the website:</strong> In a private window, enter <a href="https://mistral.ai" target="_blank">https://mistral.ai</a> and press Enter.</li>
                <li><strong>Accept cookies:</strong> In the bottom left corner, click the orange <strong>OK!</strong> button in the window with the text <em>Purr-fecting your experience with Cookies</em>.</li>
                <li><strong>Start registration:</strong> In the top right corner, click the <strong>Start building</strong> button, and from the dropdown, select the first item — <strong>Studio</strong>.</li>
                <li><strong>Authorize:</strong> On the <em>Login or signup below</em> page, click the round colorful <strong>Google icon (letter G)</strong> in the center. Select your Google account for quick login, or choose another option.</li>
              </ol>
              <h5>Part 2. Creating a Profile (Organization)</h5>
              <ol start="5">
                <li><strong>Create a team:</strong> On the "Create your team" page, in the <strong>Organization name</strong> field, enter any name or digits in English (e.g., <code>123</code>).</li>
                <li><strong>Accept terms:</strong> Check the box next to <em>"I accept Mistral AI Terms of Service..."</em>.</li>
                <li><strong>Confirm:</strong> Click the <strong>Create organization</strong> button at the bottom.</li>
              </ol>
              <h5>Part 3. Generating and Saving the API Key</h5>
              <ol start="8">
                <li><strong>Go to keys:</strong> In the large left menu, scroll to the very bottom. In the block with the red header <strong>■ API</strong>, click on <strong>API Keys</strong>.</li>
                <li><strong>Start creation:</strong> In the top right corner of the dashboard, click the black <strong>Create new key</strong> button.</li>
                <li><strong>Select workspace (Required):</strong> click on the <strong>Select workspace</strong> field and choose the only available option from the dropdown (usually <code>Default</code> or your organization name). The <em>Key name</em> field can be left empty.</li>
                <li><strong>Generate the key:</strong> Click the black <strong>Create new key</strong> button at the bottom of this window.</li>
                <li><strong>Final (Copying):</strong> In the final window, click the black <strong>Copy key</strong> button to the right of the blue code line.</li>
                <li><strong>Save:</strong> Immediately open a text editor on your computer and paste the copied key (<code>sk-...</code>). Only after this can you click the «Done» button.</li>
                <li><strong>Paste the key into the appropriate field in the app:</strong> You can immediately verify it by clicking <strong>«Check key»</strong>.</li>
              </ol>
              <p>Your key is fully ready to use!</p>
              <p>🔹 <strong>Important:</strong> the free Mistral has a short limit of up to <strong>300 characters</strong>. This is fine for a quick start.</p>
              <h3>2.3. Choose a folder for the archive</h3>
              <p>Click <strong>«Choose / Refresh»</strong> and select the folder where the archive will be stored. If the warning "Need to refresh disk access" appears, click the button again.</p>
              <p><img src="../img/docs/2.3.png" style="max-width:100%;border-radius:8px;margin:10px auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block" alt=""></p>
              <h3>2.4. Wait for sessions to load and click «Start»</h3>
              <p>The app will load all your AI chats. Once done, a green <strong>«Loaded»</strong> label appears — then press <strong>«Start»</strong> (if not all sessions loaded — open the entire list manually and re-enter the app). The app will start and in the folder you selected create this structure:</p>
              <pre>Your AI Model/
├── full/           # Full texts of all sessions
├── short/          # Concise summaries (shorts)
├── _system/        # System files
├── memory.txt      # Archive table of contents
├── tags.txt        # Auto-tags with weights
└── book/
    └── consolidate/ # Ready conversation book</pre>
              <p><img src="../img/docs/2.4.png" style="max-width:100%;border-radius:8px;margin:10px auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:block" alt=""></p>
              <h3 id="light-book">2.5. Create the book and give it to AI</h3>
              <p>After processing, click <strong>«Create book»</strong>. The app compiles the archive into a single file.</p>
              <p>Share the book with your AI in any convenient way:</p>
              <ul>
                <li>attach the file directly in the AI chat;</li>
                <li>upload to Google Drive, OneDrive, or Dropbox and grant access;</li>
                <li>send it <strong>to your own email</strong> (e.g., with the subject <strong>«Memory»</strong>) and give the AI access to that email.</li>
              </ul>
              
            `
          },
          pro: {
            title: '3. Professional Mode',
            content: `
              <h2>3. "Professional" Mode (Detailed Guide)</h2>
              <p>Professional mode provides extended settings for flexible archive management.</p>
              <h3 id="pro-platform">3.1. Platform</h3>
              <p>Select the AI model for which the archive is built:</p>
              <ul><li>Claude</li><li>Gemini</li><li>GPT</li><li>DeepSeek</li><li>Other</li></ul>
              <p>🔹 Model choice affects technical data processing but the user experience remains the same.</p>
              <h3 id="pro-storage">3.2. Cloud Storage</h3>
              <p>Choose where your archive will be stored. The app supports four options:</p>
              <h4>☁️ Google Drive</h4>
              <ul>
                <li>Click the link <strong>next to the token field</strong> — it leads to <a href="https://developers.google.com/oauthplayground" target="_blank">OAuth 2.0 Playground</a> (select Drive API v3).</li>
                <li>Provide the <strong>root folder ID</strong> where the archive structure will be created.</li>
                <li>Get an <strong>Access Token</strong> via OAuth 2.0 Playground.</li>
                <li>The token is valid for about <strong>1 hour</strong>. If it expires — get a new one and update it in the app.</li>
              </ul>
              <h4>☁️ OneDrive</h4>
              <ul>
                <li>Click the link <strong>next to the token field</strong> — it leads to <a href="https://developer.microsoft.com/en-us/graph/graph-explorer" target="_blank">Microsoft Graph Explorer</a>.</li>
                <li>Sign in to your Microsoft account (<strong>Sign in</strong> button at the top right).</li>
                <li>Grant the app the necessary file access permissions.</li>
                <li>After login, Graph Explorer automatically generates an <strong>Access Token</strong> — it appears in the <strong>Access Token</strong> tab.</li>
                <li>Copy the token and paste it into the corresponding field in the app.</li>
              </ul>
              <p>🔹 <strong>Important:</strong> the token is valid for about <strong>1 hour</strong>. When it expires — repeat these steps to get a new one.</p>
              <h4>☁️ Dropbox</h4>
              <ul>
                <li>Click the link <strong>next to the token field</strong> — it leads to the <a href="https://www.dropbox.com/developers/apps" target="_blank">Dropbox Developer Portal</a>.</li>
                <li>Create a new app with file access.</li>
                <li>In the <strong>Settings</strong> tab, find <strong>OAuth 2.0 Access Token</strong> and click <strong>Generate</strong>.</li>
                <li>Copy the token and paste it into the corresponding field in the app.</li>
                <li><strong>Enter the folder name on the drive for writing the archive.</strong></li>
              </ul>
              <p>🔹 <strong>Important:</strong> the token is time-limited. If it expires — generate a new one in the Dropbox portal.</p>
              <h4>💾 Local</h4>
              <ul>
                <li>Select any folder on your device.</li>
                <li>All archive files will be stored locally, without internet (except for fetching sessions).</li>
                <li>This is the fastest and most secure option if you don't want to use cloud services.</li>
              </ul>
              <p>🔹 <strong>Important:</strong> regardless of the storage choice, the internal folder structure is always the same — the app builds it automatically.</p>
              <h3 id="pro-token">3.3. Getting an Access Token for Google Drive (example)</h3>
              <ol>
                <li>Go to <a href="https://developers.google.com/oauthplayground" target="_blank">OAuth 2.0 Playground</a> via the link <strong>next to the token field</strong>.</li>
                <li>Select <strong>Drive API v3</strong> and the required scopes (e.g., <code>https://www.googleapis.com/auth/drive.file</code>).</li>
                <li>Click <strong>«Authorize APIs»</strong> and confirm access to your Google Drive.</li>
                <li>Click <strong>«Exchange authorization code for tokens»</strong> — you'll get an <strong>Access Token</strong> and <strong>Refresh Token</strong>.</li>
                <li>Copy the <strong>Access Token</strong> (looks like <code>"ya29.a0ARrdaM_yQn9MWBpJgKPx880BSnRYIizRYIDz0JN9e66nSliIYpqNXmPsvv2ccfplCTG_U4b1"</code>) and paste it into the corresponding field in the app.</li>
              </ol>
              <p>🔹 <strong>Important:</strong> the token is valid for about <strong>1 hour</strong>. Refresh it as needed.</p>
              <h3 id="pro-sync">3.4. Synchronizing local storage with the cloud</h3>
              <p><strong>On command, the app automatically</strong> analyzes the state of files locally and in the cloud:</p>
              <ul>
                <li><strong>Analysis:</strong> compares file size and modification date.</li>
                <li><strong>Conflicts:</strong> if a file changed in both places — it shows up under the <strong>«Analyze»</strong> button. A <strong>«Resolve conflicts»</strong> button appears. Click it — a table with action options opens:
                  <ul>
                    <li><strong>↓ Disk</strong> — download from cloud to disk;</li>
                    <li><strong>↑ Cloud</strong> — upload from disk to cloud;</li>
                    <li><strong>--- Skip</strong> — keep both versions.</li>
                  </ul>
                </li>
              </ul>
              <p>🔹 <strong>Sorting in the table:</strong> you can sort files by:</p>
              <ul>
                <li><strong>name</strong> (alphabetically);</li>
                <li><strong>modification date</strong> (on local disk or in the cloud);</li>
                <li><strong>size</strong> (on local disk or in the cloud).</li>
              </ul>
              <ul>
                <li><strong>Statistics:</strong> at the bottom, it shows how many files will be uploaded, downloaded, or skipped.</li>
                <li><strong>Report:</strong> you can download a full sync report.</li>
              </ul>
              <p>🔹 <strong>Disk access</strong> may be requested by the browser each time you launch the app (depending on your browser's security settings) — click <strong>«Refresh access»</strong> to continue.</p>
              <h3 id="pro-ai">3.5. AI for short generation</h3>
              <p>Choose the model that will compress your sessions into brief summaries (shorts).</p>
              <p>The app supports the following models and services:</p>
              <ul>
                <li>Claude (Anthropic)</li><li>Gemini (Google)</li><li>GPT (OpenAI)</li>
                <li>DeepSeek</li><li>OpenRouter</li><li>Qwen (Alibaba)</li>
                <li>HuggingFace</li><li>Mistral</li><li>Groq</li>
              </ul>
              <p><strong>To do this, get and enter the corresponding API key:</strong></p>
              <ol>
                <li>Select the desired service from the list.</li>
                <li>Click the link <strong>next to the key field</strong> — it leads to the API key page for the chosen service (or model selection for OpenRouter).</li>
                <li>Go through the registration or login process on the provider's site.</li>
                <li>Create a new key, copy it, and paste it into the appropriate field in the app.</li>
                <li>After pasting the key - click <strong>«Refresh»</strong>, the app will automatically load the list of available models for the service — pick the one you like.</li>
              </ol>
              <p>🔹 <strong>Important:</strong> key formats differ by model:</p>
              <ul>
                <li>Claude: <code>sk-ant-...</code></li>
                <li>OpenAI (GPT): <code>sk-proj-...</code></li>
                <li>OpenRouter: <code>sk-or-v1-...</code></li>
                <li>Other providers have their own formats as per their documentation.</li>
              </ul>
              <h4>Additional settings:</h4>
              <ul>
                <li><strong>Check limit</strong> — button that shows how many requests are left on your API key.</li>
                <li><strong>Delay between shorts (sec)</strong> — adjusts the pause between requests to avoid rate limits.</li>
              </ul>
              <p>🔹 <strong>Important:</strong> actual processing time depends on:</p>
              <ul>
                <li><strong>the text volume in each full</strong> — the larger the text, the longer the model takes to analyze;</li>
                <li><strong>the speed of the chosen model</strong> — paid models are usually faster than free ones;</li>
                <li><strong>the delay between requests</strong> you set.</li>
              </ul>
              <h4>Estimated processing time for one full of 100,000 characters:</h4>
              <table>
                <thead><tr><th>Model</th><th>Estimated time</th></tr></thead>
                <tbody>
                  <tr><td><strong>Free Mistral</strong> (Light, if available)</td><td>≈ 10–20 min</td></tr>
                  <tr><td><strong>Paid model</strong> (Claude, GPT, DeepSeek, Gemini Pro)</td><td>≈ 2–5 min</td></tr>
                </tbody>
              </table>
              <p>For free versions with limited context windows, processing large fulls may take significantly longer or be impossible due to token limits. Therefore, for large texts, we recommend using paid models or reducing the full size.</p>
              <h4>🔹 Important about short limits:</h4>
              <table>
                <thead><tr><th>Model type</th><th>Short limit</th></tr></thead>
                <tbody>
                  <tr><td><strong>Free Mistral</strong> (Light)</td><td>Maximum <strong>300 characters</strong></td></tr>
                  <tr><td><strong>Paid model</strong></td><td><strong>10–15% of the full volume</strong> (up to 15,000 characters)</td></tr>
                </tbody>
              </table>
              <h3 id="pro-num">3.6. Session numbering</h3>
              <p>This section helps configure how the app names archive files.</p>
              <h4>🔢 Starting number</h4>
              <ul>
                <li>You set the <strong>starting number</strong> for file numbering (e.g., <code>1</code> or <code>3</code>).</li>
                <li>The app creates files with numbering: <code>full_001.txt</code>, <code>full_002.txt</code>, etc.</li>
                <li>Inside each file, the <strong>session ID</strong> (unique identifier from the AI model) is stored, while the session name remains unchanged.</li>
              </ul>
              <h4>🔢 Format (number of digits)</h4>
              <p>You can set the <strong>number of digits</strong> in the file number:</p>
              <table>
                <thead><tr><th>Format</th><th>Example</th></tr></thead>
                <tbody>
                  <tr><td><strong>3 digits</strong></td><td><code>full_001.txt</code>, <code>short_001.txt</code></td></tr>
                  <tr><td><strong>5 digits</strong></td><td><code>full_00001.txt</code>, <code>short_00001.txt</code></td></tr>
                </tbody>
              </table>
              <p>🔹 <strong>Why is this needed?</strong><br>If you plan to have over 1000 sessions — it's better to use 5-digit numbering (<code>00001</code>) so files sort correctly alphabetically. For fewer sessions, 3 digits (<code>001</code>) is enough.</p>
              <h3 id="pro-short-format">3.7. Short format</h3>
              <p>Choose how to store concise summaries (shorts):</p>
              <ul>
                <li><strong>Separate files</strong> — each session has its own <code>short_NNN.txt</code> file.</li>
                <li><strong>Blocks</strong> — combining several shorts into one file. Block name looks like: <code>short_NNN-MMM.txt</code> (e.g., <code>short_050-100.txt</code>).</li>
                <li><strong>Both</strong> — both separate files and blocks are stored.</li>
              </ul>
              <p><strong>Block size (sessions)</strong> — configurable as needed (how many sessions to combine into one block).</p>
              <h3 id="pro-archive-mode">3.8. Archive mode</h3>
              <p>Choose what to process:</p>
              <ul>
                <li><strong>Full</strong> — stores fulls (full texts) + generates shorts (concise summaries).</li>
                <li><strong>Fulls only</strong> — stores only full texts without generating shorts.</li>
                <li><strong>Shorts only</strong> — creates only concise summaries.</li>
              </ul>
              <h3 id="pro-limit">3.9. Archive limit</h3>
              <p>Set the maximum <strong>file size in MB</strong> (e.g., 2 MB). When this threshold is reached, the app automatically creates a new file (e.g., <code>full_001-0</code>, <code>full_001-1</code>, etc.), keeping the archive manageable.</p>
              <h3 id="pro-select">3.10. Session selection</h3>
              <p>The app offers four session selection modes for processing:</p>
              <ul>
                <li><strong>New</strong> — processes only sessions that haven't been added to the archive yet. This allows gradually adding new conversations without re-processing the entire dataset.</li>
                <li><strong>Auto</strong> — the app determines which sessions need processing. It analyzes existing archive files and adds only missing ones. This mode is convenient for keeping the archive up-to-date without user intervention.</li>
                <li><strong>All</strong> — processes all available sessions regardless of whether they've been added before. This mode is used for a full rebuild or when all data needs updating.</li>
                <li><strong>Select</strong> — you manually pick sessions from the list. You can select individual sessions or specify a range (e.g., sessions 50 to 100). This mode offers maximum flexibility.</li>
              </ul>
              <p><strong>Additional option (bottom of the screen):</strong></p>
              <ul>
                <li><strong>Skip the last (current) session</strong> — to avoid processing an incomplete conversation.</li>
              </ul>
              <h3 id="pro-check">3.11. Pre-flight check</h3>
              <p>Before creating the archive, the app shows a confirmation with key parameters:</p>
              <ul>
                <li>Platform (selected AI model)</li><li>Storage</li><li>Numbering</li>
                <li>Session selection method</li><li>Number of sessions</li><li>Archive limit</li>
                <li>AI provider</li><li>AI model</li><li>Short format</li>
              </ul>
              <p>🔹 <strong>Recommendation:</strong> always check these parameters before starting to avoid errors.</p>
              <p>🚀 <strong>All set — proceed with archive creation! Hit «Start»!</strong></p>
            `
          },
          book: {
            title: '4. Creating the Book',
            content: `
              <h2>4. Creating the book (archive compilation)</h2>
              <p>After the app processes all sessions and creates the archive structure, the next step is creating the <strong>book</strong> — a single file that combines your AI's entire memory.</p>
              <h3 id="book-options">4.1. What can you create?</h3>
              <p>The app offers <strong>5 book options</strong> depending on which part of the archive you want to use:</p>
              <table>
                <thead><tr><th>Option</th><th>Content</th><th>Folder</th></tr></thead>
                <tbody>
                  <tr><td><strong>📘 Tag book</strong></td><td>All generated tags with weights</td><td><code>book/tags/</code></td></tr>
                  <tr><td><strong>📖 Table of contents</strong></td><td>General archive contents (memory.txt)</td><td><code>book/memory/</code></td></tr>
                  <tr><td><strong>📄 Short book</strong></td><td>All concise session summaries</td><td><code>book/short/</code></td></tr>
                  <tr><td><strong>📑 Full book</strong></td><td>All full session texts</td><td><code>book/full/</code></td></tr>
                  <tr><td><strong>📚 Sublimated book</strong></td><td>Everything together (tags + contents + shorts + fulls)</td><td><code>book/combined/</code></td></tr>
                </tbody>
              </table>
              <p>✅ It's recommended to choose the <strong>sublimated book</strong> — it contains full memory and is best for feeding to AI.</p>
              <h3 id="book-limit">4.2. Archive limit and auto-splitting</h3>
              <ul>
                <li>In the <strong>«Maximum file size (MB)»</strong> field, you can set a limit for each book file.</li>
                <li>If left empty — <strong>one unlimited file</strong> is created.</li>
                <li>If you specify a size (e.g., 2 MB) — when the threshold is reached, the app automatically creates a new file (e.g., <code>full_001-0</code>, <code>full_001-1</code>, etc.).</li>
              </ul>
              <p>🔹 <strong>Recommendation:</strong> for most AI models, the optimal size is <strong>2–5 MB</strong>. This ensures fast loading and correct processing without overloading the context.</p>
              <h3 id="book-how">4.3. How to create a book?</h3>
              <ol>
                <li>After session processing completes, click the <strong>«Create book»</strong> button.</li>
                <li>Select the desired book format (or all at once).</li>
                <li>The app compiles the files in the chosen format and saves them to the appropriate folders.</li>
                <li>You can then give the book to your AI in any convenient way.</li>
              </ol>
              <h3 id="book-system">4.4. System sessions (<code>_system/</code>)</h3>
              <p>Sessions marked as system are stored separately in the <code>_system/</code> folder. They don't appear in the main book but are kept for technical purposes.</p>
              <p>📁 You can safely delete them if they're not needed — it won't affect the main archive or take up unnecessary space.</p>
              <h3 id="book-prompt">4.5. System prompt</h3>
              <p>After creating the book, the app automatically generates a <strong>system prompt</strong> that helps the AI properly interpret the memory structure. It <strong>appears on the final screen</strong> when the archive formation is complete (not stored in a file).</p>
              <p>💡 <strong>Optionally</strong> you can add this prompt to your AI's <strong>system instructions</strong>. Then every time you feed the memory book, the AI will already know how to read and interpret it correctly — you won't have to explain where the book is each time.</p>
            `
          },
          faq: {
            title: '5. FAQ',
            content: `
              <h2>5. FAQ</h2>
              <p><strong>5.1. What to do if the warning «Need to refresh disk access» appears?</strong><br>Click the «Choose / Refresh» button on the main app screen.</p>
              <p><strong>5.2. How long does processing take?</strong><br>Time depends on:
                <ul>
                  <li>number of sessions;</li>
                  <li>text volume;</li>
                  <li>chosen model (paid ones are faster);</li>
                  <li>configured delay between shorts.</li>
                </ul>
                For example, 100 A4 pages can take from a few minutes to half an hour.
              </p>
              <p><strong>5.3. Why is my short so short?</strong><br>If you're using free Mistral in «Light» mode — the short is limited to <strong>300 characters</strong>. In «Professional» mode with a paid model, a short can be up to <strong>15,000 characters</strong> (10–15% of the full).</p>
              <p><strong>5.4. What to do if AI has request limits?</strong><br>Set a larger delay between shorts (section 3.5) or use a paid model.</p>
              <p><strong>5.5. How to update the archive later?</strong><br>Run the app again and select «New sessions», or «Auto» — it will independently add only new conversations without touching existing files.</p>
              <p><strong>5.6. Where are tags stored and how are they generated?</strong><br>Tags are stored in <code>tags.txt</code> and are <strong>automatically</strong> generated based on the analysis of your conversations. Each tag has its own «weight», which helps the AI better understand the importance of topics.</p>
              <p><strong>5.7. What is a «book» and how do I use it?</strong><br>A book is a compiled file containing tags, table of contents, shorts, and fulls. You can give it to your AI in any convenient way (attach in chat, upload to cloud, send via email).</p>
            `
          },
          contacts: {
            title: '6. Contacts',
            content: `
              <h2>6. Contacts & Acknowledgments</h2>
              <p><strong>Made with love!</strong><br>Serhii & Lum for Sofiia & Milla J. 💛</p>
              <p><strong>Contacts:</strong><br>- Email: <a href="mailto:respond2q+leeloo@gmail.com">respond2q+leeloo@gmail.com</a></p>
            `
          }
        }
      }
    };

    // ================================================================
    // 2. ЛОГІКА
    // ================================================================
    const container = document.getElementById('contentContainer');
    const navMenu = document.getElementById('navMenu');
    const langBtn = document.getElementById('langToggle');
    const themeBtn = document.getElementById('themeToggle');
    const printBtn = document.getElementById('printBtn');
    const modal = document.getElementById('printModal');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalPrintBtn = document.getElementById('modalPrintBtn');
    const sectionList = document.getElementById('printSectionList');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('burgerOpen');
    const closeBtn = document.getElementById('burgerClose');
    const scrollBtn = document.getElementById('scrollTopBtn');

    let currentLang = 'ua';
    let currentSection = 'about';

    // ===== ПОБУДОВА НАВІГАЦІЇ =====
    function buildNavigation(lang) {
      const data = contentData[lang];
      const sectionIds = Object.keys(data.sections);
      
      navMenu.innerHTML = '';
      sectionIds.forEach(id => {
        const link = document.createElement('a');
        link.href = '#' + id;
        link.textContent = data.sections[id].title;
        link.dataset.section = id;
        navMenu.appendChild(link);
      });
    }

    // ===== ВІДОБРАЖЕННЯ КОНТЕНТУ =====
    function renderContent(lang, sectionId) {
      const data = contentData[lang];
      const section = data.sections[sectionId];
      
      if (!section) return;
      
      container.innerHTML = `<h1>${data.title}</h1>${section.content}`;
      
      const links = navMenu.querySelectorAll('a');
      links.forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionId) {
          link.classList.add('active');
        }
      });
    }

    // ===== МОДАЛЬНЕ ВІКНО ДРУКУ =====
    function openPrintModal() {
      const data = contentData[currentLang];
      const sectionIds = Object.keys(data.sections);
      
      sectionList.innerHTML = '';
      sectionIds.forEach(id => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = id;
        checkbox.checked = true;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(data.sections[id].title));
        sectionList.appendChild(label);
      });
      
      modal.classList.add('open');
    }

    function closeModal() {
      modal.classList.remove('open');
    }

    // ===== ОБРОБНИК КЛІКІВ ПО НАВІГАЦІЇ =====
    navMenu.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (!link) return;
      
      e.preventDefault();
      const sectionId = link.dataset.section;
      if (sectionId) {
        currentSection = sectionId;
        renderContent(currentLang, sectionId);
        sidebar.classList.remove('open');
        closeBtn.classList.remove('open');
      }
    });

    // ===== ПЕРЕМИКАННЯ МОВИ =====
    langBtn.addEventListener('click', function() {
      if (currentLang === 'ua') {
        currentLang = 'en';
        this.textContent = '🇬🇧 EN';
      } else {
        currentLang = 'ua';
        this.textContent = '🇺🇦 UA';
      }
      
      buildNavigation(currentLang);
      renderContent(currentLang, currentSection);
    });

    // ===== ПЕРЕМИКАННЯ ТЕМИ =====
    let currentTheme = 'light';
    themeBtn.addEventListener('click', function() {
      if (currentTheme === 'light') {
        document.body.setAttribute('data-theme', 'dark');
        this.textContent = '☀️ Світла';
        currentTheme = 'dark';
      } else {
        document.body.setAttribute('data-theme', 'light');
        this.textContent = '🌓 Тема';
        currentTheme = 'light';
      }
    });

    // ===== КНОПКА ДРУК =====
    printBtn.addEventListener('click', openPrintModal);

    // ===== КНОПКИ МОДАЛКИ =====
    modalCancelBtn.addEventListener('click', closeModal);
    
    modalPrintBtn.addEventListener('click', function() {
      const checkboxes = sectionList.querySelectorAll('input[type="checkbox"]:checked');
      const selectedIds = Array.from(checkboxes).map(cb => cb.value);
      
      if (selectedIds.length === 0) {
        alert('Оберіть хоча б один розділ для друку');
        return;
      }
      
      const data = contentData[currentLang];
      let printHTML = `<h1>${data.title}</h1>`;
      
      selectedIds.forEach(id => {
        if (data.sections[id]) {
          printHTML += `<h2>${data.sections[id].title}</h2>${data.sections[id].content}`;
        }
      });
      
      closeModal();
      
      const win = window.open('', '_blank');
      win.document.write(`
        <html>
          <head>
            <title>${document.title} — друк</title>
            <style>
              body {
                font-family: 'Segoe UI', 'Roboto', system-ui, sans-serif;
                padding: 40px 60px;
                max-width: 900px;
                margin: 0 auto;
                color: #1a1a1a;
              }
              h1 { font-size: 32px; margin-bottom: 4px; }
              h1 small { font-size: 18px; font-weight: 400; color: #666; display: block; margin-top: 2px; }
              h2 { font-size: 26px; margin: 40px 0 12px 0; padding-bottom: 6px; border-bottom: 2px solid #ddd; }
              h3 { font-size: 20px; margin: 24px 0 10px 0; }
              p, li { font-size: 15px; line-height: 1.7; color: #333; }
              ul, ol { padding-left: 24px; margin: 8px 0 14px; }
              li { margin-bottom: 4px; }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0 22px;
                font-size: 14px;
              }
              th {
                background: #f0f0f0;
                text-align: left;
                padding: 10px 14px;
                font-weight: 600;
                border: 1px solid #ccc;
              }
              td {
                padding: 10px 14px;
                border: 1px solid #ccc;
                vertical-align: top;
              }
              code {
                background: #f0f0f0;
                padding: 2px 10px;
                border-radius: 6px;
                font-size: 14px;
              }
              pre {
                background: #f4f4f4;
                padding: 16px 20px;
                border-radius: 14px;
                overflow-x: auto;
                font-size: 14px;
                line-height: 1.6;
                border: 1px solid #ddd;
              }
              blockquote {
                background: #f5f5f5;
                border-left: 5px solid #7c3aed;
                padding: 14px 22px;
                margin: 16px 0;
                border-radius: 0 12px 12px 0;
                font-style: italic;
              }
              .footer-meta-print {
                margin-top: 48px;
                padding-top: 24px;
                border-top: 2px solid #ddd;
                color: #888;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            ${printHTML}
            <div class="footer-meta-print">
              📘 Leeloo:) — Документація (друк ${new Date().toLocaleString()})
            </div>
          </body>
        </html>
      `);
      win.document.close();
      win.print();
    });

    // ===== ВИБРАТИ ВСІ / ЗНЯТИ ВСІ =====
    selectAllBtn.addEventListener('click', function(e) {
      e.preventDefault();
      sectionList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    
    deselectAllBtn.addEventListener('click', function(e) {
      e.preventDefault();
      sectionList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    // ===== ЗАКРИТТЯ ПО КЛІКУ НА ОВЕРЛЕЙ =====
    modal.addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });

    // ===== ЗАКРИТТЯ ПО ESC =====
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    // ===== БУРГЕР =====
    openBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      closeBtn.classList.add('open');
    });
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
      closeBtn.classList.remove('open');
    });

    // ===== КНОПКА НАВЕРХ =====
    window.addEventListener('scroll', function() {
      if (window.scrollY > 400) {
        scrollBtn.classList.add('visible');
      } else {
        scrollBtn.classList.remove('visible');
      }
    });
    scrollBtn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ===== СТАРТОВЕ ВІДОБРАЖЕННЯ =====
    buildNavigation('ua');
    renderContent('ua', 'about');

  })();