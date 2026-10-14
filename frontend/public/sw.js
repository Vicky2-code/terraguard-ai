/* TerraGuard AI — service worker.
 *
 * Two jobs:
 *  1. Offline app shell: network-first, fall back to cache when the network is
 *     gone, so the command center still loads offline.
 *  2. Show system notifications for real-time alerts, including while the tab
 *     is in the background, and focus/open the Early Alerts page on click.
 *
 * Nothing is pushed from a server (no Web Push / VAPID). The page posts a
 * message to this worker, which renders the notification locally — so it works
 * online and offline once the app has been opened and permission granted.
 */

const CACHE = "terraguard-shell-v1";
const SHELL = ["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Cache each shell entry independently so one miss cannot block the rest.
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Never touch cross-origin traffic (e.g. the API on Render) or API calls.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Network-first so development / HMR and fresh builds are never stale;
  // fall back to the cached shell only when the network fails (offline).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "notify") return;
  const title = data.title || "TerraGuard AI";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    vibrate: [120, 60, 120],
    requireInteraction: false,
    data: { url: data.url || "/early-alerts" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/early-alerts";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) {
              try {
                client.navigate(target);
              } catch {
                /* some clients refuse navigate; focus anyway */
              }
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
