// Minimal Web Push service worker. Payloads are intentionally generic —
// no student name or notice content is ever sent in the push message
// itself (see lib/push/send.ts) — so this fallback text only covers the
// case where a push arrives with no payload at all.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Alimi";
  const options = {
    body: data.body || "You have a new notice.",
    icon: "/icons/alimi-192.png",
    badge: "/icons/alimi-192.png",
    tag: data.tag || "alimi-notice",
    data: { url: data.url || "/app/family" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/family";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
