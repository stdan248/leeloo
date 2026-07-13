// utils/dropbox.js — Dropbox API v2

const DBX = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';

function buildPath(rootId, filePath) {
  const root = rootId ? '/' + rootId.replace(/^\/+|\/+$/g, '') : '';
  return `${root}/${filePath}`;
}

// ── Перевірка відповіді API ──────────────────────────────────────────────
// Раніше: save() взагалі не перевіряв res.ok (найтихіший варіант з усіх трьох
// драйверів — жодного сигналу про провал); listFolder()/getFileSizeMB() при
// помилці свідомо повертали "порожньо" (`[]`/`0`), не розрізняючи "файла
// справді нема" від "запит провалився" (протухлий токен, мережа, 5xx).
// Dropbox на "шлях не знайдено" відповідає 409 з error_summary
// 'path/not_found/...' — це єдиний легітимний випадок, коли non-ok відповідь
// означає не системну проблему, а звичайну "нема, і це нормально" (саме так
// append()/appendSorted() і використовують read() — щоб почати новий файл).
// Усе інше не-2xx — STORAGE_ERROR, яка зупиняє весь прогін через processNext.
async function assertOk(res, action) {
  if (res.ok) return res;
  let body = null;
  try { body = await res.json(); } catch (_) { /* тіло не JSON */ }
  const summary = body?.error_summary || '';
  if (res.status === 409 && summary.startsWith('path/not_found')) {
    const e = new Error(`File not found: ${action || ''}`);
    e.notFound = true;
    throw e;
  }
  const detail = summary || res.statusText || '';
  throw new Error(`STORAGE_ERROR: Dropbox — ${action || 'запит'} (${res.status}): ${detail}`);
}

export const DropboxStorage = {

  async read(rootId, filePath) {
    const token = await getToken();
    const path = buildPath(rootId, filePath);
    const res = await fetch(`${DBX_CONTENT}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    });
    await assertOk(res, `читання файлу "${filePath}"`);
    return await res.text();
  },

  async save(rootId, filePath, content) {
    const token = await getToken();
    const path = buildPath(rootId, filePath);
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    const res = await fetch(`${DBX_CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false }),
      },
      body: blob,
    });
    await assertOk(res, `збереження файлу "${filePath}"`);
  },

    async appendSorted(rootId, filePath, shortWithId, currentNum) {
    let existing = '';
    try { existing = await this.read(rootId, filePath); } catch (_) {}

    const SEP = '\n\n<<<SESSION_SEP>>>\n\n';

    const map = new Map();
    if (existing) {
      const entries = existing.includes('<<<SESSION_SEP>>>')
        ? existing.split('<<<SESSION_SEP>>>')
        : existing.split(/(?=\nSESSION_ID:)/);
      for (const entry of entries) {
        if (!entry.trim()) continue;
        const numMatch = entry.match(/SESSION_NUM: *(\d+)/);
        if (numMatch) map.set(parseInt(numMatch[1]), entry.trim());
      }
    }

    map.set(currentNum, shortWithId.trim());
    const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    const result = sorted.map(([, entry]) => entry).join(SEP);

    await this.save(rootId, filePath, result);
  },
  async append(rootId, filePath, text, session) {
    const entry = `\n\n=== Сесія ${session.id}: ${session.title} ===\n${text}`;
    let existing = '';
    try { existing = await this.read(rootId, filePath); } catch (_) {}
    await this.save(rootId, filePath, existing + entry);
  },

  async getFileSizeMB(rootId, filePath) {
    const token = await getToken();
    const path = buildPath(rootId, filePath);
    const res = await fetch(`${DBX}/files/get_metadata`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      try {
        await assertOk(res, `перевірка розміру "${filePath}"`);
      } catch (e) {
        if (e.notFound) return 0; // файла ще нема — це нормально, розмір 0
        throw e; // справжня помилка (401/403/5xx) — не маскуємо як "0 МБ"
      }
    }
    const data = await res.json();
    return (data.size || 0) / (1024 * 1024);
  },

  async listFolder(rootId, folderPath) {
    const token = await getToken();
    const path = buildPath(rootId, folderPath);
    let entries = [];
    let res = await fetch(`${DBX}/files/list_folder`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, limit: 2000 }),
    });
    if (!res.ok) {
      try {
        await assertOk(res, `читання вмісту папки "${folderPath}"`);
      } catch (e) {
        if (e.notFound) return []; // папки ще нема — це нормально, порожній список
        throw e; // справжня помилка — не маскуємо як "порожня папка"
      }
    }
    let data = await res.json();
    entries = entries.concat(data.entries || []);
    // Пагінація
    while (data.has_more && data.cursor) {
      res = await fetch(`${DBX}/files/list_folder/continue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor: data.cursor }),
      });
      await assertOk(res, `продовження читання папки "${folderPath}"`); // на паузі краще впасти, ніж мовчки повернути неповний список
      data = await res.json();
      entries = entries.concat(data.entries || []);
    }
    return entries.map(f => ({
      id:       f.id,
      name:     f.name,
      size:     f['.tag'] === 'folder' ? null : f.size,
      modified: f.client_modified ? new Date(f.client_modified).getTime() : null,
    }));
  },

  async getOrCreateFolder(rootId, folderPath) {
    const token = await getToken();
    const path = buildPath(rootId, folderPath);
    const res = await fetch(`${DBX}/files/create_folder_v2`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, autorename: false }),
    });
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (_) {}
      const summary = body?.error_summary || '';
      // 409 path/conflict/folder... — папка вже існує, це очікувано і нормально
      if (!(res.status === 409 && summary.startsWith('path/conflict'))) {
        throw new Error(`STORAGE_ERROR: Dropbox — створення папки "${folderPath}" (${res.status}): ${summary || res.statusText}`);
      }
    }
    return path;
  },
};

async function getToken() {
  const saved = await chrome.storage.local.get('mbSettings');
  const s = saved.mbSettings;
  const token = s?.storageSettings?.dropbox?.token;
  if (!token) throw new Error('Dropbox токен не вказано. Вставте access token у налаштуваннях розширення.');
  return token;
}
