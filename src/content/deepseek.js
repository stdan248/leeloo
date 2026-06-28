// Content script — chat.deepseek.com

(function () {
  'use strict';

  // ── Відкрити sidebar якщо сесій не видно ────────────────────────────────
  async function ensureSidebarOpen() {
    if (document.querySelectorAll('a[href*="/a/chat/s/"]').length > 0) return;
    const toggleBtn = document.querySelector('._4f3769f[role="button"]');
    if (toggleBtn) {
      toggleBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ── Скролінг sidebar до кінця щоб завантажити всі сесії ─────────────────
  window.__mbLoadAllSessions = function () {
    return new Promise(async (resolve) => {
      await ensureSidebarOpen();

      let sidebar =
        document.querySelector('.dad65929') ||
        document.querySelector('[class*="history"]') ||
        document.querySelector('[class*="sidebar"]') ||
        document.querySelector('nav');

      if (!sidebar) { resolve(); return; }

      let lastCount = 0;
      let stableFor = 0;
      const MAX_ATTEMPTS = 30;
      let attempts = 0;

      function scrollAndCheck() {
        attempts++;
        sidebar.scrollTop = sidebar.scrollHeight;

        const count = document.querySelectorAll('a[href*="/a/chat/s/"]').length;
        if (count === lastCount) {
          stableFor++;
        } else {
          stableFor = 0;
          lastCount = count;
        }

        console.log(`[MB] DeepSeek sidebar scroll: ${count} сесій, стабільно: ${stableFor}`);

        if (stableFor >= 3 || attempts >= MAX_ATTEMPTS) {
          console.log(`[MB] DeepSeek: завантажено ${count} сесій`);
          resolve();
        } else {
          setTimeout(scrollAndCheck, 500);
        }
      }

      setTimeout(scrollAndCheck, 300);
    });
  };

  window.__mbGetSessions = async function () {
    await window.__mbLoadAllSessions();

    const sessions = [];
    const seen = new Set();
    const items = document.querySelectorAll('a[href*="/a/chat/s/"]');

    items.forEach((el) => {
      const href = el.getAttribute('href') || '';
      const id = href.match(/\/s\/([^/?]+)/)?.[1];
      if (!id || seen.has(id)) return;
      seen.add(id);
      const title = el.textContent?.trim() || id;
      sessions.push({ id, title, href });
    });

    // DOM порядок: нові зверху → реверс щоб index 1 = найстаріша
    sessions.reverse();
    sessions.forEach((s, i) => { s.index = i + 1; });

    console.log(`[MB] DeepSeek: зібрано ${sessions.length} сесій`);
    return sessions;
  };

  window.__mbGetSessionContent = function () {
    const messages = [];
    const els = document.querySelectorAll('.ds-message');

    els.forEach(el => {
      const isUser = el.classList.contains('d29f3d7d');
      const role = isUser ? 'User' : 'DeepSeek';
      const text = el.textContent?.trim();
      if (text) messages.push(`[${role}]\n${text}`);
    });

    return messages.join('\n\n---\n\n');
  };

  window.__mbGetSessionMeta = function () {
    const id = location.pathname.split('/').pop();
    const title = document.title.trim();
    return { id, title };
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

        if (url.includes('/api/') && init.method === 'POST' && init.body) {
          try {
            const body = JSON.parse(init.body);
            const stored = sessionStorage.getItem('mb_system_prompt');

            if (stored && body.messages) {
              const hasSys = body.messages.some(m => m.role === 'system');
              if (!hasSys) {
                body.messages.unshift({ role: 'system', content: stored });
              }
              init = { ...init, body: JSON.stringify(body) };
            }
          } catch (_) {}
        }

        return origFetch.call(this, input, init);
      };
    }
  });

  // ── Статус пресканування ─────────────────────────────────────────────────
  window.__mbLoadDone = false;

  window.__mbPrefetchStatus = function () {
    const count = document.querySelectorAll('a[href*="/a/chat/s/"]').length;
    return { ready: window.__mbLoadDone, total: count, loaded: count };
  };

  // ── Автозапуск при завантаженні ───────────────────────────────────────────
  setTimeout(async () => {
    await window.__mbLoadAllSessions();
    // Другий прохід для підтвердження
    const countAfterFirst = document.querySelectorAll('a[href*="/a/chat/s/"]').length;
    await new Promise(r => setTimeout(r, 1500));
    await window.__mbLoadAllSessions();
    const countAfterSecond = document.querySelectorAll('a[href*="/a/chat/s/"]').length;
    console.log(`[MB] DeepSeek: перший прохід ${countAfterFirst}, другий ${countAfterSecond}`);
    window.__mbLoadDone = true;
  }, 300);

  chrome.runtime.sendMessage({ type: 'CONTENT_READY', platform: 'deepseek' });

})();
