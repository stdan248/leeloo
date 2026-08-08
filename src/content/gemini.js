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

  window.__mbGetSessionContent = function () {
    const messages = [];
    const els = document.querySelectorAll('user-query, model-response');

    els.forEach(el => {
      const isUser = el.tagName.toLowerCase() === 'user-query';
      const role = isUser ? 'User' : 'Gemini';
      let text = '';
      if (isUser) {
        const queryEl = el.querySelector('.query-text, p, [class*="query"]');
        text = queryEl?.innerText?.trim() || el.innerText?.trim() || '';
        text = text.replace(/Your message\s*/i, '').trim();
        if (!text) text = '';
      } else {
        text = el.innerText?.trim() || '';
      }
      if (text) messages.push(`[${role}]\n${text}`);
    });

    return messages.join('\n\n---\n\n');
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
