# Real-Time Alert Notifications (Online + Offline)

TerraGuard AI raises alert notifications **automatically** — an operator does not
have to click anything. A pop-up (in-app toast + optional system notification +
optional chime) appears on its own, both when the site is **online** and when the
browser is **offline**.

This document explains what was built and exactly how the online and offline
paths work. It is written so it can be pasted into a report or used to brief a
jury.

---

## 1. What the feature does

| Channel | What the user sees | Works online | Works offline |
|---|---|---|---|
| In-app toast (bottom-right) | Coloured alert card that slides in | ✅ | ✅ |
| System notification | OS/browser notification pop-up | ✅ (permission granted) | ✅ (permission granted) |
| Audible chime | Short two/three-tone beep | ✅ | ✅ |
| Notification bell (header) | Unread badge + history list | ✅ | ✅ |

Two kinds of alerts are surfaced:

1. **Real, server-generated alerts** — whenever the backend raises an alert
   (scheduled threshold evaluation, incident intake, or the emergency
   simulation), it is broadcast over Server-Sent Events (SSE) and every
   connected browser pops a notification.
2. **Automatic demo alerts** — an always-on cadence inside the app raises an
   alert every 30 seconds by itself so the pipeline is visibly working even
   when no natural threshold is crossed during a demo.

Everything in category 2 is explicitly labelled `SIMULATED_LOCAL`. No SMS,
email, siren or remote push is ever sent — this is honestly a simulation.

---

## 2. Architecture at a glance

```
                         ONLINE PATH
  ┌──────────────┐   POST /api/alerts/dispatch   ┌──────────────┐
  │  Browser     │ ────────────────────────────► │  FastAPI     │
  │ (auto engine)│                               │  backend     │
  │              │ ◄──── SSE: alert_created ──── │  (events bus)│
  └──────┬───────┘                               └──────────────┘
         │ emit()
         ▼
   toast + system notification + chime

                         OFFLINE PATH
  ┌──────────────┐
  │  Browser     │  no network needed
  │ (auto engine)│  builds a SIMULATED_LOCAL alert locally
  └──────┬───────┘
         │ emit()
         ▼
   toast + system notification + chime
```

Key files:

- `backend/app/routes/alerts.py` — `POST /api/alerts/dispatch` (creates, stores
  and broadcasts a labelled alert).
- `backend/app/events.py` — in-process SSE broker (`publish` / `subscribe`).
- `backend/app/routes/stream.py` — `GET /api/stream` (SSE endpoint).
- `frontend/src/lib/notifications.tsx` — the automatic alert engine + provider.
- `frontend/src/components/NotificationBell.tsx` — header UI.
- `frontend/public/sw.js` — service worker (background notifications + offline
  app shell).
- `frontend/src/hooks/useLive.tsx` — the SSE client that feeds the app.

---

## 3. The automatic engine (no button required)

`NotificationProvider` runs a timer while the app is open (`Auto alerts` is ON
by default, persisted in `localStorage` under `tg_notify_auto`):

- First alert fires **8 seconds** after load (so a demo shows something quickly),
  then **every 30 seconds**.
- Each tick calls `triggerAuto()`:
  - **Online** → `dispatchRemote("auto_scheduler")` → `POST /api/alerts/dispatch`.
  - **Offline** (or the request fails) → `emitOffline()` builds a local
    `OFFLINE · SIMULATED_LOCAL` alert.
- A per-session cap (`60`) prevents runaway alerts.

The cadence and toggles live in the bell menu. The manual **Send test alert**
button is still there for an instant, on-demand pop during a live demo.

---

## 4. HOW IT WORKS — ONLINE

1. **The trigger.** Either the app's auto cadence calls
   `POST /api/alerts/dispatch`, or a backend job (threshold evaluation / incident
   / scenario) creates an alert.
2. **Server side.** `dispatch_alert()` picks a location, creates an `Alert` row
   flagged `simulation=True`, `delivery_status="SIMULATED_LOCAL"`, commits it,
   then calls `broker.publish("alert_created", data)`.
3. **Broadcast.** The SSE broker pushes the event to every subscriber queue;
   `GET /api/stream` writes it to each connected browser as an SSE frame.
4. **Client side.** `useLive()` receives the event and updates `lastEvent`. The
   notification provider sees `lastEvent.type === "alert_created"` and calls
   `emit(...)`.
5. **Presentation.** `emit()` does three things at once:
   - pushes an in-app toast (auto-dismiss ~9 s),
   - if permission is granted, shows a **system notification** via the service
     worker (`registration.showNotification`),
   - plays a short chime (Web Audio, no asset).
6. **Deduplication.** Each alert id is remembered in a `Set`; if the same alert
   also arrives over SSE after being emitted from the HTTP response, it is
   ignored — so exactly one pop-up per alert.

Because step 3 is a real broadcast, opening the site on two devices shows the
same alert on both — which is a strong thing to demonstrate to a jury.

---

## 5. HOW IT WORKS — OFFLINE

Offline means **no network to the backend**. Two things still work:

### 5.1 The app still loads (service worker app shell)

`frontend/public/sw.js` is a service worker registered in `main.tsx`. Its fetch
handler is **network-first with a cache fallback**:

- When online it always fetches fresh (dev/HMR and new builds are never stale).
- When the network fails (offline), it serves the cached shell (`index.html`,
  `favicon.svg`, `manifest.webmanifest`, and any assets already fetched), so the
  command center UI still opens with no connection.

### 5.2 Alerts are still generated (locally)

The automatic engine notices the browser is offline in two ways:

- `navigator.onLine === false`, or the `window` `offline` event fires, or
- the SSE layer reports the backend as `OFFLINE`.

When offline, each tick calls `emitOffline()`, which builds a realistic alert
from a rotating template (`OFFLINE ALERT — CRITICAL/HIGH/MODERATE …`) tagged
`simulation: true` and `offline: true`. It goes through the **exact same**
`emit()` pipeline: toast + system notification + chime. The offline alert fires
almost immediately (≈1.5 s) when the app detects the drop, then every 30 s.

The system notification itself needs no network: the page posts a message to the
service worker, which calls `self.registration.showNotification(...)`
**locally**. No server push (no VAPID/Web Push) is involved, so it works with the
network completely gone.

Clicking a system notification focuses the app and navigates to `/early-alerts`
(`notificationclick` handler in the service worker).

### 5.3 How to demo offline

- DevTools → **Network → Offline**, or physically disconnect Wi-Fi / Ethernet.
- The UI keeps running from the service-worker cache and offline alerts start
  popping. Toggle `Auto alerts` off in the bell if you want to stop them.

---

## 6. Setup / prerequisites for the jury demo

1. Open the deployed site (or `http://localhost:5173`).
2. Click the **bell** in the header → **Enable browser notifications** and grant
   the permission prompt. (Until granted, alerts still appear as in-app toasts +
   sound.)
3. Leave the dashboard open. Within ~8 seconds the first automatic alert pops,
   then every 30 seconds.
4. To show offline: DevTools → Network → Offline (or disconnect). Automatic
   offline alerts continue.
5. Optionally press **Send test alert** for an instant, on-demand pop, or run the
   **Emergency Scenario** for a scripted escalation.

> Note: everything generated for the demo is labelled `SIMULATED_LOCAL` /
> `OFFLINE · SIMULATED_LOCAL`. Nothing is delivered to any real external
> channel. This is deliberate and part of the platform's honest-labelling.

---

## 7. Where to configure

| Setting | File / key | Default |
|---|---|---|
| Auto cadence | `AUTO_INTERVAL_MS` in `notifications.tsx` | 30 s |
| First auto alert | `AUTO_FIRST_DELAY_MS` | 8 s |
| Session cap | `AUTO_MAX_PER_SESSION` | 60 |
| Enable/disable | bell menu → `Auto alerts` (`localStorage: tg_notify_auto`) | ON |
| Sound | `localStorage: tg_notify_sound` | ON |
| Browser notifications | `localStorage: tg_notify` | OFF until granted |
| Backend dispatch | `POST /api/alerts/dispatch` | — |

---

## 8. Honest limitations

- Notifications are shown by the browser/OS only while the site has been granted
  notification permission and (for system pop-ups) the service worker is
  registered. No notification can arrive when the browser is fully closed —
  that would require real Web Push (VAPID) and a push service.
- Offline alerts are **simulated locally**, not recovered from the server; there
  is no store-and-forward queue. They are labelled as such.
- `POST /api/alerts/dispatch` intentionally has no external delivery; adding
  real SMS/email/siren channels would be a separate, deliberately-gated step.
