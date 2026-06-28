// utils/sync.js — синхронізація локального архіву з хмарою

import { LocalStorage } from './local.js';
import { getStorage } from './storage.js';

// ── Рекурсивний обхід локальних файлів ───────────────────────────────────────
async function listLocalFiles(dirHandle, prefix = '') {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      files.push({ name: prefix ? `${prefix}/${name}` : name, size: file.size, modified: file.lastModified });
    } else if (handle.kind === 'directory') {
      const sub = await listLocalFiles(handle, prefix ? `${prefix}/${name}` : name);
      files.push(...sub);
    }
  }
  return files;
}

// ── Рекурсивний обхід хмарних файлів ─────────────────────────────────────────
async function listCloudFiles(storage, cloudId, platform, folderPath = '', acc = []) {
  const folder = folderPath || platform;
  const entries = await storage.listFolder(cloudId, folder);
  for (const f of entries) {
    const path = folderPath ? `${folderPath}/${f.name}` : `${platform}/${f.name}`;
    // Папка — без розширення і розмір 0/null
    if (!f.name.includes('.') && (f.size === 0 || f.size == null)) {
      await listCloudFiles(storage, cloudId, platform, path, acc);
    } else {
      acc.push({ name: path, size: f.size, modified: f.modified ?? null });
    }
  }
  return acc;
}

// ── Отримати токен з chrome.storage для хмарного драйвера ────────────────────
async function applyCloudCredentials(syncCloud, cloudId, cloudToken) {
  const saved = await chrome.storage.local.get('mbSettings');
  const prev = saved.mbSettings || {};
  await chrome.storage.local.set({
    mbSettings: {
      ...prev,
      storageSettings: {
        ...(prev.storageSettings || {}),
        [syncCloud]: { cloudId, token: cloudToken },
      },
    },
  });
}

// ── Аналіз різниці ────────────────────────────────────────────────────────────
// Повертає { onlyLocal, onlyCloud, different, same, error }
export async function analyzeSync({ syncCloud, cloudId, cloudToken, platform, localDirHandle }) {
  if (!localDirHandle) return { error: 'Локальну папку не обрано' };
  if (!cloudId || !cloudToken) return { error: 'Вкажіть ID папки та токен хмари' };

  try {
    // Локальні файли з підпапки platform
    let platDirHandle = null;
    try {
      const perm = await localDirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        try {
          platDirHandle = await localDirHandle.getDirectoryHandle(platform, { create: false });
        } catch (_) {}
      }
    } catch (_) {}
    const localFiles = platDirHandle
      ? await listLocalFiles(platDirHandle, platform)
      : [];
    const localMap = new Map(localFiles.map(f => [f.name, f]));

    // Хмарні файли
    await applyCloudCredentials(syncCloud, cloudId, cloudToken);
    const storage = getStorage(syncCloud);
    const cloudFiles = await listCloudFiles(storage, cloudId, platform);
    const cloudMap = new Map(cloudFiles.map(f => [f.name, f]));

    // Порівняння
    const onlyLocal = [], onlyCloud = [], different = [], same = [];
    for (const [name, local] of localMap) {
      if (!cloudMap.has(name)) {
        onlyLocal.push(name);
      } else if (cloudMap.get(name).size !== local.size) {
        const cloud = cloudMap.get(name);
        different.push({
          name,
          localSize:     local.size,
          localModified: local.modified || null,
          cloudSize:     cloud.size,
          cloudModified: cloud.modified || null,
        });
      } else {
        same.push(name);
      }
    }
    for (const [name] of cloudMap) {
      if (!localMap.has(name)) onlyCloud.push(name);
    }

    return { onlyLocal, onlyCloud, different, same };

  } catch (e) {
    return { error: e.message };
  }
}

// ── Синхронізація ─────────────────────────────────────────────────────────────
// direction: 'to-cloud' | 'to-local'
// onProgress(text) — колбек прогресу
// Повертає { done, total, error }
export async function runSync({ direction, analysis, syncCloud, cloudId, cloudToken, onProgress }) {
  const { onlyLocal, onlyCloud, different } = analysis;
  const storage = getStorage(syncCloud);

  await applyCloudCredentials(syncCloud, cloudId, cloudToken);

  const toTransfer = direction === 'to-cloud'
    ? [...onlyLocal, ...different.map(f => f.name)]
    : [...onlyCloud, ...different.map(f => f.name)];

  const total = toTransfer.length;
  let done = 0;

  for (const name of toTransfer) {
    try {
      if (direction === 'to-cloud') {
        const content = await LocalStorage.read(null, name);
        await storage.save(cloudId, name, content);
      } else {
        const content = await storage.read(cloudId, name);
        await LocalStorage.save(null, name, content);
      }
      done++;
      onProgress?.({ done, total, name });
    } catch (e) {
      return { done, total, error: `${name}: ${e.message}` };
    }
  }

  return { done, total };
}
