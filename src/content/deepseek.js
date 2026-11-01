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
  // Лічильник поколінь — див. gemini.js/gpt.js: новий виклик перехоплює
  // керування у попереднього ще не завершеного циклу.
  if (typeof window.__mbLoadGen !== 'number') window.__mbLoadGen = 0;

  window.__mbLoadAllSessions = function () {
    const myGen = ++window.__mbLoadGen;
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
        if (myGen !== window.__mbLoadGen) {
          console.log('[MB] DeepSeek: цикл скролу перехоплено новим викликом — виходжу');
          resolve();
          return;
        }
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

  // ══ Збір вмісту сесії ═════════════════════════════════════════════════════
  // Та сама логіка, що й у gemini.js/gpt.js: не одноразовий знімок DOM, а
  // прогресивний прохід кроками зі скролом, зі склеюванням вікон за
  // перекриттям. Для DeepSeek прямого підтвердження віртуалізації я не
  // знайшов (на відміну від Gemini й GPT), але архітектура функції була
  // ідентична їхній "до фіксу" (жодного скролу), тож застосовую той самий
  // захист про всяк випадок — для короткого, невіртуалізованого чату це
  // відпрацює за один прохід і нічого не змінить.
  const MB_STEP_WAIT = 350;
  const MB_MAX_STEPS = 800;
  const MB_TIME_LIMIT = 120000;
  const MB_EMPTY_RETRY_BUDGET = 30;
  const MB_SELECTOR = '.ds-message';

  const mbSleep = (ms) => new Promise(r => setTimeout(r, ms));

  function mbExtractMessage(el) {
    const isUser = el.classList.contains('d29f3d7d');
    const role = isUser ? 'User' : 'DeepSeek';
    const text = el.textContent?.trim() || '';
    return { role, text, sig: role + '|' + text.slice(0, 80) };
  }

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
      msgs = Array.from(document.querySelectorAll(MB_SELECTOR)).map(mbExtractMessage);
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
    const t0 = Date.now();
    try {
      let first = document.querySelector(MB_SELECTOR);
      for (let i = 0; i < 10 && !first; i++) {
        await mbSleep(300);
        first = document.querySelector(MB_SELECTOR);
      }
      if (!first) return '';

      const scroller = mbFindScrollParent(first);

      let lastCount = -1, stable = 0;
      for (let i = 0; i < 12 && stable < 2; i++) {
        scroller.scrollTop = 0;
        await mbSleep(500);
        const c = document.querySelectorAll(MB_SELECTOR).length;
        if (c === lastCount) stable++; else { stable = 0; lastCount = c; }
      }

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

      const chosen = acc.length >= best.length ? acc : best;
      const EMPTY_PLACEHOLDER = {
        User: '[без тексту — можливо, лише вкладення без підпису]',
        DeepSeek: '[без тексту — можливо, зображення, код чи інший непідтримуваний контент]',
      };
      const final = chosen.map(m => m.text ? m : { ...m, text: EMPTY_PLACEHOLDER[m.role] || '[без тексту]' });
      stats.emptyLeft = chosen.length - chosen.filter(m => m.text).length;

      console.log(
        `[MB] DeepSeek: збір вмісту — кроків ${stats.steps}, макс. у DOM ${stats.maxDom}, ` +
        `зібрано реплік ${final.length}, перечитувань порожніх ${stats.emptyRetries}, ` +
        `порожніх так і лишилось ${stats.emptyLeft}, розривів ${stats.gaps}` +
        (stats.stuck ? ', СКРОЛ ЗАСТРЯГ' : '') + (stats.timeout ? ', ТАЙМАУТ' : '')
      );
      if (stats.gaps > 0) {
        console.warn(`[MB] DeepSeek: ${stats.gaps} розрив(ів) між вікнами — між кроками могли випасти репліки`);
      }

      return final.map(m => `[${m.role}]\n${m.text}`).join('\n\n---\n\n');
    } catch (e) {
      console.warn('[MB] DeepSeek: помилка збору вмісту:', e.message);
      return '';
    }
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
