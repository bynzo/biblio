self.addEventListener('install', e => {
    e.waitUntil(
        caches.open('book-scanner-v1').then(cache =>
            cache.addAll([
                './',
                './index.html',
                './manifest.json',
                './icon-192.png',
                './icon-512.png'
                // DO NOT add external URLs here
            ])
        ).catch(err => console.error("Cache install error:", err))
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});
