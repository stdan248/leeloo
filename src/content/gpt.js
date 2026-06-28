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

  if (!window.__mbLoadDone) window.__mbLoadDone = false;
  if (!window.__mbLoadedCount) window.__mbLoadedCount = 0;

  window.__mbPrefetchStatus = function () {
    const domCount = document.querySelectorAll('#history a[href*="/c/"], a[data-sidebar-item="true"][href*="/c/"]').length;
    const count = Math.max(domCount, window.__mbLoadedCount);
    return { ready: window.__mbLoadDone, total: count, loaded: count };
  };

  const _origFetch = window.fetch;

  // ── Скролінг sidebar до кінця щоб завантажити всі сесії ─────────────────
  window.__mbLoadAllSessions = function () {
    return new Promise((resolve) => {

      function startScroll() {
        const sidebar = document.querySelector('#history');
        if (!sidebar) { resolve(); return; }

        let lastCount = 0;
        let stableFor = 0;
        const MAX_ATTEMPTS = 100;
        let attempts = 0;

        function scrollAndCheck() {
          attempts++;
          const lastItem = sidebar.querySelector('li:last-child');
          if (lastItem) lastItem.scrollIntoView();

          const count = document.querySelectorAll('#history a[href*="/c/"], a[data-sidebar-item="true"][href*="/c/"]').length;
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
      if (document.querySelector('#history')) {
        startScroll();
        return;
      }

      // Інакше — клікаємо кнопку і чекаємо через MutationObserver
      const openBtn = document.querySelector('[data-testid="open-sidebar-button"]');
      if (openBtn) openBtn.click();

      const observer = new MutationObserver(() => {
        if (document.querySelector('#history')) {
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
    const items = document.querySelectorAll('#history a[href*="/c/"], a[data-sidebar-item="true"][href*="/c/"]');

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

  window.__mbGetSessionContent = function () {
    const messages = [];
    const els = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );

    els.forEach(el => {
      const role = el.dataset.messageAuthorRole === 'user' ? 'User' : 'ChatGPT';
      const text = el.textContent?.trim();
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
