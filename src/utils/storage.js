// utils/storage.js — єдиний адаптер для всіх сховищ

import { DriveStorage } from './drive.js';
import { OneDriveStorage } from './onedrive.js';
import { DropboxStorage } from './dropbox.js';
import { LocalStorage } from './local.js';

export function getStorage(type) {
  switch (type) {
    case 'drive':    return DriveStorage;
    case 'onedrive': return OneDriveStorage;
    case 'dropbox':  return DropboxStorage;
    case 'local':    return LocalStorage;
    default:         return DriveStorage;
  }
}
