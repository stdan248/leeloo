// utils/local.js — локальне сховище через File System Access API
// Handle зберігається в IndexedDB і читається напряму (працює в SW).
// requestPermission() НЕ викликається з SW (не підтримується).
// Дозвіл запитується в popup при старті / натисканні кнопки.

async function getRoot() {
  const handle = await loadLocalHandle();
  if (!handle) throw new Error('Локальну папку не обрано. Оберіть папку у налаштуваннях.');
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('Немає дозволу на запис. Відкрийте розширення і натисніть "Відновити доступ".');
  return handle;
}

async function resolveFile(rootHandle, filePath, create = false) {
  const parts = filePath.replace(/^\/+/, '').split('/');
  let dir = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create });
  }
  return await dir.getFileHandle(parts[parts.length - 1], { create });
}

async function resolveDir(rootHandle, dirPath, create = false) {
  const parts = dirPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  let dir = rootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

const IDB_NAME = 'mb-local-storage';
const IDB_STORE = 'handles';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadLocalHandle() {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('localDir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (_) { return null; }
}

export const LocalStorage = {

  async read(rootId, filePath) {
    const root = await getRoot();
    try {
      const fh = await resolveFile(root, filePath, false);
      const file = await fh.getFile();
      return await file.text();
    } catch (_) {
      throw new Error(`File not found: ${filePath}`);
    }
  },

  async save(rootId, filePath, content) {
    const root = await getRoot();
    const fh = await resolveFile(root, filePath, true);
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
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
    try {
      const root = await getRoot();
      const fh = await resolveFile(root, filePath, false);
      const file = await fh.getFile();
      return file.size / (1024 * 1024);
    } catch (_) { return 0; }
  },

  async listFolder(rootId, folderPath) {
    try {
      const root = await getRoot();
      const dir = await resolveDir(root, folderPath, false);
      const entries = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file') {
          const file = await handle.getFile();
          entries.push({ id: name, name, size: file.size });
        }
      }
      return entries;
    } catch (_) { return []; }
  },

  async getOrCreateFolder(rootId, folderPath) {
    const root = await getRoot();
    await resolveDir(root, folderPath, true);
    return folderPath;
  },
};
