// utils/onedrive.js — Microsoft Graph API

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const OneDriveStorage = {

  async getOrCreateFolder(parentId, name) {
    if (!parentId) throw new Error(`getOrCreateFolder: parentId is undefined for folder "${name}"`);
    const token = await getToken();

    // Шукаємо серед дочірніх без $filter (не всі endpoint підтримують)
    const search = await checkResponse(await fetch(
      `${GRAPH}/me/drive/items/${parentId}/children?$select=id,name,folder&$top=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    ));
    const found = await search.json();
    const existing = found.value?.find(f => f.name === name && f.folder);
    if (existing) return existing.id;

    // Створюємо
    const create = await checkResponse(await fetch(`${GRAPH}/me/drive/items/${parentId}/children`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    }));
    const folder = await create.json();
    if (!folder.id) throw new Error(`getOrCreateFolder: failed to create "${name}": ${JSON.stringify(folder)}`);
    return folder.id;
  },

  async findFile(rootId, filePath) {
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
    return { fileId: file?.id, parentId, fileName, size: file?.size };
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
      await fetch(`${GRAPH}/me/drive/items/${fileId}/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: blob,
      });
    } else {
      await fetch(`${GRAPH}/me/drive/items/${parentId}:/${fileName}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: blob,
      });
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
    await fetch(`${GRAPH}/me/drive/items/${fileId}`, {
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
    let url = `${GRAPH}/me/drive/items/${parentId}/children?$select=id,name,size,lastModifiedDateTime,folder&$top=200`;
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

async function checkResponse(res) {
  if (res.status === 401) {
    notifyTokenExpired();
    throw new Error('InvalidAuthenticationToken: токен протух');
  }
  return res;
}
