// 离线小助手：把 app 的文件存一份在手机里，没网也能打开。
// 每次更新 app 文件后，把下面的版本号 +1，手机就会拿到新版本。
const VERSION = 'daily-v25';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'img/pig.svg',
  'img/shiba.svg',
  'img/cat.svg',
  'img/bear.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 先尝试联网拿最新的；没网时用存好的那份
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 只管 app 自己的文件；汇率等外部网站的请求不存
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    // cache: 'no-cache' = 每次都问一下服务器"有没有新版本"，不用等 10 分钟
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
