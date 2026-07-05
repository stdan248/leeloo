// utils/drive.js — Google Drive API (повна версія)

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

// ── Кеш fileId у пам'яті ────────────────────────────────────────────────────
// Пошуковий індекс Drive оновлюється з затримкою (eventual consistency).
// Якщо кілька save()/appendSorted() підряд летять на той самий шлях швидше,
// ніж індекс встигає оновитись, findFile() через API-пошук може не побачити
// щойно створений файл і створити дублікат з тим самим іменем.
// Тому щойно ми дізналися fileId (при створенні або при першому вдалому
// пошуку) — запам'ятовуємо його і надалі йдемо напряму по ID, без пошуку.
const fileIdCache = new Map(); // key: `${rootId}::${filePath}` → { fileId, parentId, fileName, size }
function cacheKey(rootId, filePath) { return `${rootId}::${filePath}`; }

export const DriveStorage = {

  async getOrCreateFolder(parentId, name) {
    const token = await getToken();
    const search = await fetch(
      `${DRIVE_API}/files?q=name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const found = await search.json();
    if (found.files?.length) return found.files[0].id;

    const create = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    });
    const folder = await create.json();
    return folder.id;
  },

  async findFile(rootId, filePath) {
    const key = cacheKey(rootId, filePath);
    if (fileIdCache.has(key)) {
      return { ...fileIdCache.get(key) };
    }

    const parts = filePath.split('/');
    const fileName = parts.pop();
    let parentId = rootId;
    for (const part of parts) {
      parentId = await this.getOrCreateFolder(parentId, part);
    }
    const token = await getToken();
    const search = await fetch(
      `${DRIVE_API}/files?q=name='${fileName}' and '${parentId}' in parents and trashed=false&fields=files(id,size)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const found = await search.json();
    const result = { fileId: found.files?.[0]?.id, parentId, fileName, size: found.files?.[0]?.size };
    if (result.fileId) fileIdCache.set(key, result);
    return result;
  },

  async read(rootId, filePath) {
    const { fileId } = await this.findFile(rootId, filePath);
    if (!fileId) throw new Error(`File not found: ${filePath}`);
    const token = await getToken();
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await res.text();
  },

  async save(rootId, filePath, content) {
    const { fileId, parentId, fileName } = await this.findFile(rootId, filePath);
    const token = await getToken();
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });

    if (fileId) {
      await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: blob,
      });
      // оновлюємо кешований розмір, ID лишається той самий
      fileIdCache.set(cacheKey(rootId, filePath), { fileId, parentId, fileName, size: blob.size });
    } else {
      const meta = new Blob(
        [JSON.stringify({ name: fileName, parents: [parentId], mimeType: 'text/plain' })],
        { type: 'application/json' }
      );
      const form = new FormData();
      form.append('metadata', meta);
      form.append('file', blob);
      const createRes = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const created = await createRes.json();
      // критичний момент: запам'ятовуємо ID щойно створеного файлу відразу,
      // не чекаючи, поки пошуковий індекс Drive його "побачить"
      if (created?.id) {
        fileIdCache.set(cacheKey(rootId, filePath), { fileId: created.id, parentId, fileName, size: blob.size });
      }
    }
  },

  async append(rootId, filePath, text, session) {
    const entry = `\n\n=== Сесія ${session.id}: ${session.title} ===\n${text}`;
    let existing = '';
    try { existing = await this.read(rootId, filePath); } catch (_) {}
    await this.save(rootId, filePath, existing + entry);
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
  async rename(rootId, filePath, newName) {
    const { fileId } = await this.findFile(rootId, filePath);
    if (!fileId) return;
    const token = await getToken();
    await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
  },

  async getFileSizeMB(rootId, filePath) {
    const { size } = await this.findFile(rootId, filePath);
    return parseInt(size || 0) / (1024 * 1024);
  },

  async listFolder(rootId, folderPath) {
    const parts = folderPath.split('/');
    let parentId = rootId;
    for (const part of parts) {
      parentId = await this.getOrCreateFolder(parentId, part);
    }
    const token = await getToken();
    const allFiles = [];
    let pageToken = null;
    do {
      const url = `${DRIVE_API}/files?q='${parentId}' in parents and trashed=false&fields=nextPageToken,files(id,name,size,modifiedTime)&orderBy=name&pageSize=1000${pageToken ? '&pageToken=' + pageToken : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      allFiles.push(...(data.files || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    return allFiles.map(f => ({
      id:       f.id,
      name:     f.name,
      size:     f.size ? parseInt(f.size) : null,
      modified: f.modifiedTime ? new Date(f.modifiedTime).getTime() : null,
    }));
  },
};

async function getToken() {
  const saved = await chrome.storage.local.get('mbSettings');
  const s = saved.mbSettings;
  const token = s?.storageSettings?.drive?.token || s?.driveToken;
  if (!token) throw new Error('Google Drive токен не вказано. Вставте access_token у налаштуваннях розширення.');
  return token;
}
