// ===== Логика главной страницы =====

const STORAGE_KEY = 'wildseed:worlds';
const CURRENT_KEY = 'wildseed:current';

const $ = id => document.getElementById(id);

// Загрузка/сохранение списка миров пользователя
function loadWorlds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveWorlds(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// Рендер списка миров
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
        · ${w.difficulty}
        · seed: ${escapeHtml(w.seed)}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.world-card').forEach(card => {
    card.addEventListener('click', () => {
      const w = list[+card.dataset.i];
      localStorage.setItem(CURRENT_KEY, JSON.stringify(w));
      window.location.href = 'world.html';
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}

// Модальное окно
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
  const seed = seedInput || Math.random().toString(36).slice(2, 10);
  const size = parseInt($('wSize').value, 10);
  const difficulty = $('wDiff').value;
  const keepInventory = $('wKeepInv').checked;
  const isPublic = $('wPublic').checked;
  const code = isPublic ? null : ($('wCode').value.trim() || Math.random().toString(36).slice(2, 7).toUpperCase());

  const world = { name, seed, size, difficulty, keepInventory, isPublic, code, createdAt: Date.now() };

  const list = loadWorlds();
  list.unshift(world);
  saveWorlds(list);

  localStorage.setItem(CURRENT_KEY, JSON.stringify(world));
  window.location.href = 'world.html';
});

// Заглушки для аккаунта (позже заменим на OAuth)
$('btnLogin').addEventListener('click', () => alert('Accounts will be added in a later step (Yandex / GitHub / VK).'));
$('btnAccount').addEventListener('click', () => alert('Account panel — soon.'));

// На старте — рисуем
renderWorlds();