# HSC 2027 Study

A local-first, mobile-oriented study tracker for a Bangladesh HSC Science student. The app starts with 13 subject names, a 480-minute daily target and **no official chapters**. Enter chapters yourself or import a trusted CSV/JSON syllabus. Priorities are personal judgments, not official statistics. Demonstration data is opt-in and labelled. Chapter CSV/JSON import matches existing subject names, skips invalid, ambiguous or duplicate rows, and accepts at most 5,000 rows and 2,097,152 characters per file. Chapter deletion warns which linked records will be deleted; export a backup first. See [AUDIT.md](AUDIT.md) for scope, limitations and test evidence. A GPA 5.00/Golden A+ is a goal, not a prediction or guarantee.

## Start locally

For local-only use, serve the files over HTTP (opening `index.html` directly does not provide PWA features):

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000` on that machine. Static hosting offers the local app only; account sync, AI and background push require the optional server below. The app uses browser localStorage. Back up regularly using More → Backup & restore: browser storage can be cleared or evicted, and backups are **unencrypted**. Restore replaces local data, and a connected device may sync that replacement to the cloud.

## Optional self-hosted backend

Node 18+ and npm are required. `web-push` is the server's runtime dependency. On a trusted computer for local development:

```sh
npm ci
HSC_ALLOW_REGISTRATION=true npm start
```

Use the same server origin on all devices. More → Account & sync allows registration/sign-in and explicit connection: upload a device only when the account has no cloud copy, or explicitly replace local data with the existing cloud copy. **Export independent backups first.** Registration is disabled by default; enable it temporarily to create accounts and then disable it and restart. This is not an invitation to expose open registration to the public.

For an HTTPS deployment, configure a trusted reverse proxy with TLS in front of the server, and provide the exact origin (no trailing slash). Set environment variables via your server's secret management, not Git or browser code:

```sh
NODE_ENV=production PUBLIC_ORIGIN=https://your-domain.example PORT=8000 npm start
```

Production binds to `127.0.0.1` by default; `HOST` can override this when a secured deployment requires it. Do not expose the plain HTTP backend directly to the internet or allow untrusted clients to bypass the proxy. Store `HSC_DATA_DIR` on a persistent, access-restricted volume; it defaults to `.data/` (gitignored). Back up that directory securely. The server is a **single-process** JSON-file implementation: do not run multiple instances against the same directory. Passwords use scrypt and a per-user salt, but snapshots, push subscriptions and backups are not encrypted at rest. Sessions and rate limits are in memory; restart signs everyone out. There is no password recovery, admin interface, deletion workflow, distributed storage or formal security audit. This is a self-hosting foundation, not a hardened public multi-tenant deployment.

Sync uses per-account authorization, revision-checked full snapshots and an offline dirty queue. A conflict pauses upload without overwriting either copy; there is no automatic merge. Export local data before choosing a cloud replacement. Retry pending uploads via Sync now or after reconnecting. Active focus, manual exam and MCQ timers are device-local and excluded from cloud snapshots. Shared devices retain local data after sign-out: remove it deliberately only after backing up. Changing/resetting/restoring data on a connected device can update the cloud copy.

## Optional AI and push

- AI requires an owner-supplied `OPENAI_API_KEY`, plus `AI_ALLOWED_USERS` as a comma-separated list of account usernames (lowercase); `OPENAI_MODEL` is optional (default `gpt-4o-mini`). The server calls OpenAI; credentials never belong in frontend code. Prompts leave your server for the provider, can incur provider costs, and must not include sensitive data. Responses are labelled AI-generated, may be wrong and are not official board questions. This service is disabled unless configured. A live provider call has **not** been verified.
- Web push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a valid `mailto:` or HTTPS contact) in the server environment. Generate keys privately with `npx web-push generate-vapid-keys`; don't commit the private key. After HTTPS deployment, sign in, enable push in Account & sync, grant browser permission, enable the relevant Settings reminders and sync those preferences. The running server checks the latest synced snapshot approximately every minute and sends at most one aggregate reminder per device per Bangladesh day after the configured time. Delivery depends on the browser, OS and push service and can be delayed or blocked. Sign-out attempts to remove the device subscription; if offline, retry while connected. Real delivery has **not** been verified.

Without these optional services there is no provider charge, background push or automatic multi-device sync. Timer alerts and in-app reminders while open depend on browser permissions and execution.

## Study features and offline use

Dashboard, editable chapters and import, planner with task editing and rescheduling, recoverable focus timer and manual sessions, revisions, practice logs and question bank, exam records, a self-administered countdown and a timed MCQ test from personal questions, notes and small offline PDF attachments (up to 512 KiB each), formulas and video links, weakness correction tasks, charts, weekly review, journal, calendar and backup are available. Attached PDFs count against browser storage and are included in JSON exports; retain the originals. The MCQ engine uses up to 50 matching personal four-choice questions, equal weighting and no negative marks; it saves answers and processes expiration while open or upon reopening. Written exams are manually graded. No official question bank or official syllabus is supplied.

After the first successful online visit, the service worker is designed to cache the app shell for offline use. External links, AI, sync and push need connectivity and appropriate services. A timer can recover on reopening, but background execution/alerts and lock-screen behavior are not guaranteed. If saving a session fails, keep the page open, free storage and retry Stop & save; unsaved time may be lost on closing. Bangla text can be entered throughout; the Bangla UI option translates navigation, headings and some settings, **not the entire interface**.

## Android and testing

Deploy to an HTTPS host, open the stable URL in Android Chrome and choose Install app/Add to Home screen. Static hosting supports only local features; use the optional backend for its API features. No public deployment URL, actual Android installation, lock-screen behavior or real offline/browser push delivery has been verified.

```sh
npm ci
npm test
npm audit --omit=dev
```

The suite includes Node, jsdom and mocked service-worker/provider/push tests; it is not a substitute for real Android, accessibility, security or deployed end-to-end testing. For shell changes, increment `CACHE` in `sw.js`; the worker removes only old `hsc27-` caches.
