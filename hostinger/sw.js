/* Sternenzauber: zeigt SOS-Mitteilungen an, auch wenn die App geschlossen ist. Speichert nichts zwischen. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Sternenzauber: SOS', {
    body: d.body || 'Neue SOS-Meldung', tag: d.tag || 'sos', renotify: true, requireInteraction: true,
    icon: 'icon-192.png', badge: 'favicon-32.png', vibrate: [250, 120, 250], data: { url: d.url || './?tab=sos' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './?tab=sos', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.postMessage({ tab: 'sos' }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
