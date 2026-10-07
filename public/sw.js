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

// Push services can rotate or expire a subscription at any time (FCM,
// Mozilla autopush and Apple all do). Without this handler the server
// keeps the dead endpoint, gets 410 on the next send, deletes it, and the
// device silently stops receiving notices. Resubscribe with the same key
// and hand the new endpoint to the server; if this can't complete (e.g.
// the session cookie has expired), the next visit to the family page
// re-syncs instead — see lib/push/client.ts.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldSubscription = event.oldSubscription || null;
      let newSubscription = event.newSubscription || null;
      if (!newSubscription) {
        const applicationServerKey = oldSubscription?.options?.applicationServerKey;
        if (!applicationServerKey) return;
        newSubscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      await fetch("/api/push/resubscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldEndpoint: oldSubscription?.endpoint || null,
          subscription: newSubscription.toJSON(),
        }),
      });
    })().catch(() => {})
  );
});
