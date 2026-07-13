// utils/onedrive.js — Microsoft Graph API

const GRAPH = 'https://graph.microsoft.com/v1.0';

// ── Кеш ID у пам'яті ─────────────────────────────────────────────────────────
// Той самий принцип, що й у drive.js: пошук по API ($filter) має затримку
// індексації, тож повторний пошук одразу після створення може не побачити
// щойно створений об'єкт. Кешуємо ID одразу після того, як самі його дізнались.
const folderIdCache = new Map(); // key: `${parentId}::${name}` → folderId
const fileIdCache   = new Map(); // key: `${rootId}::${filePath}` → { fileId, parentId, fileName, size }

export const OneDriveStorage = {

  async getOrCreateFolder(parentId, name) {
    if (!parentId) throw new Error(`getOrCreateFolder: parentId is undefined for folder "${name}"`);
    const cacheKey = `${parentId}::${name}`;
    if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey);

    const token = await getToken();

    // Шукаємо серед дочірніх без $filter (не всі endpoint підтримують)
    const search = await checkResponse(await fetch(
      `${GRAPH}/me/drive/items/${parentId}/children?$select=id,name,folder&$top=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    ));
    const found = await search.json();
    const existing = found.value?.find(f => f.name === name && f.folder);
    if (existing) {
      folderIdCache.set(cacheKey, existing.id);
      return existing.id;
    }

    // Створюємо. conflictBehavior: 'fail' замість 'rename' — якщо через гонитву
    // папка вже існує (race), хочемо помітну помилку, а не мовчазний дублікат
    // "short (1)" поряд зі "short".
    const create = await fetch(`${GRAPH}/me/drive/items/${parentId}/children`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });

    if (create.status === 409) {
      // Хтось (інший паралельний виклик) щойно створив цю ж папку — це не помилка,
      // а сигнал повторити пошук і взяти вже існуючий ID.
      const retry = await checkResponse(await fetch(
        `${GRAPH}/me/drive/items/${parentId}/children?$select=id,name,folder&$top=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      ));
      const retryFound = await retry.json();
      const retryExisting = retryFound.value?.find(f => f.name === name && f.folder);
      if (retryExisting) {
        folderIdCache.set(cacheKey, retryExisting.id);
        return retryExisting.id;
      }
      throw new Error(`getOrCreateFolder: конфлікт при створенні "${name}", але повторний пошук не знайшов папку`);
    }

    await checkResponse(create, `створення папки "${name}"`);
    const folder = await create.json();
    if (!folder.id) throw new Error(`getOrCreateFolder: failed to create "${name}": ${JSON.stringify(folder)}`);
    folderIdCache.set(cacheKey, folder.id);
    return folder.id;
  },

  async findFile(rootId, filePath) {
    const key = `${rootId}::${filePath}`;
    if (fileIdCache.has(key)) return { ...fileIdCache.get(key) };

    const parts = filePath.split('/');
    const fileName = parts.pop();
    let parentId = rootId;
    for (const part of parts) {
      parentId = await this.getOrCreateFolder(parentId, part);
    }
    const token = await getToken();
    const search = await checkResponse(await fetch(
      `${GRAPH}/me/drive/items/${parentId}/children?$filter=name eq '${fileName}'`,
      { headers: { Authorization: `Bearer ${token}` } }
    ));
    const found = await search.json();
    const file = found.value?.[0];
    const result = { fileId: file?.id, parentId, fileName, size: file?.size };
    if (result.fileId) fileIdCache.set(key, result);
    return result;
  },

  async read(rootId, filePath) {
    const { fileId } = await this.findFile(rootId, filePath);
    if (!fileId) throw new Error(`File not found: ${filePath}`);
    const token = await getToken();
    const res = await checkResponse(await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    return await res.text();
  },

  async save(rootId, filePath, content) {
    const { fileId, parentId, fileName } = await this.findFile(rootId, filePath);
    const token = await getToken();
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });

    if (fileId) {
      const res = await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: blob,
      });
      await checkResponse(res, `оновлення файлу "${filePath}"`);
      fileIdCache.set(`${rootId}::${filePath}`, { fileId, parentId, fileName, size: blob.size });
    } else {
      const res = await fetch(`${GRAPH}/me/drive/items/${parentId}:/${fileName}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: blob,
      });
      await checkResponse(res, `створення файлу "${filePath}"`);
      const created = await res.json().catch(() => null);
      if (created?.id) {
        fileIdCache.set(`${rootId}::${filePath}`, { fileId: created.id, parentId, fileName, size: blob.size });
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
    const res = await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    await checkResponse(res, `перейменування "${filePath}"`);
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
    let url = `${GRAPH}/me/drive/items/${parentId}/children?$select=id,name,size,lastModifiedDateTime,folder&$top=200`;
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      await checkResponse(res, `читання вмісту папки "${folderPath}"`);
      const data = await res.json();
      allFiles.push(...(data.value || []));
      url = data['@odata.nextLink'] || null;
    }
    return allFiles.map(f => ({
      id:       f.id,
      name:     f.name,
      size:     f.folder ? null : (f.size ?? null),
      modified: f.lastModifiedDateTime ? new Date(f.lastModifiedDateTime).getTime() : null,
    }));
  },
};


async function getToken() {
  const saved = await chrome.storage.local.get('mbSettings');
  const s = saved.mbSettings;
  const token = s?.storageSettings?.onedrive?.token || s?.driveToken;
  if (!token) throw new Error('OneDrive токен не вказано. Вставте access_token у налаштуваннях.');
  return token;
}

function notifyTokenExpired() {
  chrome.notifications.create('token_expired', {
    type: 'basic',
    iconUrl: '/icons/icon48.png',
    title: '🔴 OneDrive токен протух',
    message: 'Отримайте новий access_token в Graph Explorer.',
    buttons: [{ title: 'Відкрити Graph Explorer' }],
    requireInteraction: true,
  });
  // Зупиняємо обробку
  chrome.runtime.sendMessage({ type: 'TOKEN_EXPIRED_STOP' }).catch(() => {});
}

async function checkResponse(res, action) {
  if (res.status === 401) {
    notifyTokenExpired();
    throw new Error('STORAGE_ERROR: OneDrive — токен протух (401)');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch (_) { /* тіло не JSON — лишаємо detail порожнім */ }
    throw new Error(`STORAGE_ERROR: OneDrive — ${action || 'запит'} (${res.status}): ${detail}`);
  }
  return res;
}
