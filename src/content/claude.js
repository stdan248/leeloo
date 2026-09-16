// Content script — claude.ai
// Відповідає за: витяг сесій, вставку системного промпту

(function () {
  'use strict';

  // ── Кеш дат створення сесій — на window щоб пережити повторний інжект ────
  if (!window.__mbSessionDates) window.__mbSessionDates = {};
  const __mbSessionDates = window.__mbSessionDates;

  if (!window.__mbOrgIdCached) window.__mbOrgIdCached = null;
  let __mbPrefetchDone = false;
  let __mbPrefetchTotal = 0;

  window.__mbPrefetchStatus = function() {
    const domItems = document.querySelectorAll('nav a[href*="/chat/"]');
    const loaded = Object.keys(__mbSessionDates).length;
    const total = Math.max(domItems.length, loaded);
    return { ready: __mbPrefetchDone, total, loaded };
  };
  // Читаємо org ID з cookie одразу
  (function() {
    const m = document.cookie.match(/lastActiveOrg=([0-9a-f-]{36})/);
    if (m) window.__mbOrgIdCached = m[1];
  })();

  const _origFetch = window.fetch;

  // ── Єдиний патч fetch — перехоплює дати сесій + org ID ───────────────────
  window.fetch = async function(input, init) {
    const res = await _origFetch.call(this, input, init);
    try {
      const url = typeof input === 'string' ? input : input.url;

      // Fallback: витягуємо org ID з URL якщо не знайшли в cookie
      if (!window.__mbOrgIdCached) {
        const orgMatch = url.match(/\/api\/organizations\/([^/]+)\//);
        if (orgMatch) {
          window.__mbOrgIdCached = orgMatch[1];
        }
      }

      // Перехоплюємо відповіді з даними сесій
      if (url.includes('/api/') && url.match(/\/chat_conversations\/[0-9a-f-]{36}/)) {
        const clone = res.clone();
        clone.json().then(data => {
          if (data?.uuid && data?.created_at) {
            __mbSessionDates[data.uuid] = data.created_at;
          }
        }).catch(() => {});
      }
    } catch (_) {}
    return res;
  };

  // ── Автопідвантаження дат для всіх сесій через API ──────────────────────
  // Лічильник поколінь — див. gemini.js: якщо автозапуск ще не завершив
  // пагінацію/довантаження дат, а popup.triggerPrefetch() запускає новий
  // виклик, старий цикл перехоплюється і тихо виходить замість того, щоб
  // паралельно бити той самий API.
  if (typeof window.__mbLoadGen !== 'number') window.__mbLoadGen = 0;

  window.__mbPrefetchDates = async function() {
    const myGen = ++window.__mbLoadGen;
    if (!window.__mbOrgIdCached) return;

    // Крок 1: отримуємо повний список сесій через API з пагінацією (offset)
    let allIds = [];
    try {
      let offset = 0;
      while (true) {
        if (myGen !== window.__mbLoadGen) {
          console.log('[MB] Claude: префетч перехоплено новим викликом — виходжу (крок 1)');
          return;
        }
        const r = await _origFetch(`/api/organizations/${window.__mbOrgIdCached}/chat_conversations?limit=100&offset=${offset}`);
        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) break;
        data.forEach(s => {
          if (s.uuid && s.created_at) __mbSessionDates[s.uuid] = s.created_at;
          if (s.uuid) allIds.push(s.uuid);
        });
        console.log(`[MB] API offset=${offset}: +${data.length}, всього: ${allIds.length}`);
        if (data.length < 100) break;
        offset += 100;
      }
      console.log(`[MB] API повернув ${allIds.length} сесій з датами`);
    } catch(e) {
      console.warn('[MB] API список не вдався, беремо з DOM:', e.message);
    }

    if (myGen !== window.__mbLoadGen) {
      console.log('[MB] Claude: префетч перехоплено новим викликом — виходжу (перед кроком 2)');
      return;
    }

    // Крок 2: додаємо сесії з DOM яких немає в API
    const domItems = document.querySelectorAll('nav a[href*="/chat/"]');
    const domIds = [];
    domItems.forEach(el => {
      const href = el.href || el.getAttribute('href') || '';
      const id = href.match(/\/chat\/([^/?#]+)/)?.[1];
      if (id && !__mbSessionDates[id]) domIds.push(id);
    });

    // Крок 3: підвантажуємо дати для тих що не отримали через API
    const missing = domIds.filter(id => !__mbSessionDates[id]);
    __mbPrefetchTotal = missing.length;

    if (missing.length > 0) {
      console.log(`[MB] Підвантаження дат для ${missing.length} сесій...`);
      for (const id of missing) {
        if (myGen !== window.__mbLoadGen) {
          console.log('[MB] Claude: префетч перехоплено новим викликом — виходжу (крок 3)');
          return;
        }
        if (__mbSessionDates[id]) continue;
        try {
          const r = await _origFetch(`/api/organizations/${window.__mbOrgIdCached}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`);
          const data = await r.json();
          if (data?.uuid && data?.created_at) {
            __mbSessionDates[data.uuid] = data.created_at;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 150));
      }
    }

    console.log(`[MB] Префетч завершено. Дат: ${Object.keys(__mbSessionDates).length}`);
    __mbPrefetchDone = true;
  };

  // ── Витяг списку сесій ────────────────────────────────────────────────────
  window.__mbGetSessions = function () {
    const sessions = [];

    // З DOM — беремо title і href
    const domMap = new Map();
    const items = document.querySelectorAll('nav a[href*="/chat/"]');
    items.forEach(el => {
      const href = el.href || el.getAttribute('href') || '';
      const id = href.match(/\/chat\/([^/?#]+)/)?.[1];
      if (id) domMap.set(id, el.textContent?.trim() || id);
    });

    // Всі відомі сесії = union DOM + API кеш
    const allIds = new Set([...domMap.keys(), ...Object.keys(__mbSessionDates)]);

    allIds.forEach(id => {
      const title = domMap.get(id) || id;
      const href = `/chat/${id}`;
      const createdAt = __mbSessionDates[id] || null;
      sessions.push({ id, title, href, createdAt });
    });

    const withDate = sessions.filter(s => s.createdAt);
    const withoutDate = sessions.filter(s => !s.createdAt);

    withDate.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const sorted = [...withDate, ...withoutDate];
    sorted.forEach((s, i) => { s.index = i + 1; });

    console.log(`[MB] Сесії: ${sorted.length} всього (${withDate.length} з датою, ${withoutDate.length} без)`);
    return sorted;
  };

  // ── Витяг повного тексту поточної сесії ───────────────────────────────────
  // Раніше парсили DOM ([data-testid="user-message"], [data-cds="Prose"]),
  // але це виявилось крихким з двох причин: (1) верстка claude.ai міняється
  // без попередження, (2) для довгих сесій Claude віртуалізує список
  // повідомлень — старі просто зникають з DOM при скролі, а не довантажуються
  // (на відміну від Gemini). Тому тепер тягнемо дані напряму з того самого
  // API, який уже використовує __mbPrefetchDates — без DOM, без скролу.
  const ROOT_PARENT = '00000000-0000-4000-8000-000000000000';

  window.__mbGetSessionContent = async function () {
    try {
      const orgId = window.__mbOrgIdCached;
      const sessionId = location.pathname.split('/').pop();
      if (!orgId || !sessionId) return '';

      const r = await fetch(`/api/organizations/${orgId}/chat_conversations/${sessionId}?tree=True&rendering_mode=messages&render_all_tools=true`);
      if (!r.ok) return '';
      const data = await r.json();
      const msgs = data.chat_messages || [];
      if (!msgs.length) return '';

      const byUuid = new Map(msgs.map(m => [m.uuid, m]));

      // tree=True повертає ВСІ гілки (включно з відредагованими/перегенерованими
      // повідомленнями). Щоб отримати тільки реальну, активну розмову — йдемо
      // по parent_message_uuid від current_leaf_message_uuid назад до кореня.
      const chain = [];
      let cur = data.current_leaf_message_uuid;
      let guard = 0;
      while (cur && cur !== ROOT_PARENT && byUuid.has(cur) && guard++ < 5000) {
        const m = byUuid.get(cur);
        chain.push(m);
        cur = m.parent_message_uuid;
      }
      chain.reverse();

      const messages = [];
      chain.forEach(m => {
        const role = m.sender === 'human' ? 'User' : 'Claude';
        const text = (m.content || [])
          .filter(b => b.type === 'text' && b.text)
          .map(b => b.text.trim())
          .filter(Boolean)
          .join('\n\n');
        if (text) messages.push(`[${role}]\n${text}`);
      });

      return messages.join('\n\n---\n\n');
    } catch (e) {
      console.warn('[MB] Claude: API-екстракція фулу не вдалась:', e.message);
      return '';
    }
  };

  // ── ID і назва поточної сесії ─────────────────────────────────────────────
  window.__mbGetSessionMeta = function () {
    const id = location.pathname.split('/').pop();
    const title = document.title.replace(/\s*-\s*Claude\s*$/, '').trim();
    return { id, title };
  };

  // ── Вставка системного промпту ────────────────────────────────────────────
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
              if (typeof body.system === 'string') {
                body.system = stored + '\n\n' + body.system;
              } else if (Array.isArray(body.system)) {
                body.system.unshift({ type: 'text', text: stored });
              } else {
                body.system = stored;
              }
              init = { ...init, body: JSON.stringify(body) };
            }
          } catch (_) {}
        }

        return origFetch.call(this, input, init);
      };
    }
  });

  // ── Повідомити background що content script готовий ───────────────────────
  // Запускаємо префетч одразу після завантаження
  setTimeout(() => window.__mbPrefetchDates(), 300);

  chrome.runtime.sendMessage({ type: 'CONTENT_READY', platform: 'claude' });

})();
