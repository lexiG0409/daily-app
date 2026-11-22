// ================================
// Daily App —— 主程序
// ================================

// ---------- 1. 切换页面 ----------
// 网址后面的 #budget / #fitness / #todo 决定显示哪一页
const PAGES = ['budget', 'fitness', 'todo'];

function showPage() {
  let name = location.hash.replace('#', '');
  if (!PAGES.includes(name)) name = 'budget'; // 默认打开记账

  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === 'page-' + name);
  });
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === name);
  });

  const page = document.getElementById('page-' + name);
  document.getElementById('page-title').textContent = page.dataset.title;
}

window.addEventListener('hashchange', showPage);
showPage();

// ---------- 2. 显示今天日期 ----------
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const now = new Date();
document.getElementById('today').textContent =
  `${now.getMonth() + 1}月${now.getDate()}日 · 星期${WEEKDAYS[now.getDay()]}`;

// ---------- 3. 本地存储（数据只存在你自己的手机里） ----------
// 之后记账、运动、待办都会用这两个小工具来保存和读取
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('daily.' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('daily.' + key, JSON.stringify(value));
    } catch (e) {
      console.warn('保存失败', e);
    }
  }
};

// ---------- 4. 离线可用 ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
