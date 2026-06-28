// utils/dropbox.js — Dropbox API v2

const DBX = 'https://api.dropboxapi.com/2';
const DBX_CONTENT = 'https://content.dropboxapi.com/2';

function buildPath(rootId, filePath) {
  const root = rootId ? '/' + rootId.replace(/^\/+|\/+$/g, '') : '';
  return `${root}/${filePath}`;
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
    if (!res.ok) throw new Error(`File not found: ${filePath}`);
    return await res.text();
  },

  async save(rootId, filePath, content) {
    const token = await getToken();
    const path = buildPath(rootId, filePath);
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    await fetch(`${DBX_CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false }),
      },
      body: blob,
    });
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

    console.log(`[appendSorted] блок: ${filePath}, записів до: ${map.size}, має ${currentNum}: ${map.has(currentNum)}`);

    map.set(currentNum, shortWithId.trim());
    const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    const result = sorted.map(([, entry]) => entry).join(SEP);

    console.log(`[appendSorted] записів після: ${map.size}, зберігаємо ${result.length} символів`);

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
    if (!res.ok) return 0;
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
    if (!res.ok) return [];
    let data = await res.json();
    entries = entries.concat(data.entries || []);
    // Пагінація
    while (data.has_more && data.cursor) {
      res = await fetch(`${DBX}/files/list_folder/continue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor: data.cursor }),
      });
      if (!res.ok) break;
      data = await res.json();
      entries = entries.concat(data.entries || []);
    }
    return entries.map(f => ({
      id:       f.id,
      name:     f.name,
      size:     f.size,
      modified: f.client_modified ? new Date(f.client_modified).getTime() : null,
    }));
  },

  async getOrCreateFolder(rootId, folderPath) {
    const token = await getToken();
    const path = buildPath(rootId, folderPath);
    await fetch(`${DBX}/files/create_folder_v2`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, autorename: false }),
    });
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
