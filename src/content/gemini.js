// Content script — gemini.google.com

(function () {
  'use strict';

  // ── Відкрити sidebar якщо сесій не видно ────────────────────────────────
  async function ensureSidebarOpen() {
    if (document.querySelectorAll('a[href*="/app/"]').length > 0) return;
    const toggleBtn =
      document.querySelector('[aria-label="Відкрити бічну панель"]') ||
      document.querySelector('[aria-label="Open sidebar"]') ||
      document.querySelector('[aria-label*="Головне мен"]');
    if (toggleBtn) {
      toggleBtn.click();
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // ── Витяг сирих sessionId з DOM у поточному порядку (нові зверху) ───────
  function extractRawIds() {
    const ids = [];
    document.querySelectorAll('a[href*="/app/"]').forEach((el) => {
      const href = el.getAttribute('href') || '';
      const rawId = (href.split('/app/')[1] || '').split('?')[0].split('#')[0];
      if (rawId && rawId.length >= 8 && /^[0-9a-f_]+$/i.test(rawId)) ids.push(rawId);
    });
    return ids;
  }

  // ── Скролінг sidebar до кінця щоб завантажити всі сесії ─────────────────
  // knownIds/K (опційно) — "швидка зупинка": якщо в DOM-порядку (нові зверху,
  // старіші довантажуються в кінець) останні K сесій підряд вже відомі
  // (є в knownIds — sessionId з session_meta.json), далі скролити немає сенсу:
  // усе, що глибше, теж уже заархівоване. Дефолтна поведінка (без knownIds)
  // не змінюється — чекаємо повної стабілізації, як і раніше.
  // Лічильник поколінь: кожен новий виклик __mbLoadAllSessions "перехоплює"
  // керування у попереднього ще не завершеного циклу (наприклад, автозапуск
  // без knownIds vs. ручний fastScan-виклик з knownIds/K) — старий цикл
  // тихо завершується на наступній ітерації замість того, щоб скролити
  // паралельно з новим.
  if (typeof window.__mbLoadGen !== 'number') window.__mbLoadGen = 0;

  window.__mbLoadAllSessions = function (knownIds, K) {
    const myGen = ++window.__mbLoadGen;
    const knownSet = (knownIds && knownIds.length) ? new Set(knownIds) : null;
    return new Promise(async (resolve) => {
      await ensureSidebarOpen();

      // Шукаємо scrollable контейнер sidebar
      let sidebar =
        document.querySelector('infinite-scroller') ||
        document.querySelector('mat-sidenav .conversations-container') ||
        document.querySelector('mat-sidenav') ||
        document.querySelector('[class*="conversation-list"]') ||
        document.querySelector('nav');

      if (!sidebar) {
        resolve();
        return;
      }

      let lastCount = 0;
      let stableFor = 0;
      const MAX_ATTEMPTS = 200;
      let attempts = 0;

      function scrollAndCheck() {
        if (myGen !== window.__mbLoadGen) {
          console.log('[MB] Gemini: цикл скролу перехоплено новим викликом — виходжу');
          resolve();
          return;
        }
        attempts++;
        // Скролимо sidebar до низу щоб підвантажити старіші сесії
        sidebar.scrollTop = sidebar.scrollHeight;

        const count = document.querySelectorAll('a[href*="/app/"]').length;
        if (count === lastCount) {
          stableFor++;
        } else {
          stableFor = 0;
          lastCount = count;
        }

        console.log(`[MB] Gemini sidebar scroll: ${count} сесій, стабільно: ${stableFor}`);

        if (knownSet && K && count >= K) {
          const ids = extractRawIds();
          const tail = ids.slice(-K); // найстаріші з поки завантажених (кінець DOM-списку)
          if (tail.length === K && tail.every((id) => knownSet.has(id))) {
            console.log(`[MB] Gemini: швидка зупинка — останні ${K} сесій вже відомі`);
            resolve();
            return;
          }
        }

        const atBottom = sidebar.scrollTop + sidebar.clientHeight >= sidebar.scrollHeight - 10;
        if ((stableFor >= 10 && atBottom) || attempts >= MAX_ATTEMPTS) {
          console.log(`[MB] Gemini: завантажено ${count} сесій (atBottom: ${atBottom})`);
          resolve();
        } else {
          setTimeout(scrollAndCheck, 500);
        }
      }

      setTimeout(scrollAndCheck, 300);
    });
  };

  window.__mbGetSessions = async function (knownIds, K) {
    // Спочатку завантажуємо сесії через скролінг (knownIds/K вмикають швидку зупинку, якщо передані)
    await window.__mbLoadAllSessions(knownIds, K);

    const sessions = [];
    const seen = new Set();
    const items = document.querySelectorAll('a[href*="/app/"]');

    items.forEach((el) => {
      const href = el.getAttribute('href') || '';
      const rawId = (href.split('/app/')[1] || '').split('?')[0].split('#')[0];
      if (!rawId || rawId.length < 8 || !/^[0-9a-f_]+$/i.test(rawId)) return;
      if (seen.has(rawId)) return;
      seen.add(rawId);
      const title = el.textContent?.trim() || rawId;
      sessions.push({ id: rawId, title, content: '' });
    });

    // DOM порядок: нові зверху → реверс щоб індекс 1 = найстаріша
    sessions.reverse();
    sessions.forEach((s, i) => { s.index = i + 1; });

    console.log(`[MB] Gemini: зібрано ${sessions.length} сесій`);
    return sessions;
  };

  // ── Скролимо вгору і чекаємо поки DOM завантажить всі повідомлення ──────
  window.__mbScrollToTopAndWait = function () {
    return new Promise((resolve) => {
      const scrollable =
        document.querySelector('chat-window') ||
        document.querySelector('[class*="conversation"]') ||
        document.querySelector('main') ||
        document.documentElement;

      let lastCount = 0;
      let stableFor = 0;

      function scrollAndCheck() {
        scrollable.scrollTop = 0;
        window.scrollTo(0, 0);

        const count = document.querySelectorAll('user-query, model-response').length;
        if (count === lastCount) {
          stableFor++;
        } else {
          stableFor = 0;
          lastCount = count;
        }

        if (stableFor >= 3) {
          resolve(count);
        } else {
          setTimeout(scrollAndCheck, 600);
        }
      }

      setTimeout(scrollAndCheck, 300);
    });
  };

  // ══ Збір вмісту сесії ═════════════════════════════════════════════════════
  // Раніше: один знімок DOM (`user-query, model-response`) після скролу вгору.
  // Якщо Gemini не тримає весь чат у DOM одночасно (віртуалізація / ліниве
  // рендерення), у знімок потрапляє лише те, що зараз відрендерено, а решта
  // (зазвичай середина) тихо випадає.
  // Тепер: проходимо чат зверху вниз кроками, на кожному кроці читаємо те, що
  // є в DOM, і зливаємо з уже зібраним за перекриттям (без дублікатів).
  // Порожні заглушки не пропускаємо одразу — даємо час дорендеритись.
  const MB_STEP_WAIT = 350;      // мс після кожного кроку скролу
  const MB_MAX_STEPS = 800;      // запобіжник від нескінченного циклу
  const MB_TIME_LIMIT = 120000;  // мс, максимум на один прохід
  const MB_EMPTY_RETRY_BUDGET = 30; // скільки разів усього чекати на заглушки

  const mbSleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Службові підписи, які Gemini кладе в DOM перед текстом репліки.
  // (Англійський підпис відповіді Gemini не додаю: не бачив його, щоб не вгадувати.)
  // Підпис користувача може стояти не на самому початку: перед ним іде рядок
  // із назвою прикріпленого файлу — тому шукаємо його на початку рядка.
  const MB_USER_PREFIX = /(^|\n)(?:Ваше повідомлення|Your message)[ \t]*/i;
  const MB_MODEL_PREFIX = /^Повідомлення Gemini\s*/i;

  // Gemini кладе текст користувача в DOM двічі. Три відомі варіанти:
  //  1) точний дубль:            «X\n\nX»            → лишаємо X
  //  2) згорнутий прев'ю + повний: «Початок…\n\nПовний» → лишаємо повний
  //  3) назва вкладення + дубль:  «файл\nX\n\nX»      → лишаємо «файл\nX»
  function mbCollapseDouble(text) {
    const N = (t) => t.replace(/\s+/g, ' ').trim();
    const ELL = /(…|\.\.\.)$/;
    const parts = text.split(/\n\s*\n/);
    for (let k = 1; k < parts.length; k++) {
      const aRaw = parts.slice(0, k).join('\n\n').trim();
      const bRaw = parts.slice(k).join('\n\n').trim();
      const a = N(aRaw), b = N(bRaw);
      if (!a || !b) continue;
      if (a === b) return aRaw;
      if (b.length >= 12 && a.endsWith(b)) return aRaw;
      if (ELL.test(a) && b.startsWith(N(a.replace(ELL, '')))) return bRaw;
    }
    return text;
  }

  // Текст однієї репліки
  function mbExtractMessage(el) {
    const isUser = el.tagName.toLowerCase() === 'user-query';
    const role = isUser ? 'User' : 'Gemini';
    let text = '';
    if (isUser) {
      const queryEl = el.querySelector('.query-text, p, [class*="query"]');
      text = queryEl?.innerText?.trim() || el.innerText?.trim() || '';
      text = text.replace(MB_USER_PREFIX, '$1').trim();
      text = mbCollapseDouble(text);
    } else {
      text = el.innerText?.trim() || '';
      text = text.replace(MB_MODEL_PREFIX, '').trim();
    }
    // sig — короткий підпис для склеювання вікон (початок тексту достатній)
    return { role, text, sig: role + '|' + text.slice(0, 80) };
  }

  // Скрол-контейнер чату = найближчий прокручуваний предок повідомлення
  // (document.querySelector('infinite-scroller') міг би влучити в сайдбар).
  function mbFindScrollParent(el) {
    let p = el ? el.parentElement : null;
    while (p && p !== document.body && p !== document.documentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight + 20) return p;
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  // Читає поточне вікно DOM; порожні заглушки перечитує (з бюджетом)
  async function mbReadWindow(stats) {
    let msgs = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      msgs = Array.from(document.querySelectorAll('user-query, model-response')).map(mbExtractMessage);
      const empty = msgs.filter(m => !m.text).length;
      if (!empty) return { msgs, domCount: msgs.length };
      if (attempt < 3 && stats.emptyRetries < MB_EMPTY_RETRY_BUDGET) {
        stats.emptyRetries++;
        await mbSleep(400);
      } else {
        break;
      }
    }
    // Залишаємо порожні як плейсхолдери: так порядок реплік не зсувається,
    // а при склеюванні вікон вони «підхоплять» текст із сусіднього вікна.
    stats.emptySeen += msgs.filter(m => !m.text).length;
    return { msgs, domCount: msgs.length };
  }

  // Зливає вікно W у накопичений список A за перекриттям (суфікс A = префікс W).
  // Повертає false, якщо перекриття немає (можливий розрив між вікнами).
  // Порожній плейсхолдер (ще не відрендерена репліка) збігається з будь-якою
  // реплікою тієї ж ролі.
  function mbSame(a, b) {
    return a.role === b.role && (!a.text || !b.text || a.sig === b.sig);
  }

  function mbMergeWindow(A, W) {
    if (!W.length) return true;
    if (!A.length) { A.push(...W); return true; }
    const maxK = Math.min(A.length, W.length);
    for (let k = maxK; k >= 1; k--) {
      let ok = true;
      for (let j = 0; j < k; j++) {
        if (!mbSame(A[A.length - k + j], W[j])) { ok = false; break; }
      }
      if (ok) {
        // якщо репліка була підвантажена не до кінця — беремо довшу версію
        for (let j = 0; j < k; j++) {
          const idx = A.length - k + j;
          if (W[j].text.length > A[idx].text.length) A[idx] = W[j];
        }
        A.push(...W.slice(k));
        return true;
      }
    }
    A.push(...W);
    return false;
  }

  window.__mbGetSessionContent = async function () {
    const stats = { steps: 0, maxDom: 0, emptyRetries: 0, emptySeen: 0, emptyLeft: 0, gaps: 0, stuck: false, timeout: false };
    const t0 = Date.now();
    try {
      // Чекаємо появи хоча б однієї репліки
      let first = document.querySelector('user-query, model-response');
      for (let i = 0; i < 10 && !first; i++) {
        await mbSleep(300);
        first = document.querySelector('user-query, model-response');
      }
      if (!first) return '';

      const scroller = mbFindScrollParent(first);

      // Заспокоюємо верх: скролимо до 0, поки кількість реплік не стабілізується
      let lastCount = -1, stable = 0;
      for (let i = 0; i < 12 && stable < 2; i++) {
        scroller.scrollTop = 0;
        await mbSleep(500);
        const c = document.querySelectorAll('user-query, model-response').length;
        if (c === lastCount) stable++; else { stable = 0; lastCount = c; }
      }

      // Прохід зверху вниз
      const acc = [];
      let best = [];
      let stuckCount = 0;
      for (let step = 0; step < MB_MAX_STEPS; step++) {
        stats.steps++;
        const { msgs, domCount } = await mbReadWindow(stats);
        stats.maxDom = Math.max(stats.maxDom, domCount);
        if (msgs.length > best.length) best = msgs;
        if (!mbMergeWindow(acc, msgs)) stats.gaps++;

        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5;
        if (atBottom) break;
        if (Date.now() - t0 > MB_TIME_LIMIT) { stats.timeout = true; break; }

        const before = scroller.scrollTop;
        scroller.scrollTop = before + Math.max(200, Math.floor(scroller.clientHeight * 0.6));
        await mbSleep(MB_STEP_WAIT);
        if (scroller.scrollTop === before) {
          if (++stuckCount >= 3) { stats.stuck = true; break; }
        } else {
          stuckCount = 0;
        }
      }

      // Запобіжник: зібране не має бути меншим за найповніше одиночне вікно
      const chosen = acc.length >= best.length ? acc : best;
      // Якщо репліка так і лишилась без тексту (типово — відповідь ТІЛЬКИ
      // зображенням/кодом без підпису, innerText такого не бачить), не
      // відкидаємо її мовчки — це та сама пастка, що була в claude.js з
      // tool-кроками: випадання ролі зсуває чергування і контролька
      // цілісності в service-worker.js хибно читає це як втрачену репліку.
      // Лишаємо плейсхолдер замість тексту.
      const EMPTY_PLACEHOLDER = {
        User: '[без тексту — можливо, лише вкладення без підпису]',
        Gemini: '[без тексту — можливо, зображення, код чи інший непідтримуваний контент]',
      };
      const final = chosen.map(m => m.text ? m : { ...m, text: EMPTY_PLACEHOLDER[m.role] || '[без тексту]' });
      stats.emptyLeft = chosen.length - chosen.filter(m => m.text).length;

      console.log(
        `[MB] Gemini: збір вмісту — кроків ${stats.steps}, макс. у DOM ${stats.maxDom}, ` +
        `зібрано реплік ${final.length}, перечитувань порожніх ${stats.emptyRetries}, ` +
        `порожніх так і лишилось ${stats.emptyLeft}, розривів ${stats.gaps}` +
        (stats.stuck ? ', СКРОЛ ЗАСТРЯГ' : '') + (stats.timeout ? ', ТАЙМАУТ' : '')
      );
      if (stats.gaps > 0) {
        console.warn(`[MB] Gemini: ${stats.gaps} розрив(ів) між вікнами — між кроками могли випасти репліки`);
      }

      return final.map(m => `[${m.role}]\n${m.text}`).join('\n\n---\n\n');
    } catch (e) {
      console.warn('[MB] Gemini: помилка збору вмісту:', e.message);
      return '';
    }
  };

  window.addEventListener('mb:system-prompt', (e) => {
    const prompt = e.detail;
    if (!prompt) return;
    sessionStorage.setItem('mb_system_prompt', prompt);

    if (!window.__mbFetchPatched) {
      window.__mbFetchPatched = true;
      const origFetch = window.fetch;

      window.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;

        if (url.includes('generativelanguage') && init.method === 'POST' && init.body) {
          try {
            const body = JSON.parse(init.body);
            const stored = sessionStorage.getItem('mb_system_prompt');

            if (stored && body.contents) {
              body.systemInstruction = {
                parts: [{ text: (body.systemInstruction?.parts?.[0]?.text || '') + '\n\n' + stored }]
              };
              init = { ...init, body: JSON.stringify(body) };
            }
          } catch (_) {}
        }

        return origFetch.call(this, input, init);
      };
    }
  });

  // ── Статус пресканування ─────────────────────────────────────────────────
  if (!window.__mbLoadDone) window.__mbLoadDone = false;

  window.__mbPrefetchStatus = function () {
    const count = document.querySelectorAll('a[href*="/app/"]').length;
    return { ready: window.__mbLoadDone, total: count, loaded: count };
  };

  // ── Автозапуск при завантаженні ───────────────────────────────────────────
  // Захист від паралельних запусків, але не від повторних після завершення
  if (!window.__mbLoadInProgress) {
    window.__mbLoadInProgress = true;
    setTimeout(async () => {
      window.__mbLoadDone = false;
      await window.__mbLoadAllSessions();
      window.__mbLoadDone = true;
      window.__mbLoadInProgress = false;
    }, 300);
  }

  chrome.runtime.sendMessage({ type: 'CONTENT_READY', platform: 'gemini' });

})();
