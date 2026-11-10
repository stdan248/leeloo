// Content script — chatgpt.com

(function () {
  'use strict';

  // ── Кеш дат сесій ────────────────────────────────────────────────────────
  if (!window.__mbSessionDates) window.__mbSessionDates = {};
  const __mbSessionDates = window.__mbSessionDates;

  // ── Читаємо дати з localStorage ─────────────────────────────────────────
  function loadDatesFromLocalStorage() {
    try {
      const key = Object.keys(localStorage).find(k => k.includes('conversation-history'));
      if (!key) return;
      const data = JSON.parse(localStorage.getItem(key));
      const items = data?.value?.pages?.flatMap(p => p.items) || [];
      items.forEach(x => {
        if (x.id && x.create_time) {
          const t = x.create_time;
          const d = typeof t === 'number' && t < 1e12
            ? new Date(t * 1000)   // unix seconds
            : new Date(t);         // ms або рядок
          if (!isNaN(d)) __mbSessionDates[x.id] = d.toISOString();
        }
      });
      console.log(`[MB] GPT: завантажено ${items.length} дат з localStorage`);
    } catch (e) {
      console.warn('[MB] GPT localStorage помилка:', e);
    }
  }
  loadDatesFromLocalStorage();

  // ── Посилання на чати в бічній панелі ─────────────────────────────────────
  // Спершу відомі селектори (#history, data-sidebar-item). Якщо ChatGPT змінив верстку і вони нічого
  // не знаходять (так було 08.11.2026: «порожній список сесій» при 20 посиланнях у панелі) —
  // беремо будь-які посилання /c/<id> поза повідомленнями розмови.
  function mbChatLinks() {
    const known = document.querySelectorAll('#history a[href*="/c/"], a[data-sidebar-item="true"][href*="/c/"]');
    if (known.length) return Array.from(known);
    return Array.from(document.querySelectorAll('a[href*="/c/"]')).filter(a => {
      const href = a.getAttribute('href') || '';
      return /\/c\/[0-9A-Za-z-]{8,}/.test(href) && !a.closest('[data-message-author-role], [data-turn-key], main article');
    });
  }

  // Контейнер списку, що прокручується (щоб підвантажити решту сесій)
  function mbSidebarScroller(links) {
    const hist = document.querySelector('#history');
    if (hist) return hist;
    let el = links[0] && links[0].parentElement;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 20) return el;
      el = el.parentElement;
    }
    return links[0] ? (links[0].closest('nav, aside') || null) : null;
  }

  if (!window.__mbLoadDone) window.__mbLoadDone = false;
  if (!window.__mbLoadedCount) window.__mbLoadedCount = 0;

  window.__mbPrefetchStatus = function () {
    const domCount = mbChatLinks().length;
    const count = Math.max(domCount, window.__mbLoadedCount);
    return { ready: window.__mbLoadDone, total: count, loaded: count };
  };

  const _origFetch = window.fetch;

  // ── Скролінг sidebar до кінця щоб завантажити всі сесії ─────────────────
  // Лічильник поколінь: новий виклик __mbLoadAllSessions перехоплює
  // керування у попереднього ще не завершеного циклу (автозапуск vs
  // ручний виклик з popup/SW) — старий цикл тихо завершується замість
  // паралельного скролу того самого sidebar.
  if (typeof window.__mbLoadGen !== 'number') window.__mbLoadGen = 0;

  window.__mbLoadAllSessions = function () {
    const myGen = ++window.__mbLoadGen;
    return new Promise((resolve) => {

      function startScroll() {
        const sidebar = mbSidebarScroller(mbChatLinks());
        if (!sidebar) { resolve(); return; }

        let lastCount = 0;
        let stableFor = 0;
        const MAX_ATTEMPTS = 100;
        let attempts = 0;

        function scrollAndCheck() {
          if (myGen !== window.__mbLoadGen) {
            console.log('[MB] GPT: цикл скролу перехоплено новим викликом — виходжу');
            resolve();
            return;
          }
          attempts++;
          const lastItem = sidebar.querySelector('li:last-child') || mbChatLinks().slice(-1)[0];
          if (lastItem) lastItem.scrollIntoView();

          const count = mbChatLinks().length;
          if (count === lastCount) {
            stableFor++;
          } else {
            stableFor = 0;
            lastCount = count;
          }

          console.log(`[MB] GPT sidebar scroll: ${count} сесій, стабільно: ${stableFor}`);

          if (stableFor >= 5 || attempts >= MAX_ATTEMPTS) {
            window.__mbLoadedCount = count;
            console.log(`[MB] GPT: завантажено ${count} сесій`);
            resolve();
          } else {
            setTimeout(scrollAndCheck, 1200);
          }
        }

        setTimeout(scrollAndCheck, 500);
      }

      // Якщо #history вже є — одразу
      if (document.querySelector('#history') || mbChatLinks().length) {
        startScroll();
        return;
      }

      // Інакше — клікаємо кнопку і чекаємо через MutationObserver
      const openBtn = document.querySelector('[data-testid="open-sidebar-button"]')
        || document.querySelector('button[aria-label*="idebar"], button[aria-label*="бічн"]');
      if (openBtn) openBtn.click();

      const observer = new MutationObserver(() => {
        if (document.querySelector('#history') || mbChatLinks().length) {
          observer.disconnect();
          setTimeout(startScroll, 200);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Таймаут на випадок якщо кнопки немає
      setTimeout(() => {
        observer.disconnect();
        startScroll();
      }, 5000);
    });
  };

  window.__mbGetSessions = async function () {
    await window.__mbLoadAllSessions();

    const sessions = [];
    const seen = new Set();
    const items = mbChatLinks();

    items.forEach((el) => {
      const href = el.getAttribute('href') || '';
      const id = href.match(/\/c\/([^/?#]+)/)?.[1];
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = el.querySelector('div, span')?.textContent?.trim()
        || el.textContent?.trim()
        || id;
      sessions.push({ id, title, href, createdAt: __mbSessionDates[id] || null });
    });

    // Додаємо сесії з кешу яких немає в DOM
    Object.keys(__mbSessionDates).forEach(id => {
      if (!seen.has(id)) {
        sessions.push({ id, title: id, href: `/c/${id}`, createdAt: __mbSessionDates[id] });
      }
    });

    // Сортуємо: з датою від старої до нової, без дати — реверс DOM (старіші в кінці DOM = на початку після реверсу)
    const withDate = sessions.filter(s => s.createdAt);
    const withoutDate = sessions.filter(s => !s.createdAt);
    withDate.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    withoutDate.reverse();
    const sorted = [...withDate, ...withoutDate];
    sorted.forEach((s, i) => { s.index = i + 1; });

    console.log(`[MB] GPT: ${sorted.length} сесій (${withDate.length} з датою, ${withoutDate.length} без)`);
    return sorted;
  };

  // ══ Збір вмісту сесії ═════════════════════════════════════════════════════
  // ChatGPT (chatgpt.com) тепер теж має "native virtualized list" для основної
  // стрічки розмови (не лише для бічної панелі сесій): у довгих чатах старі
  // репліки не існують у DOM, поки до них не прокрутити. Раніше тут був
  // один одноразовий знімок DOM без жодного скролу — у довгих сесіях він ловив
  // лише поточне вікно перегляду. Тепер, як і в gemini.js, проходимо чат
  // кроками зверху вниз і склеюємо вікна за перекриттям.
  const MB_STEP_WAIT = 350;
  const MB_MAX_STEPS = 800;
  const MB_TIME_LIMIT = 120000;
  const MB_EMPTY_RETRY_BUDGET = 30;
  const MB_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';
  // Нова верстка (помічено 09.11.2026): атрибута data-message-author-role більше немає. Кожне повідомлення
  // тепер у блоці, що іде ОДРАЗУ ПІСЛЯ прихованого заголовка h4[data-conversation-role="user|assistant"]
  // (для користувача — div.group/user-message з бульбашкою [data-user-message-bubble], для відповіді —
  // div із розміткою markdown). Службові частини (кнопки дій) лежать поза цими блоками.
  const MB_HEADING = 'h4[data-conversation-role]';

  // Вузли повідомлень: спершу старий селектор, якщо його немає — заголовки нової верстки
  function mbMessageNodes() {
    const old = document.querySelectorAll(MB_SELECTOR);
    if (old.length) return Array.from(old);
    return Array.from(document.querySelectorAll(MB_HEADING));
  }

  const mbSleep = (ms) => new Promise(r => setTimeout(r, ms));

  function mbExtractMessage(el) {
    if (el.matches && el.matches(MB_HEADING)) {
      const role = el.getAttribute('data-conversation-role') === 'user' ? 'User' : 'ChatGPT';
      const block = el.nextElementSibling;
      // бульбашка користувача без ряду кнопок; innerText зберігає абзаци й рядки коду
      const src = block ? (block.querySelector('[data-user-message-bubble="true"]') || block) : null;
      const text = src ? ((src.innerText || src.textContent || '').trim()) : '';
      return { role, text, sig: role + '|' + text.slice(0, 80) };
    }
    const role = el.dataset.messageAuthorRole === 'user' ? 'User' : 'ChatGPT';
    const text = el.textContent?.trim() || '';
    return { role, text, sig: role + '|' + text.slice(0, 80) };
  }

  // Дата розмови: у новій верстці вона в розділювачі туру — div[role="separator"] > time[datetime].
  // Збираємо дати з усіх вікон прокрутки; найраніша = початок розмови (перший тур може бути поза DOM
  // через віртуалізацію, тому одного вікна замало).
  let mbSeenDates = [];
  function mbCollectDates() {
    document.querySelectorAll('div[role="separator"] time[datetime]').forEach(t => {
      const ms = Date.parse(t.getAttribute('datetime'));
      if (!isNaN(ms)) mbSeenDates.push(ms);
    });
  }
  window.__mbGetCreatedAt = function () {
    return mbSeenDates.length ? new Date(Math.min(...mbSeenDates)).toISOString() : null;
  };

  function mbFindScrollParent(el) {
    let p = el ? el.parentElement : null;
    while (p && p !== document.body && p !== document.documentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight + 20) return p;
      p = p.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function mbReadWindow(stats) {
    let msgs = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      msgs = mbMessageNodes().map(mbExtractMessage);
      const empty = msgs.filter(m => !m.text).length;
      if (!empty) return { msgs, domCount: msgs.length };
      if (attempt < 3 && stats.emptyRetries < MB_EMPTY_RETRY_BUDGET) {
        stats.emptyRetries++;
        await mbSleep(400);
      } else {
        break;
      }
    }
    stats.emptySeen += msgs.filter(m => !m.text).length;
    return { msgs, domCount: msgs.length };
  }

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
    mbSeenDates = [];
    const t0 = Date.now();
    try {
      let first = mbMessageNodes()[0];
      for (let i = 0; i < 10 && !first; i++) {
        await mbSleep(300);
        first = mbMessageNodes()[0];
      }
      if (!first) return '';

      const scroller = mbFindScrollParent(first);

      let lastCount = -1, stable = 0;
      for (let i = 0; i < 12 && stable < 2; i++) {
        scroller.scrollTop = 0;
        await mbSleep(500);
        const c = mbMessageNodes().length;
        if (c === lastCount) stable++; else { stable = 0; lastCount = c; }
      }

      const acc = [];
      let best = [];
      let stuckCount = 0;
      for (let step = 0; step < MB_MAX_STEPS; step++) {
        stats.steps++;
        const { msgs, domCount } = await mbReadWindow(stats);
        mbCollectDates();
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

      const chosen = acc.length >= best.length ? acc : best;
      // Якщо репліка так і лишилась без тексту (наприклад, Canvas/інструмент,
      // який не рендериться в основному потоці тексту), не відкидаємо її
      // мовчки — лишаємо плейсхолдер, щоб чергування ролей не ламалось і
      // контролька цілісності в service-worker.js не давала хибну тривогу.
      const EMPTY_PLACEHOLDER = {
        User: '[без тексту — можливо, лише вкладення без підпису]',
        ChatGPT: '[без тексту — можливо, Canvas, зображення чи інший непідтримуваний контент]',
      };
      const final = chosen.map(m => m.text ? m : { ...m, text: EMPTY_PLACEHOLDER[m.role] || '[без тексту]' });
      stats.emptyLeft = chosen.length - chosen.filter(m => m.text).length;

      console.log(
        `[MB] GPT: збір вмісту — кроків ${stats.steps}, макс. у DOM ${stats.maxDom}, ` +
        `зібрано реплік ${final.length}, перечитувань порожніх ${stats.emptyRetries}, ` +
        `порожніх так і лишилось ${stats.emptyLeft}, розривів ${stats.gaps}` +
        (stats.stuck ? ', СКРОЛ ЗАСТРЯГ' : '') + (stats.timeout ? ', ТАЙМАУТ' : '')
      );
      if (stats.gaps > 0) {
        console.warn(`[MB] GPT: ${stats.gaps} розрив(ів) між вікнами — між кроками могли випасти репліки`);
      }

      return final.map(m => `[${m.role}]\n${m.text}`).join('\n\n---\n\n');
    } catch (e) {
      console.warn('[MB] GPT: помилка збору вмісту:', e.message);
      return '';
    }
  };

  window.addEventListener('mb:system-prompt', (e) => {
    const prompt = e.detail;
    if (!prompt) return;
    sessionStorage.setItem('mb_system_prompt', prompt);

    if (!window.__mbFetchPatched) {
      window.__mbFetchPatched = true;

      window.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;

        if (url.includes('/backend-api/conversation') && init.method === 'POST' && init.body) {
          try {
            const body = JSON.parse(init.body);
            const stored = sessionStorage.getItem('mb_system_prompt');

            if (stored && body.messages) {
              const hasSys = body.messages.some(m => m.author?.role === 'system');
              if (!hasSys) {
                body.messages.unshift({
                  id: crypto.randomUUID(),
                  author: { role: 'system' },
                  content: { content_type: 'text', parts: [stored] },
                });
              }
              init = { ...init, body: JSON.stringify(body) };
            }
          } catch (_) {}
        }

        return _origFetch.call(this, input, init);
      };
    }
  });

  // ── Автозапуск при завантаженні ───────────────────────────────────────────
  if (!window.__mbLoadInProgress) {
    window.__mbLoadInProgress = true;
    setTimeout(async () => {
      window.__mbLoadDone = false;
      await window.__mbLoadAllSessions();
      window.__mbLoadDone = true;
      window.__mbLoadInProgress = false;
    }, 300);
  }

  chrome.runtime.sendMessage({ type: 'CONTENT_READY', platform: 'gpt' });

})();
