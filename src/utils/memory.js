// utils/memory.js — побудова і оновлення memory.txt
import { getStorage } from './storage.js';

export async function buildMemoryTxt(sessions, config) {
  let existing = '';
  try {
    existing = await readMemoryTxt(config);
  } catch (_) {}

  const existingMap = parseMemoryEntries(existing);

  for (const session of sessions) {
    if (session.short && session.num) {
      existingMap.set(session.num, formatEntry(session));
    }
  }

  const sorted = Array.from(existingMap.entries())
    .sort((a, b) => b[0] - a[0]);

  const total = sorted.length;
  const header = `=== MEMORY ===\nСесій: ${total}\nОновлено: ${new Date().toLocaleString('uk-UA')}\n===\n`;

  return header + '\n' + sorted.map(([, entry]) => entry).join('\n\n');
}

async function readMemoryTxt(config) {
  const rootId = config.cloudId || config.cloudRootId;
  const path = `${config.platform}/memory.txt`;
  const storage = getStorage(config.storage);
  return await storage.read(rootId, path);
}

function parseMemoryEntries(text) {
  const map = new Map();
  if (!text) return map;

  const blocks = text.split(/\n+(?=\d{3} \| )/);
  for (const block of blocks) {
    const match = block.match(/^(\d{3}) \| /);
    if (match) {
      map.set(parseInt(match[1]), block.trim());
    }
  }
  return map;
}

function formatEntry(session) {
  const num = String(session.num).padStart(3, '0');
  const id = session.id || '?';

  const shortText = session.short?.trim() || '';
  const titleMatch = shortText.match(/«([^»]+)»/);
  const title = titleMatch ? titleMatch[1] : session.title || 'без назви';

  const memory = session.memory?.trim();
  const lines = shortText.split('\n');
  const fullBody = lines.slice(1).join(' ').trim();
  const fallback = fullBody.match(/^[^.!?]+[.!?]/)?.[0]?.trim() || fullBody.slice(0, 150).trim();
  const body = memory || fallback;

  return `${num} | ${id} | «${title}»\n${body}`;
}
