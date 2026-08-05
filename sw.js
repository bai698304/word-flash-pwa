/* Service Worker - 离线缓存 + 推送通知 */

const CACHE_NAME = 'word-flash-v1';

// 预缓存所有静态文件
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/parser.js',
  '/js/sm2.js',
  '/js/store.js',
  '/js/ui.js',
  '/js/stats.js'
];

// 安装事件：预缓存静态资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 预缓存静态文件');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // 立即激活，不等待旧 SW
  self.skipWaiting();
});

// 激活事件：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先，离线兜底
self.addEventListener('fetch', event => {
  // 跳过 IndexedDB 等非 HTTP 请求
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // 命中缓存直接返回
      if (cached) return cached;

      // 网络请求，成功后加入缓存
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;

        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // 离线时返回 index.html（SPA 兜底）
        return caches.match('/index.html');
      });
    })
  );
});

// 推送事件：显示复习提醒通知
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '词汇闪卡';
  const options = {
    body: data.body || '今日有单词待复习，快来刷词吧！',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="%231a73e8"/><text x="96" y="110" font-size="80" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold">W</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="%231a73e8"/><text x="96" y="110" font-size="80" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold">W</text></svg>',
    data: { url: '/' },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 通知点击：打开应用
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        clients.openWindow('/');
      }
    })
  );
});
