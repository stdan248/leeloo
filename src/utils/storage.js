// utils/storage.js — єдиний адаптер для всіх сховищ

import { DriveStorage } from './drive.js';
import { OneDriveStorage } from './onedrive.js';
import { DropboxStorage } from './dropbox.js';
import { LocalStorage } from './local.js';

// Перед кожним викликом перетворює значення «папка» (ID, назва або посилання
// «Поділитися») на внутрішній корінь сховища. Готові ID/назви проходять без змін,
// тож старі налаштування продовжують працювати.
function withRootResolution(storage) {
  if (typeof storage.resolveRoot !== 'function') return storage;
  return new Proxy(storage, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== 'function' || prop === 'resolveRoot') return v;
      return async (rootId, ...rest) => v.call(target, await target.resolveRoot(rootId), ...rest);
    },
  });
}

export function getStorage(type) {
  switch (type) {
    case 'drive':    return withRootResolution(DriveStorage);
    case 'onedrive': return withRootResolution(OneDriveStorage);
    case 'dropbox':  return withRootResolution(DropboxStorage);
    case 'local':    return LocalStorage;
    default:         return withRootResolution(DriveStorage);
  }
}
