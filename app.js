// ================================
// Daily App —— 主程序
// 分成几块：小工具 / 页面切换 / 待办 / 记账 / 运动
// ================================

// ---------- 小工具 ----------
const $ = id => document.getElementById(id);

// 新建一个页面元素，例：el('div', 'item', '你好')
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 给每条记录一个独一无二的编号
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// 本地存储：数据只存在你自己的手机里
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('daily.' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('daily.' + key, JSON.stringify(value)); }
    catch (e) { alert('保存失败：手机存储空间可能满了'); }
  }
};

// 日期工具（都用"本地时间"，避免时区把日期算错一天）
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
function dateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
const todayStr = () => dateStr(new Date());
function dayLabel(s) {
  const d = parseDate(s);
  const base = `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
  if (s === todayStr()) return '今天 · ' + base;
  if (s === addDays(todayStr(), -1)) return '昨天 · ' + base;
  return base;
}
const shortDay = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };

// 把用户输入的数字读出来（"4,50" 和 "4.50" 都可以）
function toNumber(v) {
  const n = parseFloat(String(v).replace(',', '.').trim());
  return isFinite(n) ? n : NaN;
}
const round2 = n => Math.round(n * 100) / 100;
const euro = n => '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 弹出层：打开 / 关闭
function openSheet(id) { $(id).classList.add('open'); }
function closeSheet(id) { $(id).classList.remove('open'); }
document.querySelectorAll('.sheet-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg || e.target.closest('[data-close]')) closeSheet(bg.id);
  });
});


// ================================
// 1. 页面切换
// ================================
const PAGES = ['briefing', 'todo', 'fitness', 'budget'];

function showPage() {
  let name = location.hash.replace('#', '');
  if (!PAGES.includes(name)) name = 'briefing'; // 默认打开早报

  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === name));

  const page = $('page-' + name);
  $('page-title').textContent = page.dataset.title;
  $('top-mascot').src = page.dataset.mascot;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', showPage);

$('today').textContent = (() => {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${WEEKDAYS[d.getDay()]}`;
})();


// ================================
// 2. 待办猫猫
// ================================
// 两个分区：工作 / 生活。每个分区自己的高度跟着待办数量变，不是固定高度。
const AREAS = [
  { key: 'work', name: '工作', icon: '💼' },
  { key: 'life', name: '生活', icon: '🏡' },
];

let todos = store.get('todos', []);
// 一次性整理：以前新的排在最前面，现在改成按加入时间排，最新的在最后
if (!store.get('todosOrderV2', false)) {
  todos.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  store.set('todos', todos);
  store.set('todosOrderV2', true);
}
// 一次性整理：以前没有分区的待办，都放进「生活」
if (todos.some(t => !AREAS.some(a => a.key === t.area))) {
  todos.forEach(t => { if (!AREAS.some(a => a.key === t.area)) t.area = 'life'; });
  store.set('todos', todos);
}

// 每个分区的「已完成」是展开还是收起（默认收起）
const doneOpen = store.get('todoDoneOpen', {});

function saveTodos() { store.set('todos', todos); renderTodos(); }

// 做一行待办
function todoRow(t) {
  const row = el('div', 'item todo' + (t.done ? ' done' : ''));
  row.dataset.id = t.id;
  enableDrag(row);

  const check = el('button', 'check', t.done ? '✓' : '');
  check.setAttribute('aria-label', t.done ? '标为未完成' : '标为完成');
  check.onclick = () => { t.done = !t.done; saveTodos(); };

  const text = el('button', 'todo-text');
  text.appendChild(el('div', 'item-title', t.text));
  text.onclick = () => editTodo(row, t); // 点文字 = 原地改字；打勾请点左边圆圈

  const del = el('button', 'del-x', '✕');
  del.setAttribute('aria-label', '删除');
  del.onclick = () => { todos = todos.filter(x => x.id !== t.id); saveTodos(); };

  row.append(check, text, del);
  return row;
}

function renderTodos() {
  const list = $('t-list');
  list.innerHTML = '';

  AREAS.forEach(a => {
    const mine = todos.filter(t => t.area === a.key);
    const undone = mine.filter(t => !t.done);
    const done = mine.filter(t => t.done);

    const sec = el('section', 't-section');
    sec.dataset.area = a.key;

    const head = el('div', 't-sec-head');
    head.append(el('span', 't-sec-name', a.icon + ' ' + a.name), el('span', 't-sec-count'));

    // 没做完的 + 最下面一行「＋ 添加」
    const items = el('div', 't-items');
    items.dataset.area = a.key;
    items.dataset.kind = 'undone';
    undone.forEach(t => items.appendChild(todoRow(t)));
    const add = el('button', 't-add-row', '＋ 添加');
    add.onclick = () => startNewTodo(a.key);
    items.appendChild(add);
    sec.append(head, items);

    // 做完的：收进一个可以点开的小折叠
    if (done.length) {
      const open = !!doneOpen[a.key];
      const toggle = el('button', 't-done-toggle' + (open ? ' open' : ''));
      toggle.append(el('span', '', `✓ 已完成 ${done.length}`), el('span', 't-arrow', '›'));
      toggle.onclick = () => {
        doneOpen[a.key] = !open;
        store.set('todoDoneOpen', doneOpen);
        renderTodos();
      };
      const dl = el('div', 't-items t-done-list');
      dl.dataset.area = a.key;
      dl.dataset.kind = 'done';
      dl.hidden = !open;
      done.forEach(t => dl.appendChild(todoRow(t)));
      sec.append(toggle, dl);
    }

    list.appendChild(sec);
  });

  updateTodoMeta();
}

// 只更新数字和提示文字（不重画列表）
function updateTodoMeta() {
  AREAS.forEach(a => {
    const c = document.querySelector(`.t-section[data-area="${a.key}"] .t-sec-count`);
    const n = todos.filter(t => t.area === a.key && !t.done).length;
    if (c) c.textContent = n ? `${n} 件` : '';
  });
  const left = todos.filter(t => !t.done).length;
  const doneCount = todos.length - left;
  $('t-left').textContent = todos.length ? `还有 ${left} 件没做` + ' · 点文字可修改 · 长按可拖动' : '点分区里的 ＋ 添加';
  $('t-clear').style.display = doneCount ? '' : 'none';
}

// 点分区底部「＋ 添加」：这个分区最下面直接出现一行空白待办，光标就在里面
// 回车 = 保存并自动开下一行；点别处 = 保存（空的就不要了）
function startNewTodo(area) {
  const old = document.querySelector('.todo-new');
  if (old) {
    if (old.dataset.area === area) { old.querySelector('input').focus(); return; }
    old.querySelector('input').blur(); // 另一个分区正在写的那行先保存
  }
  const items = document.querySelector(`.t-items[data-kind="undone"][data-area="${area}"]`);
  if (!items) return;

  const row = el('div', 'item todo todo-new');
  row.dataset.area = area;
  const check = el('span', 'check');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-new-input';
  input.maxLength = 100;
  input.autocomplete = 'off';
  input.enterKeyHint = 'next';
  input.placeholder = '要做什么？';
  row.append(check, input);

  items.insertBefore(row, items.querySelector('.t-add-row'));
  input.focus(); // 必须在点击里立刻 focus，iPhone 才会弹出键盘
  row.scrollIntoView({ block: 'nearest' });

  let finished = false;
  const finish = (again) => {
    if (finished) return;
    finished = true;
    const text = input.value.trim();
    if (text) {
      const t = { id: uid(), text, done: false, area, createdAt: Date.now() };
      todos.push(t);
      store.set('todos', todos);
      row.replaceWith(todoRow(t)); // 只换掉这一行，不重画整个列表（这样点别的按钮不会“点空”）
      updateTodoMeta();
    } else {
      row.remove();
    }
    if (again && text) startNewTodo(area);
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
  });
  input.addEventListener('blur', () => finish(false));
}

// 点一条待办的文字：文字变成可以打字的样子，光标在最后
// 回车 / 点别处 = 保存；改成空的 = 保留原来的字（删除请点 ✕）
function editTodo(row, t) {
  if (row.classList.contains('editing')) return;
  row.classList.add('editing');
  const text = row.querySelector('.todo-text');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-new-input';
  input.maxLength = 100;
  input.autocomplete = 'off';
  input.enterKeyHint = 'done';
  input.value = t.text;
  text.replaceWith(input);
  input.focus(); // 必须在点击里立刻 focus，iPhone 才会弹出键盘
  const end = input.value.length;
  input.setSelectionRange(end, end);

  let finished = false;
  const finish = (keep) => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    if (keep && v && v !== t.text) { t.text = v; store.set('todos', todos); }
    if (row.isConnected) row.replaceWith(todoRow(t)); // 只换这一行
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---- 长按拖动排序（可以跨分区） ----
// 手指按住一行不动约 0.2 秒 → 这行“浮起来”，拖到想要的位置再松手。
// 没做完的可以拖到另一个分区（就变成那个分区的待办）；已完成的只在展开的“已完成”里换位置。
let drag = null;          // 正在拖的那一行的信息
let suppressClick = false; // 刚拖完，别把松手当成“打勾”

function enableDrag(row) {
  row.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('.del-x, input')) return;
    pressStart(row, e.touches[0].clientY);
  }, { passive: true });
  row.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.del-x, input')) return;
    pressStart(row, e.clientY);
  });
}

function pressStart(row, y) {
  cancelPress();
  if (row.classList.contains('editing') || row.classList.contains('todo-new')) return;
  drag = { row, startY: y, y, active: false };
  row.classList.add('pressing');           // 一按下就有反馈，不用干等
  drag.timer = setTimeout(() => beginDrag(), 220);
}

function cancelPress() {
  if (drag && !drag.active) {
    clearTimeout(drag.timer);
    drag.row.classList.remove('pressing');
    drag = null;
  }
}

function beginDrag() {
  const { row } = drag;
  if (!row.isConnected) { drag = null; return; }
  drag.active = true;
  row.classList.remove('pressing');

  const r = row.getBoundingClientRect();
  drag.kind = row.classList.contains('done') ? 'done' : 'undone';
  drag.h = r.height;
  drag.grab = drag.startY - r.top;   // 手指按在这一行的哪个高度
  drag.top = r.top;

  // 原位置放一个“空位”，这一行浮起来跟着手指走
  const ph = el('div', 'todo-placeholder');
  ph.style.height = r.height + 'px';
  row.before(ph);
  drag.ph = ph;
  Object.assign(row.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: '0' });
  row.classList.add('dragging');
  $('t-list').classList.add('sorting');
  if (navigator.vibrate) navigator.vibrate(15);
}

// 其它行顺滑地让位（先记下原来的位置，挪完再从原位置滑过去）
function slideAround(mutate) {
  const els = [...$('t-list').querySelectorAll('.todo:not(.dragging), .t-add-row, .t-done-toggle, .t-sec-head')];
  const before = els.map(e => e.getBoundingClientRect().top);
  mutate();
  els.forEach(e => { e.style.transition = 'none'; e.style.transform = ''; });
  const after = els.map(e => e.getBoundingClientRect().top);
  els.forEach((e, i) => {
    const d = before[i] - after[i];
    if (Math.abs(d) > 0.5) e.style.transform = `translate3d(0,${d}px,0)`;
  });
  void $('t-list').offsetHeight; // 让浏览器先“记住”起点
  els.forEach(e => {
    if (e.style.transform) { e.style.transition = 'transform .16s ease-out'; e.style.transform = ''; }
  });
}

// 根据浮起来那一行的中心，决定空位应该在哪个分区、哪一行前面
function placeHolder() {
  const list = $('t-list');
  const center = drag.y - drag.grab + drag.h / 2 - list.getBoundingClientRect().top;
  const conts = [...list.querySelectorAll(`.t-items[data-kind="${drag.kind}"]:not([hidden])`)];
  let box = null, best = Infinity;
  conts.forEach(c => {
    const top = c.offsetTop, bottom = top + c.offsetHeight;
    const d = center < top ? top - center : center > bottom ? center - bottom : 0;
    if (d < best) { best = d; box = c; }
  });
  if (!box) return;

  const rows = [...box.querySelectorAll(':scope > .todo:not(.dragging):not(.todo-new)')];
  const before = rows.find(r => center < r.offsetTop + r.offsetHeight / 2)
    || box.querySelector(':scope > .t-add-row, :scope > .todo-new')
    || null;
  if (drag.box === box && drag.before === before) return; // 位置没变
  drag.box = box;
  drag.before = before;
  slideAround(() => box.insertBefore(drag.ph, before));
}

function moveDrag(y) {
  drag.y = y;
  drag.row.style.transform = `translate3d(0,${y - drag.startY}px,0) scale(1.03)`;
  placeHolder();
}

// 拖到屏幕上下边缘时，页面自己慢慢滚
function autoScroll() {
  if (!drag || !drag.active) return;
  const edge = 90, h = window.innerHeight;
  let v = 0;
  if (drag.y < edge) v = -Math.ceil((edge - drag.y) / 8);
  else if (drag.y > h - edge - 80) v = Math.ceil((drag.y - (h - edge - 80)) / 8);
  if (v) { window.scrollBy(0, v); moveDrag(drag.y); }
  requestAnimationFrame(autoScroll);
}

function onMove(y, e) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.abs(y - drag.startY) > 8) cancelPress(); // 手指动了 = 想滚动页面，不是长按
    return;
  }
  if (e.cancelable) e.preventDefault(); // 拖动时别让页面跟着滚
  if (!drag.scrolling) { drag.scrolling = true; requestAnimationFrame(autoScroll); }
  // 每一帧只画一次（手指事件可能比屏幕刷新还快）
  drag.y = y;
  if (!drag.frame) drag.frame = requestAnimationFrame(() => { if (drag && drag.active) { drag.frame = 0; moveDrag(drag.y); } });
}

function endDrag(e) {
  if (!drag) return;
  if (!drag.active) { cancelPress(); return; }
  if (e && e.cancelable) e.preventDefault();
  moveDrag(drag.y);
  const { row, ph, top } = drag;
  drag = null;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 400);

  // 松手：这一行顺滑地落进空位，然后再保存顺序
  row.classList.remove('dragging');
  row.classList.add('dropping');
  row.style.transform = `translate3d(0,${ph.getBoundingClientRect().top - top}px,0)`;
  setTimeout(() => finishDrop(row, ph), 130);
}

function finishDrop(row, ph) {
  $('t-list').classList.remove('sorting');
  const area = ph.parentNode && ph.parentNode.dataset.area;
  ph.replaceWith(row);

  const byId = Object.fromEntries(todos.map(t => [t.id, t]));
  const moved = byId[row.dataset.id];
  if (moved && area) moved.area = area;   // 拖到哪个分区，就属于哪个分区

  // 按现在屏幕上的顺序重新排（收起来的“已完成”也在里面，只是看不见）
  const ordered = [];
  $('t-list').querySelectorAll('.todo:not(.todo-new)').forEach(r => {
    const t = byId[r.dataset.id];
    if (t && !ordered.includes(t)) ordered.push(t);
  });
  todos.forEach(t => { if (!ordered.includes(t)) ordered.push(t); });
  todos = ordered;
  saveTodos();
}

document.addEventListener('touchmove', e => onMove(e.touches[0].clientY, e), { passive: false });
document.addEventListener('mousemove', e => onMove(e.clientY, e));
document.addEventListener('touchend', endDrag, { passive: false });
document.addEventListener('touchcancel', endDrag);
document.addEventListener('mouseup', endDrag);
document.addEventListener('contextmenu', e => { if (drag && e.target.closest('.todo')) e.preventDefault(); });
$('t-list').addEventListener('click', e => {
  if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
}, true);

$('t-clear').onclick = () => { todos = todos.filter(t => !t.done); saveTodos(); };


// ================================
// 3. 记账小猪
// ================================
const CATEGORIES = [
  { id: 'food',      name: '餐饮', emoji: '🍜' },
  { id: 'grocery',   name: '买菜', emoji: '🥬' },
  { id: 'shopping',  name: '购物', emoji: '🛍️' },
  { id: 'transport', name: '交通', emoji: '🚇' },
  { id: 'home',      name: '住房', emoji: '🏠' },
  { id: 'daily',     name: '日用', emoji: '🧻' },
  { id: 'fun',       name: '娱乐', emoji: '🎮' },
  { id: 'health',    name: '健康', emoji: '💊' },
  { id: 'travel',    name: '旅行', emoji: '✈️' },
  { id: 'other',     name: '其他', emoji: '📦' }
];
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

// 可选货币（汇率来自欧洲央行，通过 frankfurter 免费获取）
const CURRENCIES = [
  ['EUR', '€ 欧元'], ['CNY', '¥ 人民币'], ['USD', '$ 美元'], ['GBP', '£ 英镑'],
  ['CHF', 'CHF 瑞郎'], ['JPY', '円 日元'], ['HKD', 'HK$ 港币'], ['KRW', '₩ 韩元'],
  ['SGD', 'S$ 新元'], ['THB', '฿ 泰铢'], ['DKK', 'kr 丹麦'], ['SEK', 'kr 瑞典'],
  ['NOK', 'kr 挪威'], ['PLN', 'zł 波兰'], ['CZK', 'Kč 捷克'], ['HUF', 'Ft 匈牙利']
];

let expenses = store.get('expenses', []);
let rates = store.get('rates', null);     // { date, fetchedOn, rates: { CNY: 7.8, ... } }  意思是 1€ = 7.8¥
let bMonth = todayStr().slice(0, 7);      // 正在看的月份，例 "2026-11"
let bEditing = null;                      // 正在修改的那一笔（新建时为空）
let bCat = 'food';

// 联网拿最新汇率（每天最多拿一次；只发送"要欧元汇率"这个请求，不发送任何账目）
async function fetchRates(force) {
  if (!force && rates && rates.fetchedOn === todayStr()) return rates;
  const urls = [
    'https://api.frankfurter.dev/v1/latest?base=EUR',
    'https://api.frankfurter.app/latest?from=EUR'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.rates) {
        rates = { date: data.date, fetchedOn: todayStr(), rates: data.rates };
        store.set('rates', rates);
        return rates;
      }
    } catch (e) { /* 没网，试下一个 */ }
  }
  return rates; // 拿不到就用上次存的
}

function saveExpenses() {
  expenses.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  store.set('expenses', expenses);
  renderBudget();
}

function renderBudget() {
  const [y, m] = bMonth.split('-').map(Number);
  $('b-month').textContent = `${y}年${m}月`;
  $('b-next').style.visibility = bMonth >= todayStr().slice(0, 7) ? 'hidden' : 'visible';

  const monthItems = expenses.filter(x => x.date.startsWith(bMonth));
  const total = monthItems.reduce((s, x) => s + x.eur, 0);
  $('b-total').textContent = euro(total);

  // 分类汇总条
  const byCat = {};
  monthItems.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + x.eur; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  const bars = $('b-cats');
  bars.innerHTML = '';
  cats.forEach(([id, sum]) => {
    const c = catOf(id);
    const row = el('div', 'cat-bar');
    row.appendChild(el('span', '', `${c.emoji} ${c.name}`));
    const track = el('div', 'track');
    const fill = el('div', 'fill');
    fill.style.width = Math.max(4, sum / max * 100) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'amt', euro(sum)));
    bars.appendChild(row);
  });

  // 按天分组的明细
  const list = $('b-list');
  list.innerHTML = '';
  let lastDay = null;
  monthItems.forEach(x => {
    if (x.date !== lastDay) {
      lastDay = x.date;
      const dayTotal = monthItems.filter(i => i.date === x.date).reduce((s, i) => s + i.eur, 0);
      const label = el('div', 'day-label');
      label.append(el('span', '', dayLabel(x.date)), el('span', '', euro(dayTotal)));
      list.appendChild(label);
    }
    const c = catOf(x.cat);
    const item = el('button', 'item');
    item.appendChild(el('div', 'item-emoji', c.emoji));
    const main = el('div', 'item-main');
    main.appendChild(el('div', 'item-title', x.note || c.name));
    main.appendChild(el('div', 'item-sub', c.name));
    item.appendChild(main);
    const right = el('div', 'item-right', euro(x.eur));
    if (x.currency !== 'EUR') {
      right.appendChild(el('small', '', `${x.amount} ${x.currency}`));
    }
    item.appendChild(right);
    item.onclick = () => openExpense(x);
    list.appendChild(item);
  });

  $('b-empty').style.display = monthItems.length ? 'none' : '';
}

// 填好"货币"下拉框和"分类"按钮
CURRENCIES.forEach(([code, label]) => {
  const o = el('option', '', label);
  o.value = code;
  $('b-cur').appendChild(o);
});
function renderChips() {
  const box = $('b-chips');
  box.innerHTML = '';
  CATEGORIES.forEach(c => {
    const chip = el('button', 'chip' + (c.id === bCat ? ' on' : ''), `${c.emoji} ${c.name}`);
    chip.type = 'button';
    chip.onclick = () => { bCat = c.id; renderChips(); };
    box.appendChild(chip);
  });
}

// 根据输入实时显示"约等于多少欧元"
function updateRateHint() {
  const cur = $('b-cur').value;
  const amt = toNumber($('b-amount').value);
  const hint = $('b-rate');
  if (cur === 'EUR') { hint.textContent = ''; return; }

  let r = null, when = '';
  if (bEditing && bEditing.currency === cur) { r = bEditing.rate; when = '记账时的汇率'; }
  else if (rates && rates.rates[cur]) { r = rates.rates[cur]; when = `欧洲央行 ${rates.date}`; }

  if (!r) { hint.textContent = '正在获取汇率…（需要联网）'; return; }
  const eur = isFinite(amt) ? ` → 约 ${euro(amt / r)}` : '';
  hint.textContent = `1€ = ${r} ${cur}（${when}）${eur}`;
}
$('b-cur').addEventListener('change', () => {
  updateRateHint();
  if ($('b-cur').value !== 'EUR') fetchRates().then(updateRateHint);
});
$('b-amount').addEventListener('input', updateRateHint);

function openExpense(x) {
  bEditing = x || null;
  $('b-sheet-title').textContent = x ? '修改这一笔' : '记一笔';
  $('b-cur').value = x ? x.currency : store.get('lastCurrency', 'EUR');
  $('b-amount').value = x ? x.amount : '';
  $('b-note').value = x ? x.note : '';
  $('b-date').value = x ? x.date : todayStr();
  bCat = x ? x.cat : 'food';
  $('b-error').textContent = '';
  $('b-delete').classList.toggle('show', !!x);
  renderChips();
  updateRateHint();
  openSheet('b-sheet');
  if ($('b-cur').value !== 'EUR') fetchRates().then(updateRateHint);
  if (!x) setTimeout(() => $('b-amount').focus(), 300);
}

$('b-add').onclick = () => openExpense(null);

$('b-form').addEventListener('submit', e => {
  e.preventDefault();
  const amount = toNumber($('b-amount').value);
  const currency = $('b-cur').value;
  const date = $('b-date').value || todayStr();
  if (!isFinite(amount) || amount <= 0) { $('b-error').textContent = '请填一个大于 0 的金额'; return; }

  let rate = 1;
  if (currency !== 'EUR') {
    if (bEditing && bEditing.currency === currency) rate = bEditing.rate;
    else if (rates && rates.rates[currency]) rate = rates.rates[currency];
    else { $('b-error').textContent = '还没拿到汇率：请联网后再保存，或者先用欧元记'; return; }
  }

  const data = {
    amount: round2(amount),
    currency,
    rate,
    eur: round2(amount / rate),
    cat: bCat,
    note: $('b-note').value.trim(),
    date
  };
  if (bEditing) Object.assign(bEditing, data);
  else expenses.push({ id: uid(), createdAt: String(Date.now()), ...data });

  store.set('lastCurrency', currency);
  bMonth = date.slice(0, 7);
  saveExpenses();
  closeSheet('b-sheet');
});

$('b-delete').onclick = () => {
  if (!bEditing) return;
  if (!confirm('确定删除这一笔吗？')) return;
  expenses = expenses.filter(x => x.id !== bEditing.id);
  saveExpenses();
  closeSheet('b-sheet');
};

$('b-prev').onclick = () => {
  const d = parseDate(bMonth + '-01'); d.setMonth(d.getMonth() - 1);
  bMonth = dateStr(d).slice(0, 7); renderBudget();
};
$('b-next').onclick = () => {
  const d = parseDate(bMonth + '-01'); d.setMonth(d.getMonth() + 1);
  bMonth = dateStr(d).slice(0, 7); renderBudget();
};


// ================================
// 4. 运动柴柴（力量训练 + 有氧）
// ================================

// 部位分组（想加新部位，在这里加一行）
const PARTS = ['腿臀', '背', '胸', '肩', '手臂', '核心', '有氧', '其他'];

// 三种记录方式
const TYPES = {
  reps:   { label: '重量×次数', unit: '次数' },
  time:   { label: '重量×秒数', unit: '秒数' },
  cardio: { label: '有氧·分钟', unit: '分钟' },
  session:{ label: '打卡·次', unit: '次' }
};

// 第一次打开时的默认动作库（之后可在"管理我的动作库"里随便改）
const DEFAULT_EXERCISES = [
  ['深蹲', '腿臀'], ['弓步', '腿臀'], ['臀推', '腿臀'], ['腿举', '腿臀'], ['罗马尼亚硬拉', '腿臀'], ['硬拉', '腿臀'],
  ['高位下拉', '背'], ['山羊挺身', '背'], ['划船', '背'], ['引体向上', '背'],
  ['卧推', '胸'], ['哑铃飞鸟', '胸'],
  ['肩推', '肩'], ['哑铃肩外旋', '肩'], ['仰卧哑铃支撑', '肩', 'time'], ['侧平举', '肩'],
  ['哑铃颈后臂屈伸', '手臂'], ['二头弯举', '手臂'], ['三头下压', '手臂'],
  ['俄罗斯转体', '核心'], ['平板支撑', '核心', 'time'],
  ['椭圆机', '有氧', 'cardio'], ['骑车', '有氧', 'cardio'], ['跑步机', '有氧', 'cardio'], ['动感单车', '有氧', 'cardio'],
  ['网球', '其他', 'session'], ['瑜伽', '其他', 'session'], ['普拉提', '其他', 'session']
].map(([name, part, type]) => ({ id: uid(), name, part, type: type || 'reps' }));

let lifts = store.get('lifts', []);   // 训练记录：{ id, date, name, type, sets:[{w,r}], minutes, createdAt }
let exercises = store.get('exercises', null);
if (!exercises) {
  exercises = DEFAULT_EXERCISES;
  // 以前练过、但不在默认库里的动作，也放进来
  lifts.forEach(l => {
    if (!exercises.some(e => sameName(e.name, l.name))) {
      exercises.push({ id: uid(), name: l.name, part: '其他', type: l.type || 'reps' });
    }
  });
  store.set('exercises', exercises);
}

// 一次性改名：手机里已经存的旧名字，自动换成新名字（以前的训练记录也一起改）
// 以后想再改名，在下面加一行：[旧名字, 新名字, 新部位]
const RENAMES = [
  ['理疗师手臂伸展', '仰卧哑铃支撑', '肩'],
  ['核心左右绕球', '俄罗斯转体', '核心'],
  ['下背上拉', '山羊挺身', '背']
];
const doneRenames = store.get('mig.renames', store.get('mig.supineHold', false) ? ['理疗师手臂伸展'] : []);
RENAMES.forEach(([oldName, newName, part]) => {
  if (doneRenames.includes(oldName)) return;
  const ex = exercises.find(e => e.name === oldName);
  if (ex && !exercises.some(e => e.name === newName)) Object.assign(ex, { name: newName, part });
  lifts.forEach(l => { if (l.name === oldName) l.name = newName; });
  doneRenames.push(oldName);
});
// 一次性新增：已经在用的手机，也把新加的默认动作补进动作库
const ADDITIONS = [['骑车', '有氧', 'cardio'], ['网球', '其他', 'session'], ['瑜伽', '其他', 'session'], ['普拉提', '其他', 'session']];
const doneAdds = store.get('mig.adds', []);
ADDITIONS.forEach(([name, part, type]) => {
  if (doneAdds.includes(name)) return;
  if (!exercises.some(e => sameName(e.name, name))) exercises.push({ id: uid(), name, part, type });
  doneAdds.push(name);
});
store.set('mig.adds', doneAdds);
store.set('exercises', exercises);
store.set('lifts', lifts);
store.set('mig.renames', doneRenames);

let fDay = todayStr();     // 正在看的那一天
let fEditing = null;       // 正在修改的训练记录
let fType = 'reps';        // 当前记录方式
let fPart = null;          // 当前选中的部位
let libEditing = null;     // 动作库里正在修改的动作

function sameName(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
const findExercise = name => exercises.find(e => sameName(e.name, name));
// 某条记录练的部位（从动作库里查；查不到算"其他"）
const partOf = l => { const e = findExercise(l.name); return e ? e.part : '其他'; };
// 一组记录练了哪些部位，按 PARTS 的顺序排好
const partsOf = items => PARTS.filter(p => items.some(l => partOf(l) === p));
const typeOf = l => l.type || 'reps';
const fmtKg = n => (Math.round(n * 10) / 10).toString();
// 只有"重量×次数"算进总训练量
const volumeOf = l => typeOf(l) === 'reps' ? l.sets.reduce((s, x) => s + x.w * x.r, 0) : 0;
const maxWeight = l => l.sets && l.sets.length ? Math.max(0, ...l.sets.map(x => x.w)) : 0;
function setText(x, type) {
  const w = x.w > 0 ? `${fmtKg(x.w)}kg` : '自重';
  return type === 'time' ? `${w}×${x.r}秒` : `${w}×${x.r}`;
}
function liftSummary(l) {
  if (typeOf(l) === 'session') return ['打卡 1次'];
  return typeOf(l) === 'cardio' ? [`${l.minutes}分钟`] : l.sets.map(s => setText(s, typeOf(l)));
}
const order = x => x.date + '|' + x.createdAt;

function saveLifts() {
  lifts.sort((a, b) => order(a).localeCompare(order(b)));
  store.set('lifts', lifts);
  renderFitness();
}
function saveExercises() { store.set('exercises', exercises); }

// 这个动作在 x 之前的最大重量（判断新纪录，只看"重量×次数"）
function previousBest(x) {
  const before = lifts.filter(l => l.id !== x.id && sameName(l.name, x.name) && typeOf(l) === 'reps' && order(l) < order(x));
  return before.length ? Math.max(...before.map(maxWeight)) : null;
}

function renderFitness() {
  $('f-day').textContent = dayLabel(fDay);
  $('f-next').style.visibility = fDay >= todayStr() ? 'hidden' : 'visible';

  const d = parseDate(fDay);
  const monday = addDays(fDay, -((d.getDay() + 6) % 7));
  const sunday = addDays(monday, 6);
  $('f-week').textContent = new Set(lifts.filter(l => l.date >= monday && l.date <= sunday).map(l => l.date)).size;

  const dayItems = lifts.filter(l => l.date === fDay);
  $('f-count').textContent = dayItems.length;
  $('f-volume').textContent = Math.round(dayItems.reduce((s, l) => s + volumeOf(l), 0)).toLocaleString('en-US');

  const parts = partsOf(dayItems);
  const partsBox = $('f-parts-today');
  partsBox.innerHTML = '';
  parts.forEach(p => partsBox.appendChild(el('span', 'part-pill', p)));
  partsBox.style.display = parts.length ? '' : 'none';

  const list = $('f-list');
  list.innerHTML = '';
  dayItems.forEach(l => {
    const type = typeOf(l);
    const item = el('button', 'item');
    const icon = el('div', 'item-emoji', type === 'cardio' ? '🚴‍♀️' : type === 'time' ? '⏱️' : type === 'session' ? '🧘‍♀️' : '🏋️‍♀️');
    icon.style.background = 'var(--peach)';
    item.appendChild(icon);
    const main = el('div', 'item-main');
    const title = el('div', 'item-title', l.name);
    title.appendChild(el('span', 'part-tag', partOf(l)));
    if (type === 'reps') {
      const best = previousBest(l);
      if (best !== null && maxWeight(l) > best) title.appendChild(el('span', 'pr-badge', '🏆 新纪录'));
    }
    main.appendChild(title);
    const mini = el('div', 'sets-mini');
    liftSummary(l).forEach(t => mini.appendChild(el('span', '', t)));
    main.appendChild(mini);
    item.appendChild(main);
    if (type === 'session') {
      item.appendChild(el('div', 'item-right', '✓'));
    } else if (type === 'cardio') {
      item.appendChild(el('div', 'item-right', `${l.minutes}′`));
    } else {
      const right = el('div', 'item-right', `${l.sets.length}组`);
      if (type === 'reps') right.appendChild(el('small', '', `${Math.round(volumeOf(l))}kg`));
      item.appendChild(right);
    }
    item.onclick = () => openLift(l);
    list.appendChild(item);
  });
  $('f-empty').style.display = dayItems.length ? 'none' : '';

  const hist = $('f-history');
  hist.innerHTML = '';
  const dates = [...new Set(lifts.map(l => l.date))].filter(x => x !== fDay).sort().reverse().slice(0, 10);
  $('f-history-title').style.display = dates.length ? '' : 'none';
  dates.forEach(date => {
    const items = lifts.filter(l => l.date === date);
    const item = el('button', 'item');
    const main = el('div', 'item-main');
    main.appendChild(el('div', 'item-title', dayLabel(date)));
    const partLine = el('div', 'hist-parts');
    partsOf(items).forEach(p => partLine.appendChild(el('span', 'part-tag', p)));
    main.appendChild(partLine);
    main.appendChild(el('div', 'item-sub', items.map(l => l.name).join(' · ')));
    item.appendChild(main);
    item.appendChild(el('div', 'item-right', `${items.length}个动作`));
    item.onclick = () => { fDay = date; renderFitness(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    hist.appendChild(item);
  });
}

// ---- 加动作的弹出层 ----
function setType(type) {
  fType = type;
  document.querySelectorAll('#f-type button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('f-form').classList.toggle('is-cardio', type === 'cardio');
  $('f-form').classList.toggle('is-session', type === 'session');
  $('f-col2').textContent = TYPES[type].unit;
}
document.querySelectorAll('#f-type button').forEach(b => { b.onclick = () => setType(b.dataset.type); });

function addSetRow(w = '', r = '') {
  const box = $('f-sets');
  const row = el('div', 'set-row');
  row.appendChild(el('span', 'no', box.children.length + 1));
  const wIn = el('input'); wIn.type = 'text'; wIn.inputMode = 'decimal'; wIn.placeholder = '0'; wIn.value = w;
  const rIn = el('input'); rIn.type = 'text'; rIn.inputMode = 'numeric'; rIn.placeholder = '0'; rIn.value = r;
  const del = el('button', 'del-x', '✕'); del.type = 'button';
  del.onclick = () => {
    if (box.children.length <= 1) { wIn.value = ''; rIn.value = ''; return; }
    row.remove();
    [...box.children].forEach((rw, i) => { rw.firstChild.textContent = i + 1; });
  };
  row.append(wIn, rIn, del);
  box.appendChild(row);
}
function readSets() {
  return [...$('f-sets').children].map(row => {
    const [w, r] = row.querySelectorAll('input');
    return { w: toNumber(w.value), r: toNumber(r.value), empty: !w.value.trim() && !r.value.trim() };
  });
}
const setsUntouched = () => readSets().every(s => s.empty) && !$('f-min').value.trim();

// 选中/输入动作后：自动切换记录方式，并显示"上次做了多少"
function onNameChosen(fillIfEmpty) {
  const name = $('f-name').value.trim();
  const ex = name ? findExercise(name) : null;
  if (ex) {
    if (!fEditing) setType(ex.type);
    if (fPart !== ex.part) { fPart = ex.part; renderParts(); }
  }
  document.querySelectorAll('#f-quick .chip').forEach(c => c.classList.toggle('on', !!name && sameName(c.textContent, name)));

  const box = $('f-last');
  const others = lifts.filter(l => sameName(l.name, name) && (!fEditing || l.id !== fEditing.id));
  if (!name || !others.length) { box.classList.remove('show'); return; }

  const last = others[others.length - 1];
  box.innerHTML = '';
  box.appendChild(el('div', '', `🐕 上次（${shortDay(last.date)}）：${liftSummary(last).join(' · ')}`));
  if (typeOf(last) === 'reps' || typeOf(last) === 'time') {
    const best = Math.max(...others.filter(l => typeOf(l) === 'reps' || typeOf(l) === 'time').map(maxWeight));
    box.appendChild(el('div', '', `🏆 最大重量：${fmtKg(best)}kg`));
  }
  box.classList.add('show');

  // 新加动作、还没填数字时：照上次填好，你只要改数字
  if (fillIfEmpty && !fEditing && setsUntouched() && typeOf(last) === fType) {
    if (fType === 'cardio') $('f-min').value = last.minutes;
    else if (fType === 'session') { /* 打卡不用填 */ }
    else { $('f-sets').innerHTML = ''; last.sets.forEach(s => addSetRow(fmtKg(s.w), s.r)); }
  }
}
$('f-name').addEventListener('input', () => onNameChosen(false));
$('f-name').addEventListener('change', () => onNameChosen(true));

function renderParts() {
  const box = $('f-parts');
  box.innerHTML = '';
  PARTS.filter(p => exercises.some(e => e.part === p)).forEach(p => {
    const b = el('button', p === fPart ? 'on' : '', p); b.type = 'button';
    b.onclick = () => { fPart = p; renderParts(); };
    box.appendChild(b);
  });
  // 选中的部位如果在屏幕外，自动滑过去
  const on = box.querySelector('.on');
  if (on) box.scrollLeft = Math.max(0, on.offsetLeft - box.offsetLeft - 20);
  renderQuick();
}
function renderQuick() {
  const box = $('f-quick');
  box.innerHTML = '';
  const name = $('f-name').value.trim();
  exercises.filter(e => e.part === fPart).forEach(e => {
    const chip = el('button', 'chip' + (name && sameName(e.name, name) ? ' on' : ''), e.name); chip.type = 'button';
    chip.onclick = () => { $('f-name').value = e.name; onNameChosen(true); };
    box.appendChild(chip);
  });
}

function openLift(l) {
  fEditing = l || null;
  $('f-sheet-title').textContent = l ? '修改动作' : '加一个动作';
  $('f-name').value = l ? l.name : '';
  $('f-sets').innerHTML = '';
  $('f-min').value = l && typeOf(l) === 'cardio' ? l.minutes : '';
  if (l && l.sets && l.sets.length) l.sets.forEach(s => addSetRow(fmtKg(s.w), s.r));
  else addSetRow();
  setType(l ? typeOf(l) : 'reps');
  // 默认显示：正在改的动作所在部位 / 最近练过的部位 / 第一个部位
  const ref = l ? findExercise(l.name) : (lifts.length ? findExercise(lifts[lifts.length - 1].name) : null);
  fPart = ref ? ref.part : (exercises[0] ? exercises[0].part : PARTS[0]);
  $('f-error').textContent = '';
  $('f-delete').classList.toggle('show', !!l);
  renderParts();
  onNameChosen(false);
  openSheet('f-sheet');
}

$('f-add').onclick = () => openLift(null);

$('f-addset').onclick = () => {
  const sets = readSets();
  const last = sets[sets.length - 1];
  addSetRow(last && isFinite(last.w) ? fmtKg(last.w) : '', last && isFinite(last.r) ? last.r : '');
};

$('f-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('f-name').value.trim();
  if (!name) { $('f-error').textContent = '请选择或填写一个动作'; return; }

  const data = { name, type: fType };
  if (fType === 'session') {
    data.sets = [];
    delete data.minutes;
  } else if (fType === 'cardio') {
    const min = toNumber($('f-min').value);
    if (!isFinite(min) || min <= 0) { $('f-error').textContent = '请填写分钟数，比如 45'; return; }
    data.minutes = Math.round(min);
    data.sets = [];
  } else {
    const raw = readSets().filter(s => !s.empty);
    if (!raw.length) { $('f-error').textContent = '至少填一组'; return; }
    if (raw.some(s => !isFinite(s.r) || s.r <= 0 || !Number.isInteger(s.r))) {
      $('f-error').textContent = `每组的${TYPES[fType].unit}要填一个整数，比如 ${fType === 'time' ? 30 : 10}`; return;
    }
    // 重量不填 = 自重
    data.sets = raw.map(s => ({ w: isFinite(s.w) && s.w > 0 ? Math.round(s.w * 10) / 10 : 0, r: s.r }));
    delete data.minutes;
  }

  // 新名字自动加进动作库（放在当前选中的部位）
  if (!findExercise(name)) {
    exercises.push({ id: uid(), name, part: fType === 'cardio' ? '有氧' : fType === 'session' ? '其他' : (fPart || '其他'), type: fType });
    saveExercises();
  }

  if (fEditing) { Object.assign(fEditing, data); if (fType !== 'cardio') delete fEditing.minutes; }
  else lifts.push({ id: uid(), date: fDay, createdAt: String(Date.now()), ...data });
  saveLifts();
  closeSheet('f-sheet');
});

$('f-delete').onclick = () => {
  if (!fEditing) return;
  if (!confirm(`确定删除「${fEditing.name}」这条记录吗？`)) return;
  lifts = lifts.filter(l => l.id !== fEditing.id);
  saveLifts();
  closeSheet('f-sheet');
};

$('f-prev').onclick = () => { fDay = addDays(fDay, -1); renderFitness(); };
$('f-next').onclick = () => { fDay = addDays(fDay, 1); renderFitness(); };

// ---- 我的动作库 ----
PARTS.forEach(p => { const o = el('option', '', '部位：' + p); o.value = p; $('lib-part').appendChild(o); });

function resetLibForm() {
  libEditing = null;
  $('lib-edit-title').textContent = '➕ 添加新动作';
  $('lib-save').textContent = '添加';
  $('lib-name').value = '';
  $('lib-part').value = fPart || PARTS[0];
  $('lib-type').value = 'reps';
  $('lib-error').textContent = '';
  $('lib-cancel').classList.remove('show');
}

function renderLibrary() {
  const box = $('lib-list');
  box.innerHTML = '';
  PARTS.forEach(p => {
    const items = exercises.filter(e => e.part === p);
    if (!items.length) return;
    box.appendChild(el('div', 'lib-group', `${p}（${items.length}）`));
    items.forEach(e => {
      const row = el('div', 'lib-item');
      const nameBtn = el('button', 'lib-name', e.name); nameBtn.type = 'button';
      nameBtn.appendChild(el('span', 'lib-type', TYPES[e.type].label));
      nameBtn.onclick = () => {
        libEditing = e;
        $('lib-edit-title').textContent = `✏️ 修改「${e.name}」`;
        $('lib-save').textContent = '保存修改';
        $('lib-name').value = e.name;
        $('lib-part').value = e.part;
        $('lib-type').value = e.type;
        $('lib-error').textContent = '';
        $('lib-cancel').classList.add('show');
        $('lib-sheet').querySelector('.sheet').scrollTo({ top: 0, behavior: 'smooth' });
      };
      const del = el('button', 'del-x', '✕'); del.type = 'button';
      del.onclick = () => {
        if (!confirm(`从动作库删除「${e.name}」？\n以前的训练记录会保留。`)) return;
        exercises = exercises.filter(x => x.id !== e.id);
        saveExercises();
        if (libEditing === e) resetLibForm();
        renderLibrary();
      };
      row.append(nameBtn, del);
      box.appendChild(row);
    });
  });
}

$('f-manage').onclick = () => { resetLibForm(); renderLibrary(); openSheet('lib-sheet'); };
$('lib-cancel').onclick = resetLibForm;

$('lib-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('lib-name').value.trim();
  const part = $('lib-part').value;
  const type = $('lib-type').value;
  if (!name) { $('lib-error').textContent = '请填写动作名称'; return; }
  const dup = findExercise(name);
  if (dup && dup !== libEditing) { $('lib-error').textContent = '动作库里已经有这个名字了'; return; }

  if (libEditing) {
    const oldName = libEditing.name;
    Object.assign(libEditing, { name, part, type });
    // 改了名字：以前的训练记录也跟着改，这样"上次成绩"还能对上
    if (!sameName(oldName, name)) {
      lifts.forEach(l => { if (sameName(l.name, oldName)) l.name = name; });
      store.set('lifts', lifts);
    }
  } else {
    exercises.push({ id: uid(), name, part, type });
  }
  saveExercises();
  resetLibForm();
  renderLibrary();
  renderFitness();
});

// 关掉动作库时，刷新加动作页面里的按钮
$('lib-sheet').addEventListener('click', e => {
  if (e.target.id === 'lib-sheet' || e.target.closest('[data-close]')) {
    if (!PARTS.includes(fPart) || !exercises.some(x => x.part === fPart)) fPart = exercises[0] ? exercises[0].part : PARTS[0];
    renderParts();
    onNameChosen(false);
  }
});


// ================================
// 5. 风电早报（由 Claude 每个工作日早上写好，放在 briefing/ 文件夹）
// ================================
let nIndex = [];          // 所有期数的日期列表（新的在前）
let nPos = 0;             // 正在看第几期
let nRegion = '全部';
let nData = null;
const REGIONS = ['全部', '德国', '土耳其', '欧洲', '美国', '中国'];
const REGION_CLASS = { '德国': 'de', '土耳其': 'tr', '欧洲': 'eu', '美国': 'us', '中国': 'cn' };

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function loadBriefing(pos) {
  try {
    if (!nIndex.length) {
      const idx = await loadJSON('briefing/index.json');
      nIndex = (idx.dates || []).slice().sort().reverse();
    }
    if (!nIndex.length) throw new Error('empty');
    nPos = Math.max(0, Math.min(pos, nIndex.length - 1));
    nData = await loadJSON(`briefing/${nIndex[nPos]}.json`);
  } catch (e) {
    nData = null;
  }
  if (nMode === 'wind') renderBriefing();
}

function renderBriefing() {
  $('n-prev').style.visibility = nPos < nIndex.length - 1 ? 'visible' : 'hidden';
  $('n-next').style.visibility = nPos > 0 ? 'visible' : 'hidden';
  $('n-date').textContent = nData ? dayLabel(nData.date) : '风电早报';

  const filter = $('n-filter');
  filter.innerHTML = '';
  REGIONS.forEach(r => {
    const count = nData ? (r === '全部' ? nData.items.length : nData.items.filter(i => i.region === r).length) : 0;
    if (r !== '全部' && nData && count === 0 && r !== nRegion) return; // 这期没有的地区不显示
    const b = el('button', r === nRegion ? 'on' : '', `${r === '欧洲' ? '欧洲其他' : r} ${count}`);
    b.onclick = () => { nRegion = r; renderBriefing(); };
    filter.appendChild(b);
  });

  const list = $('n-list');
  list.innerHTML = '';
  const items = nData ? nData.items.filter(i => nRegion === '全部' || i.region === nRegion) : [];
  items.forEach(it => list.appendChild(newsCard(it)));

  $('n-empty').style.display = items.length ? 'none' : '';
  $('n-empty-text').innerHTML = nData ? '这个地区今天没有大新闻' : '早报还没到～<br>工作日早上 6 点前更新';
}

// 一条新闻卡片（风电新闻和电价新闻共用）
function newsCard(it) {
    const card = el('article', 'news');
    const head = el('div', 'news-head');
    head.appendChild(el('span', 'region-tag region-' + (REGION_CLASS[it.region] || 'x'), it.region === '欧洲' ? '欧洲其他' : it.region));
    if (it.country) head.appendChild(el('span', 'news-country', it.country));
    card.appendChild(head);

    // 标题：英文一行、中文一行
    card.appendChild(el('h3', 'news-title-en', it.title.en));
    card.appendChild(el('div', 'news-title-zh', it.title.zh));

    // 摘要：逐句对照（一句英文，紧跟一句中文）
    const body = el('div', 'news-body');
    it.sentences.forEach(p => {
      const pair = el('div', 'pair');
      pair.appendChild(el('p', 'en', p.en));
      pair.appendChild(el('p', 'zh', p.zh));
      body.appendChild(pair);
    });
    card.appendChild(body);

    // 三个小框：行业解读 / 整机商视角 / 业务注意
    const takeBox = (data, cls, label, bullets) => {
      if (!data) return;
      const list = (Array.isArray(data) ? data : [data]).filter(p => p && (p.en || p.zh));
      if (!list.length) return;
      const box = el('div', 'insight ' + cls);
      box.appendChild(el('div', 'insight-label', label));
      list.forEach(p => {
        const pair = el('div', bullets ? 'pair bullet' : 'pair');
        pair.appendChild(el('p', 'en', p.en || ''));
        pair.appendChild(el('p', 'zh', p.zh || ''));
        box.appendChild(pair);
      });
      card.appendChild(box);
    };
    takeBox(it.insight, 'take-industry', '💡 行业解读 Industry take', false);
    takeBox(it.oem, 'take-oem', '🏭 整机商视角 OEM view', false);
    takeBox(it.watch, 'take-watch', '⚠️ 业务注意 Business watch-outs', true);

    // 来源链接
    if (it.url) {
      const a = el('a', 'news-src', `🔗 ${it.source || '原文'}${it.published ? ' · ' + it.published : ''}`);
      a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
      card.appendChild(a);
    }

    // 问 Claude：打字 → 点发送 → 打开 Claude，新闻内容已自动带上
    card.appendChild(askClaudeBox(it));
    return card;
}

// 把一条新闻 + 你的问题拼成一段话，交给 Claude
function claudePrompt(it, question) {
  const lines = [
    '我在看早报里的一条新闻：',
    '',
    `标题：${it.title.en}（${it.title.zh}）`,
    ...it.sentences.map(p => p.en),
  ];
  if (it.url) lines.push(`来源：${it.url}`);
  lines.push('', question ? `我的问题：${question}` : '我的问题：', '', '请用中文回答，专业名词附上英文。');
  return lines.join('\n');
}

function askClaudeBox(it) {
  const box = el('div', 'ask-claude');
  const input = el('textarea', 'ask-input');
  input.rows = 1;
  input.placeholder = '有疑问？在这里打字…';
  input.oninput = () => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; };
  const btn = el('button', 'ask-btn', '问 Claude');
  const tip = el('div', 'ask-tip', '');
  btn.onclick = () => {
    const text = claudePrompt(it, input.value.trim());
    // 同时复制一份：万一 Claude 没自动填好，长按输入框“粘贴”即可
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank', 'noopener');
    tip.textContent = '已打开 Claude（内容也已复制，没自动填好就长按粘贴）';
    input.value = ''; input.style.height = 'auto';
  };
  const row = el('div', 'ask-row');
  row.appendChild(input);
  row.appendChild(btn);
  box.appendChild(row);
  box.appendChild(tip);
  return box;
}

// 早报里的两个模式：风电新闻 / 电价（左右箭头在两个模式下分别翻对应的期数）
let nMode = 'wind';
$('n-prev').onclick = () => nMode === 'price' ? loadPrices(pPos + 1) : loadBriefing(nPos + 1);
$('n-next').onclick = () => nMode === 'price' ? loadPrices(pPos - 1) : loadBriefing(nPos - 1);
document.querySelectorAll('#n-mode button').forEach(b => {
  b.onclick = () => setBriefMode(b.dataset.mode);
});

function setBriefMode(mode) {
  nMode = mode;
  document.querySelectorAll('#n-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  const isPrice = mode === 'price';
  $('n-filter').style.display = isPrice ? 'none' : '';
  $('n-list').style.display = isPrice ? 'none' : '';
  $('p-wrap').style.display = isPrice ? '' : 'none';
  $('n-sub').textContent = isPrice ? '⚡ 电价周报 Power prices · 每周一更新' : '🌬️ 陆上风电 Onshore Wind · 欧洲 · 美国 · 中国';
  if (isPrice) {
    $('n-empty').style.display = 'none';
    if (pData) renderPrices(); else loadPrices(0);
  } else {
    renderBriefing();
  }
}


// ================================
// 6. 电价板块（Claude 每周一更新，放在 prices/ 文件夹）
// ================================
let pIndex = [];
let pPos = 0;
let pData = null;
let pLessons = null;
let pType = 'household';
let pUnit = 'ct';
let pCountry = 'DE';
let pOpen = '';           // 展开说明的那一行
try {
  pType = localStorage.getItem('p-type') || pType;
  pUnit = localStorage.getItem('p-unit') || pUnit;
  pCountry = localStorage.getItem('p-country') || pCountry;
} catch (e) {}
const P_TYPES = ['wholesale', 'household', 'industrial', 'auction'];
const P_COLOR = { wholesale: 'w', household: 'h', industrial: 'i', auction: 'a' };

async function loadPrices(pos) {
  try {
    if (!pIndex.length) {
      const idx = await loadJSON('prices/index.json');
      pIndex = (idx.dates || []).slice().sort().reverse();
    }
    if (!pIndex.length) throw new Error('empty');
    pPos = Math.max(0, Math.min(pos, pIndex.length - 1));
    pData = await loadJSON(`prices/${pIndex[pPos]}.json`);
  } catch (e) {
    pData = null;
  }
  if (!pLessons) {
    try { pLessons = (await loadJSON('prices/lessons.json')).lessons || []; } catch (e) { pLessons = []; }
  }
  if (nMode === 'price') renderPrices();
}

function pSave(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

// 数字显示：数据统一按 €/MWh 存，显示时按开关换算
function pFmt(v) {
  if (pUnit === 'ct') return (v / 10).toFixed(1);
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
}
function pUnitLabel() { return pUnit === 'ct' ? 'ct/kWh' : '€/MWh'; }
function pYuan(v) {
  const r = pData && pData.fx && pData.fx.CNY;
  return r ? `≈${(v / 1000 * r).toFixed(2)}元/度` : '';
}
function pTop(it) { return it.value != null ? it.value : (it.high != null ? it.high : -1); }

// 画一行横条：国家（或电价类型）· 条 · 数字；点一下展开来源说明
function pRow(label, it, max, color, key) {
  const row = el('div', 'p-row');
  const main = el('div', 'p-row-main');
  main.appendChild(el('div', 'p-label', label));
  const track = el('div', 'p-track');
  const valBox = el('div', 'p-val');
  if (it && it.value != null) {
    const fill = el('div', 'p-fill c-' + color);
    fill.style.width = Math.max(2, it.value / max * 100) + '%';
    track.appendChild(fill);
    valBox.appendChild(el('div', 'p-num', pFmt(it.value)));
    valBox.appendChild(el('div', 'p-cny', pYuan(it.value)));
  } else if (it && it.low != null) {
    const fill = el('div', 'p-fill range c-' + color);
    fill.style.marginLeft = (it.low / max * 100) + '%';
    fill.style.width = Math.max(2, (it.high - it.low) / max * 100) + '%';
    track.appendChild(fill);
    valBox.appendChild(el('div', 'p-num', `${pFmt(it.low)}–${pFmt(it.high)}`));
    valBox.appendChild(el('div', 'p-cny', '各地不同'));
  } else {
    track.classList.add('p-empty');
    track.appendChild(el('span', 'p-none', '暂无可比数据'));
    valBox.appendChild(el('div', 'p-num muted', '—'));
  }
  main.appendChild(track);
  main.appendChild(valBox);
  row.appendChild(main);

  if (it) {
    const det = el('div', 'p-detail');
    const bits = [];
    if (it.period && it.period !== '—') bits.push(it.period);
    if (it.orig) bits.push('原始数据 ' + it.orig);
    if (bits.length) det.appendChild(el('div', '', bits.join(' · ')));
    if (it.note) det.appendChild(el('div', '', it.note));
    if (it.url) {
      const a = el('a', 'news-src', '🔗 ' + (it.source || '来源'));
      a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
      det.appendChild(a);
    }
    det.style.display = pOpen === key ? '' : 'none';
    row.appendChild(det);
    main.onclick = () => { pOpen = pOpen === key ? '' : key; renderPrices(); };
  }
  return row;
}

function renderPrices() {
  $('n-prev').style.visibility = pPos < pIndex.length - 1 ? 'visible' : 'hidden';
  $('n-next').style.visibility = pPos > 0 ? 'visible' : 'hidden';
  $('n-date').textContent = pData ? '电价周报 · ' + dayLabel(pData.date) : '电价周报';
  if (!pData) {
    $('p-wrap').style.display = 'none';
    $('n-empty').style.display = '';
    $('n-empty-text').innerHTML = '电价周报还没到～<br>每周一早上更新';
    return;
  }
  $('p-wrap').style.display = '';
  $('n-empty').style.display = 'none';
  const S = pData.series;
  const C = {};
  pData.countries.forEach(c => C[c.code] = c);
  if (!S[pType]) pType = 'household';
  if (!C[pCountry]) pCountry = pData.countries[0].code;

  // 单位开关
  document.querySelectorAll('#p-unit button').forEach(b => {
    b.classList.toggle('on', b.dataset.unit === pUnit);
    b.onclick = () => { pUnit = b.dataset.unit; pSave('p-unit', pUnit); renderPrices(); };
  });

  // 电价类型
  const types = $('p-types');
  types.innerHTML = '';
  P_TYPES.forEach(t => {
    if (!S[t]) return;
    const b = el('button', (t === pType ? 'on ' : '') + 'c-' + P_COLOR[t], S[t].zh);
    b.onclick = () => { pType = t; pOpen = ''; pSave('p-type', t); renderPrices(); };
    types.appendChild(b);
  });
  const s = S[pType];
  $('p-what').textContent = `${s.en}｜${s.what}（单位 ${pUnitLabel()}）`;

  // 各国对比
  const bars = $('p-bars');
  bars.innerHTML = '';
  const items = s.items.slice().sort((a, b) => pTop(b) - pTop(a));
  const max = Math.max(...items.map(pTop), 1);
  items.forEach(it => {
    const c = C[it.code] || { flag: '', zh: it.code };
    bars.appendChild(pRow(`${c.flag} ${c.zh}`, it, max, P_COLOR[pType], 'c-' + it.code));
  });

  // 一个国家的四种电价
  const cs = $('p-countries');
  cs.innerHTML = '';
  pData.countries.forEach(c => {
    const b = el('button', c.code === pCountry ? 'on' : '', `${c.flag} ${c.zh}`);
    b.onclick = () => { pCountry = c.code; pOpen = ''; pSave('p-country', c.code); renderPrices(); };
    cs.appendChild(b);
  });
  const stack = $('p-stack');
  stack.innerHTML = '';
  const rows = P_TYPES.filter(t => S[t]).map(t => [t, S[t].items.find(i => i.code === pCountry)]);
  const smax = Math.max(...rows.map(r => r[1] ? pTop(r[1]) : 0), 1);
  ['auction', 'wholesale', 'industrial', 'household'].forEach(t => {
    const r = rows.find(x => x[0] === t);
    if (r) stack.appendChild(pRow(t === 'auction' ? '风电中标' : S[t].zh, r[1], smax, P_COLOR[t], 's-' + t));
  });

  // 小课堂
  const ls = $('p-lessons');
  ls.innerHTML = '';
  (pLessons || []).forEach(l => {
    const d = document.createElement('details');
    d.className = 'p-lesson';
    const sum = document.createElement('summary');
    sum.appendChild(el('span', 'p-l-icon', l.icon || '📘'));
    const t = el('span', 'p-l-title', l.title);
    t.appendChild(el('span', 'p-l-en', l.en || ''));
    sum.appendChild(t);
    d.appendChild(sum);
    const ul = el('ul', 'p-l-points');
    (l.points || []).forEach(p => ul.appendChild(el('li', '', p)));
    d.appendChild(ul);
    if (l.example) d.appendChild(el('div', 'p-l-example', '🌰 举个例子：' + l.example));
    ls.appendChild(d);
  });

  // 电价新闻
  const nl = $('p-news');
  nl.innerHTML = '';
  (pData.news || []).forEach(it => nl.appendChild(newsCard(it)));
  if (!(pData.news || []).length) nl.appendChild(el('div', 'p-what', '这周没有大的电价新闻'));

  const fx = pData.fx;
  $('p-foot').textContent = fx ? `汇率：1 欧元 = ${fx.USD} 美元 = ${fx.CNY} 元 = ${fx.TRY} 里拉（${fx.date}，${fx.source}）` : '';
}


const APP_VERSION = 'v19';

// ================================
// 启动
// ================================
showPage();
$('app-version').textContent = 'Daily ' + APP_VERSION;
renderTodos();
renderBudget();
renderFitness();
loadBriefing(0);
fetchRates(); // 顺手更新一次汇率（没网也没关系）

// 离线可用
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  // 有新版本接管时，自动刷新一次，马上用上新版
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}
