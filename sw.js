/* Service Worker - 离线缓存 + 推送通知 */

const CACHE_NAME = 'word-flash-v2';

// 需要即时更新的核心文件（network-first）
const NETWORK_FIRST = ['/', './', 'index.html', 'js/app.js', 'js/ui.js'];

// 请求拦截：JS/HTML 走 network-first，其余走 cache-first
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  const path = url.pathname.replace(self.registration.scope, '/');
  const isNetworkFirst = NETWORK_FIRST.some(p => path === p || path.endsWith('/' + p));

  if (isNetworkFirst) {
    // Network-first：优先网络，失败才用缓存
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first：优先缓存，失败才走网络
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

// 安装事件：仅声明激活，不预缓存（network-first 运行时自动缓存）
self.addEventListener('install', () => {
  self.skipWaiting();
});

// 激活事件：清理所有旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
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
  event.waitUntil(self.registration.showNotification(title, options));
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
