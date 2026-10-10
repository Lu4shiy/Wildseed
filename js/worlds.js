// js/worlds.js
// Логика страницы выбора мира (Your Worlds / Find World / Create World).
// Переехала с index.html в отдельный файл после появления главного меню.

const STORAGE_KEY = 'wildseed:worlds';
const CURRENT_KEY = 'wildseed:current';
const CFG_KEY     = 'wildseed.worldCfg';

const $ = id => document.getElementById(id);

function loadWorlds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveWorlds(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// Возвращает seed (0..2147483647) если введены только цифры, иначе null.
// null → вызывающий должен сгенерировать случайный сид. Пустая строка — тоже null.
// Важно: "0" — валидный сид, не путать с null.
function parseSeed(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;
  if (!/^\d{1,10}$/.test(s)) return null;
  let n = parseInt(s, 10);
  if (!isFinite(n) || n < 0) return null;
  if (n > 2147483647) n = 2147483647;
  return n;
}
function randomSeed() {
  return Math.floor(Math.random() * 2147483646) + 1;
}

function renderWorlds() {
  const list = loadWorlds();
  const el = $('worldsList');
  if (!list.length) {
    el.innerHTML = '<div class="empty">No worlds yet. Create one!</div>';
    el.classList.add('empty');
    return;
  }
  el.classList.remove('empty');
  el.innerHTML = list.map((w, i) => `
    <div class="world-card" data-i="${i}">
      <div class="name">${escapeHtml(w.name)}</div>
      <div class="meta">
        ${w.isPublic ? 'Public' : 'Private'}
        · ${w.size === 0 ? 'Infinite' : w.size + '×' + w.size}
        · ${escapeHtml(w.difficulty)}
        · seed: ${escapeHtml(w.seed)}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.world-card').forEach(card => {
    card.addEventListener('click', () => {
      const w = list[+card.dataset.i];
      localStorage.setItem(CURRENT_KEY, JSON.stringify(w));
      localStorage.setItem(CFG_KEY, JSON.stringify(w));
      window.location.href = 'world.html';
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

function openModal() { $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }

$('btnNewWorld').addEventListener('click', openModal);
$('btnCancel').addEventListener('click', closeModal);

$('wPublic').addEventListener('change', e => {
  $('wCodeLabel').classList.toggle('hidden', e.target.checked);
});

$('btnCreate').addEventListener('click', () => {
  const name = $('wName').value.trim() || 'My World';
  const seedInput = $('wSeed').value.trim();

  let seedNum = parseSeed(seedInput);
  if (seedNum === null) seedNum = randomSeed();
  const seed = String(seedNum);

  const size = parseInt($('wSize').value, 10);
  const diffRaw = ($('wDiff').value || 'normal').toLowerCase();
  const difficulty =
    diffRaw === 'easy'    ? 'Easy' :
    diffRaw === 'hard'    ? 'Hard' :
    diffRaw === 'extreme' ? 'Extreme' : 'Normal';

  const keepInventory = $('wKeepInv').checked;
  const isPublic = $('wPublic').checked;
  const code = isPublic ? null : ($('wCode').value.trim() || Math.random().toString(36).slice(2, 7).toUpperCase());

  const world = { name, seed, size, difficulty, keepInventory, isPublic, code, createdAt: Date.now() };

  const list = loadWorlds();
  list.unshift(world);
  saveWorlds(list);

  localStorage.setItem(CURRENT_KEY, JSON.stringify(world));
  localStorage.setItem(CFG_KEY,     JSON.stringify(world));
  window.location.href = 'world.html';
});

$('btnLogin').addEventListener('click', () => alert('Accounts will be added in a later step (Yandex / GitHub / VK).'));
$('btnAccount').addEventListener('click', () => alert('Account panel — soon.'));

renderWorlds();