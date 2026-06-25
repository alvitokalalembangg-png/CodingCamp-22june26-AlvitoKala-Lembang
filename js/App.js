'use strict';

const KEY = {
  tx:         'eviz2_transactions',
  categories: 'eviz2_categories',
  theme:      'eviz2_theme',
  limit:      'eviz2_limit',
  name:       'eviz2_username',
};

   //CATEGORY COLORS
const BASE_COLORS = {
  Food:      '#e8c96e',
  Transport: '#7eb8f7',
  Fun:       '#70c97a',
};
const EXTRA_COLORS = [
  '#f07070','#c084fc','#fb923c',
  '#38bdf8','#a3e635','#f472b6',
];

function getCategoryColor(cat, allCats) {
  if (BASE_COLORS[cat]) return BASE_COLORS[cat];
  const customs = allCats.filter(c => !BASE_COLORS[c]);
  return EXTRA_COLORS[customs.indexOf(cat) % EXTRA_COLORS.length] || '#888';
}

   //GREETING / WELCOME MODAL
function loadName()  { return localStorage.getItem(KEY.name) || ''; }
function saveName(v) { localStorage.setItem(KEY.name, v); }

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return 'Good Morning';
  if (h >= 11 && h < 15) return 'Good Afternoon';
  if (h >= 15 && h < 18) return 'Good Evening';
  return 'Good Night';
}

function renderGreeting() {
  const name  = loadName();
  const panel = document.getElementById('greetingPanel');
  const text  = document.getElementById('greetingText');

  if (name) {
    text.textContent = `${getTimeGreeting()}, ${name}`;
    panel.style.display = '';
    hideWelcomeModal();
  } else {
    panel.style.display = 'none';
    showWelcomeModal('');
  }
}

function showWelcomeModal(prefill) {
  const overlay = document.getElementById('welcomeOverlay');
  const input   = document.getElementById('welcomeNameInput');
  input.value = prefill;
  input.classList.remove('error');
  overlay.classList.add('open');
  setTimeout(() => input.focus(), 50);
}

function hideWelcomeModal() {
  document.getElementById('welcomeOverlay').classList.remove('open');
}

function saveWelcomeName() {
  const input = document.getElementById('welcomeNameInput');
  const name  = input.value.trim();
  if (!name) { input.classList.add('error'); return; }
  saveName(name);
  renderGreeting();
}

   //LOCAL STORAGE HELPERS
function loadTx()   { try { return JSON.parse(localStorage.getItem(KEY.tx))         || []; } catch { return []; } }
function saveTx(d)  { localStorage.setItem(KEY.tx, JSON.stringify(d)); }
function loadCats() { try { return JSON.parse(localStorage.getItem(KEY.categories)) || ['Food','Transport','Fun']; } catch { return ['Food','Transport','Fun']; } }
function saveCats(d){ localStorage.setItem(KEY.categories, JSON.stringify(d)); }
function loadLimit(){ return parseFloat(localStorage.getItem(KEY.limit)) || 0; }
function saveLimit(v){ localStorage.setItem(KEY.limit, v); }


  // CHART
let chart = null;

function renderChart(txList, cats) {
  const canvas = document.getElementById('spendingChart');
  const empty  = document.getElementById('chartEmpty');
  const ctx    = canvas.getContext('2d');

  const totals = {};
  txList.forEach(tx => { totals[tx.category] = (totals[tx.category] || 0) + tx.amount; });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map(l => getCategoryColor(l, cats));

  if (!labels.length) {
    empty.style.display = '';
    canvas.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  canvas.style.display = '';

  const borderColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface').trim() || '#141417';
  const legendColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--text-2').trim() || '#7a7885';

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.data.datasets[0].borderColor = borderColor;
    chart.options.plugins.legend.labels.color = legendColor;
    chart.update('active');
    return;
  }

  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor,
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 12,
            font: { size: 11, family: "'Syne', sans-serif" },
            color: legendColor,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${formatRp(ctx.parsed)}  (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

   //BALANCE
function renderBalance(txList) {
  const total = txList.reduce((s, t) => s + t.amount, 0);
  const el    = document.getElementById('totalBalance');

  el.textContent = formatRp(total);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');

  document.getElementById('txCount').textContent =
    `${txList.length} transaction${txList.length !== 1 ? 's' : ''}`;

  renderLimit(total);
}


  // SPENDING LIMIT (Optional #4)
function renderLimit(total) {
  const limit   = loadLimit();
  const bar     = document.getElementById('limitBar');
  const info    = document.getElementById('limitInfo');

  if (!limit) {
    bar.style.width = '0%';
    info.textContent = 'No limit set';
    info.classList.remove('over');
    bar.classList.remove('over');
    return;
  }

  const pct  = Math.min((total / limit) * 100, 100);
  const over = total > limit;

  bar.style.width = pct + '%';
  bar.classList.toggle('over', over);
  info.classList.toggle('over', over);
  info.textContent = over
    ? `Over limit by ${formatRp(total - limit)}`
    : `${formatRp(total)} / ${formatRp(limit)} (${pct.toFixed(0)}%)`;

  // Mark items over limit
  document.querySelectorAll('.tx-item').forEach(el => {
    const id = Number(el.dataset.id);
    const tx = loadTx().find(t => t.id === id);
    if (tx) el.classList.toggle('over-limit', over && tx.amount > limit * 0.5);
  });
}


   //MONTHLY SUMMARY (Optional #2)
function renderSummary(txList) {
  const grid  = document.getElementById('summaryGrid');
  const byMonth = {};

  txList.forEach(tx => {
    const d   = new Date(tx.id);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!byMonth[key]) byMonth[key] = { total: 0, count: 0 };
    byMonth[key].total += tx.amount;
    byMonth[key].count++;
  });

  const months = Object.keys(byMonth).sort().reverse();

  if (!months.length) {
    grid.innerHTML = '<div class="summary-empty">No data yet.</div>';
    return;
  }

  grid.innerHTML = months.map(m => {
    const [yr, mo] = m.split('-');
    const label = new Date(yr, mo-1).toLocaleString('default', { month:'short', year:'numeric' });
    return `
      <div class="summary-card">
        <div class="summary-month">${label}</div>
        <div class="summary-amount">${formatRp(byMonth[m].total)}</div>
        <div class="summary-count">${byMonth[m].count} item${byMonth[m].count!==1?'s':''}</div>
      </div>`;
  }).join('');
}


   //TRANSACTION LIST
function getSorted(txList) {
  const mode = document.getElementById('sortSelect').value;
  const list = [...txList];
  switch (mode) {
    case 'oldest':      return list.sort((a,b) => a.id - b.id);
    case 'amount-asc':  return list.sort((a,b) => a.amount - b.amount);
    case 'amount-desc': return list.sort((a,b) => b.amount - a.amount);
    case 'category':    return list.sort((a,b) => a.category.localeCompare(b.category));
    default:            return list.sort((a,b) => b.id - a.id);
  }
}

function renderList(txList, cats) {
  const container = document.getElementById('txList');
  const emptyEl   = document.getElementById('emptyState');
  const sorted    = getSorted(txList);
  const limit     = loadLimit();

  Array.from(container.querySelectorAll('.tx-item')).forEach(el => el.remove());

  if (!sorted.length) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  sorted.forEach(tx => {
    const color   = getCategoryColor(tx.category, cats);
    const date    = new Date(tx.id).toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
    const isOver  = limit && tx.amount > limit;
    const item    = document.createElement('div');

    item.className   = `tx-item${isOver ? ' over-limit' : ''}`;
    item.dataset.id  = tx.id;
    item.innerHTML   = `
      <div class="tx-dot" style="background:${color}"></div>
      <div class="tx-info">
        <div class="tx-name">${escHtml(tx.name)}</div>
        <div class="tx-meta">
          <span class="tx-amount">${formatRp(tx.amount)}</span>
          <span class="tx-chip" style="background:${color}22;color:${color}">${escHtml(tx.category)}</span>
          <span class="tx-date">${date}</span>
        </div>
      </div>
      <button class="tx-delete" data-id="${tx.id}" aria-label="Delete ${escHtml(tx.name)}">Delete</button>
    `;
    container.appendChild(item);
  });
}


   //CATEGORY DROPDOWN
function populateDropdown() {
  const sel  = document.getElementById('category');
  const cur  = sel.value;
  const cats = loadCats();

  sel.innerHTML = '<option value="">-- Select --</option>';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (c === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}


   //MASTER REFRESH
function refresh() {
  const txList = loadTx();
  const cats   = loadCats();
  renderBalance(txList);
  renderList(txList, cats);
  renderChart(txList, cats);
  renderSummary(txList);
}

   //ACTIONS
function addTransaction() {
  const nameEl = document.getElementById('itemName');
  const amtEl  = document.getElementById('amount');
  const catEl  = document.getElementById('category');

  const name   = nameEl.value.trim();
  const amount = parseFloat(amtEl.value.replace(/\./g, '').replace(/,/g, '.'));
  const cat    = catEl.value;
  let valid    = true;

  if (!name) {
    showErr('errName', 'Item name is required.'); nameEl.classList.add('error'); valid = false;
  } else { clearErr('errName'); nameEl.classList.remove('error'); }

  if (!amtEl.value || isNaN(amount) || amount <= 0) {
    showErr('errAmount', 'Enter a valid amount > 0.'); amtEl.classList.add('error'); valid = false;
  } else { clearErr('errAmount'); amtEl.classList.remove('error'); }

  if (!cat) {
    showErr('errCategory', 'Please select a category.');
    document.getElementById('category').classList.add('error'); valid = false;
  } else { clearErr('errCategory'); catEl.classList.remove('error'); }

  if (!valid) return;

  const txList = loadTx();
  txList.push({ id: Date.now(), name, amount, category: cat });
  saveTx(txList);

  nameEl.value = '';
  amtEl.value  = '';
  catEl.value  = '';

  showToast('Transaction added ✓');
  refresh();
}

function addCustomCategory() {
  const input = document.getElementById('newCatInput');
  const raw   = input.value.trim();
  if (!raw) return;

  const name  = raw.charAt(0).toUpperCase() + raw.slice(1);
  const cats  = loadCats();

  if (cats.map(c=>c.toLowerCase()).includes(name.toLowerCase())) {
    showToast(`"${name}" already exists`); return;
  }

  cats.push(name);
  saveCats(cats);
  populateDropdown();
  input.value = '';
  showToast(`Category "${name}" added`);
}

//DELETE 
let pendingId = null;

function requestDelete(id) {
  const tx = loadTx().find(t => t.id === id);
  if (!tx) return;
  pendingId = id;
  document.getElementById('modalDesc').textContent =
    `"${tx.name}" — ${formatRp(tx.amount)} will be removed permanently.`;
  document.getElementById('modalOverlay').classList.add('open');
}

function confirmDelete() {
  if (!pendingId) return;
  saveTx(loadTx().filter(t => t.id !== pendingId));
  pendingId = null;
  closeModal();
  showToast('Transaction deleted');
  refresh();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  pendingId = null;
}

//THEME
function initTheme() {
  const saved = localStorage.getItem(KEY.theme) || 'dark';
  applyTheme(saved);
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('themeIcon').textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(KEY.theme, t);
  if (chart) {
    const border = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    const legend = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim();
    chart.data.datasets[0].borderColor = border;
    chart.options.plugins.legend.labels.color = legend;
    chart.update();
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

/* ── LIMIT ── */
function saveSpendingLimit() {
  const val = parseFloat(document.getElementById('limitInput').value);
  if (!val || val <= 0) return;
  saveLimit(val);
  document.getElementById('limitInputRow').style.display = 'none';
  showToast(`Limit set to ${formatRp(val)}`);
  refresh();
}

   //HELPERS
function formatRp(n) {
  return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showErr(id, msg) { document.getElementById(id).textContent = msg; }
function clearErr(id)     { document.getElementById(id).textContent = ''; }

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

   //INIT
document.addEventListener('DOMContentLoaded', () => {

  initTheme();
  populateDropdown();
  refresh();

  // Greeting / Welcome modal
  renderGreeting();

  document.getElementById('welcomeGoBtn').addEventListener('click', saveWelcomeName);
  document.getElementById('welcomeNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveWelcomeName();
  });
  document.getElementById('greetingEditBtn').addEventListener('click', () => {
    showWelcomeModal(loadName());
  });

  // Theme
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Add transaction
  document.getElementById('addTxBtn').addEventListener('click', addTransaction);
  ['itemName','amount'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') addTransaction();
    });
  });

  // Custom category
  document.getElementById('addCatBtn').addEventListener('click', addCustomCategory);
  document.getElementById('newCatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCustomCategory();
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', refresh);

  // Delete (delegation)
  document.getElementById('txList').addEventListener('click', e => {
    const btn = e.target.closest('.tx-delete');
    if (btn) requestDelete(Number(btn.dataset.id));
  });

  // Modal
  document.getElementById('modalConfirm').addEventListener('click', confirmDelete);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Spending limit
  document.getElementById('limitEditBtn').addEventListener('click', () => {
    const row = document.getElementById('limitInputRow');
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('limitSaveBtn').addEventListener('click', saveSpendingLimit);
  document.getElementById('limitInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveSpendingLimit();
  });

});