// BriqueOS Service Worker v1.0
const CACHE = 'briqueos-v1';
const STATIC = [
  './',
  './index.html',
  './login.html',
  './perfil.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap'
];

// ── INSTALL ─────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {}) // Don't fail install if fonts are offline
  );
  self.skipWaiting();
});

// ── ACTIVATE ────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network for API calls
  if (url.hostname === 'localhost' || url.pathname.startsWith('/auth') || url.pathname.startsWith('/compras') || url.pathname.startsWith('/vendas')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ detail: 'Sem conexão com o servidor' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Network-first for HTML pages
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for fonts and static assets
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        }).catch(() => new Response('', { status: 408 }));
      })
  );
});

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'BriqueOS', {
      body: data.body || '',
      icon: data.icon || './manifest.json',
      badge: data.badge || '',
      data: data.url || '/',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const c = cs.find(w => w.url.includes('index.html'));
      if (c) { c.focus(); } else { clients.openWindow('./index.html'); }
    })
  );
});
