// conflict.js — вікно вирішення конфліктів синхронізації

import { LocalStorage } from '../utils/local.js';
import { getStorage } from '../utils/storage.js';

// ── Стан ─────────────────────────────────────────────────────────────────────
const decisions = new Map(); // filename → 'cloud' | 'local' | 'skip'
let params = null; // { different, syncCloud, cloudId, cloudToken }
let sortCol = 'name';
let sortAsc = true;
let activeFilter = null; // 'local-bigger' | 'cloud-bigger' | 'local-newer' | 'cloud-newer' | null

const $ = id => document.getElementById(id);

// ── Ініціалізація ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Отримуємо параметри від opener (popup)
  const data = await chrome.storage.session.get('conflictParams');
  params = data.conflictParams;
  if (!params?.different?.length) { window.close(); return; }

  $('conflict-count').textContent = `${params.different.length} файлів`;

  renderList();
  updateSummary();
  bindEvents();
  bindSort();
  bindFilter();
});

// ── Рендер списку ─────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes == null) return '?';
  if (bytes < 1024) return `${bytes} б`;
  return `${(bytes / 1024).toFixed(1)} КБ`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function filteredItems() {
  if (!activeFilter) return params.different;
  return params.different.filter(item => {
    const m = typeof item === 'object' ? item : {};
    switch (activeFilter) {
      case 'local-bigger':  return (m.localSize ?? 0) > (m.cloudSize ?? 0);
      case 'cloud-bigger':  return (m.cloudSize ?? 0) > (m.localSize ?? 0);
      case 'local-newer':   return (m.localModified ?? 0) > (m.cloudModified ?? 0);
      case 'cloud-newer':   return (m.cloudModified ?? 0) > (m.localModified ?? 0);
      default: return true;
    }
  });
}

function sortedItems() {
  const items = [...filteredItems()];
  items.sort((a, b) => {
    const am = typeof a === 'object' ? a : { name: a };
    const bm = typeof b === 'object' ? b : { name: b };
    let av = am[sortCol] ?? (sortCol === 'name' ? am.name : null);
    let bv = bm[sortCol] ?? (sortCol === 'name' ? bm.name : null);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return sortAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
  });
  return items;
}

function renderList() {
  const tbody = $('conflict-list');
  tbody.innerHTML = '';

  // оновлюємо стрілки заголовків
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.col === sortCol) {
      th.classList.add('sorted');
      arrow.textContent = sortAsc ? '↑' : '↓';
    } else {
      th.classList.remove('sorted');
      arrow.textContent = '↕';
    }
  });

  for (const item of sortedItems()) {
    const name = typeof item === 'string' ? item : item.name;
    const meta = typeof item === 'object' ? item : {};
    const decision = decisions.get(name) || 'skip';

    const tr = document.createElement('tr');
    tr.dataset.file = name;
    tr.innerHTML = `
      <td class="col-name" title="${name}">${name}</td>
      <td class="col-size-local">${fmtSize(meta.localSize)}</td>
      <td class="col-date-local">${fmtDate(meta.localModified)}</td>
      <td class="col-size-cloud">${fmtSize(meta.cloudSize)}</td>
      <td class="col-date-cloud">${fmtDate(meta.cloudModified)}</td>
      <td class="col-actions">
        <div class="dir-btns">
          <button class="dir-btn ${decision === 'local' ? 'active-local' : ''}" data-dir="local">↓ Диск</button>
          <button class="dir-btn ${decision === 'cloud' ? 'active-cloud' : ''}" data-dir="cloud">↑ Хмара</button>
          <button class="dir-btn ${decision === 'skip'  ? 'active-skip'  : ''}" data-dir="skip">— Пропустити</button>
        </div>
      </td>
    `;

    tr.querySelectorAll('.dir-btn').forEach(btn => {
      btn.onclick = () => {
        decisions.set(name, btn.dataset.dir);
        tr.querySelectorAll('.dir-btn').forEach(b => {
          b.className = 'dir-btn';
          if (b.dataset.dir === btn.dataset.dir) b.classList.add(`active-${btn.dataset.dir}`);
        });
        updateSummary();
      };
    });

    tbody.appendChild(tr);
  }
}

// ── Масові кнопки ─────────────────────────────────────────────────────────────
function setAll(dir) {
  for (const item of params.different) {
    const name = typeof item === 'string' ? item : item.name;
    decisions.set(name, dir);
  }
  renderList();
  updateSummary();
}

// ── Підрахунок ────────────────────────────────────────────────────────────────
function updateSummary() {
  let cloud = 0, local = 0, skip = 0;
  for (const item of params.different) {
    const name = typeof item === 'string' ? item : item.name;
    const d = decisions.get(name) || 'skip';
    if (d === 'cloud') cloud++;
    else if (d === 'local') local++;
    else skip++;
  }
  $('summary').textContent =
    `↑ ${cloud} в хмару · ↓ ${local} на диск · — ${skip} пропустити`;
  $('btn-apply').disabled = (cloud + local) === 0;
}

// ── Застосувати ───────────────────────────────────────────────────────────────
async function applyDecisions() {
  const storage = getStorage(params.syncCloud);
  const { cloudId, cloudToken, syncCloud } = params;

  // Застосовуємо credentials
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

  const names = params.different.map(f => typeof f === 'string' ? f : f.name);
  const toProcess = names.filter(n => decisions.get(n) === 'cloud' || decisions.get(n) === 'local');
  let done = 0;
  const status = $('status');
  status.style.display = 'block';

  for (const name of toProcess) {
    const dir = decisions.get(name);
    try {
      if (dir === 'cloud') {
        const content = await LocalStorage.read(null, name);
        await storage.save(cloudId, name, content);
      } else {
        const content = await storage.read(cloudId, name);
        await LocalStorage.save(null, name, content);
      }
      done++;
      status.textContent = `${dir === 'cloud' ? '↑' : '↓'} ${done}/${toProcess.length}: ${name}`;
    } catch (e) {
      status.style.color = 'var(--warn,#FF9800)';
      status.textContent = `⚠ Помилка: ${name} — ${e.message}`;
      return;
    }
  }

  status.style.color = 'var(--ok,#4CAF50)';
  status.textContent = `✓ Готово — оброблено ${done} файлів`;

  // Повідомляємо popup і закриваємося
  await chrome.storage.session.set({ conflictResult: { done, total: toProcess.length } });
  setTimeout(() => window.close(), 1200);
}

// ── Фільтри ───────────────────────────────────────────────────────────────────
function bindFilter() {
  const btns = document.querySelectorAll('[data-filter]');
  btns.forEach(btn => {
    btn.onclick = () => {
      const f = btn.dataset.filter;
      activeFilter = (activeFilter === f) ? null : f;
      btns.forEach(b => b.classList.toggle('active-filter', b.dataset.filter === activeFilter));
      renderList();
    };
  });
}

// ── Сортування ────────────────────────────────────────────────────────────────
function bindSort() {
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.onclick = () => {
      if (sortCol === th.dataset.col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = th.dataset.col;
        sortAsc = true;
      }
      renderList();
    };
  });
}

// ── Прив'язка подій ───────────────────────────────────────────────────────────
function bindEvents() {
  $('btn-all-cloud').onclick = () => setAll('cloud');
  $('btn-all-local').onclick = () => setAll('local');
  $('btn-all-skip').onclick  = () => setAll('skip');
  $('btn-cancel').onclick    = () => window.close();
  $('btn-apply').onclick     = applyDecisions;
}
