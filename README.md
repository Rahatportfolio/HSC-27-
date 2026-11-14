# HSC 2027 Study

A local-first, mobile-oriented study tracker for a Bangladesh HSC Science student. The app starts with 13 subject names, a 480-minute daily target and **no official chapters**. Enter chapters yourself or import a trusted CSV/JSON syllabus. Priorities are personal judgments, not official statistics. Demonstration data is opt-in and labelled. Chapter CSV/JSON import matches existing subject names, skips invalid, ambiguous or duplicate rows, and accepts at most 5,000 rows and 2,097,152 characters per file. Chapter deletion warns which linked records will be deleted; export a backup first. See [AUDIT.md](AUDIT.md) for scope, limitations and test evidence. A GPA 5.00/Golden A+ is a goal, not a prediction or guarantee.

## Offline Android APK with GitHub Actions (no server or deployment)

The repository includes an Android WebView wrapper that packages the local app assets inside the APK. In GitHub, open **Actions → Build offline Android APK → Run workflow**, select your branch, wait for success, and download the APK artifact from that run. Extract the ZIP and install the APK on your Android phone; Android may ask you to allow installs from the source you used. No server is needed, including on first launch. The project uses Android 6.0+ and an up-to-date Android System WebView. The local-only APK hides account sync/AI and does not supply background push or timer alerts; links open in an external browser and require internet. Web app and APK have separate local storage. Use JSON backup/restore to move data between them.

**Important: back up before updating or uninstalling.** Without signing configuration, each Actions run produces a **debug APK with a temporary signing key**. Android may reject a later APK as an update; uninstalling removes the app's data. Back up first and verify your exported backup before reinstalling. Debug builds are for personal testing, not secure distribution.

For updatable personal builds, create and safely back up your own Android signing keystore and passwords; never commit them or share them in chat. In GitHub repository Settings → Secrets and variables → Actions, add all four repository secrets: `ANDROID_KEYSTORE_BASE64` (base64-encoded keystore bytes), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The action then builds a signed release APK. All future updates must use **the same package ID and key**, and losing the key prevents updates. Changing from a debug APK to a release APK also requires uninstall/reinstall and restoring a backup. Do not expose signing secrets to untrusted branches/actions. The artifact expires after 14 days; download and preserve it yourself.

The Android app stores data on the device, and uninstalling/clearing app data erases it. Backup files are unencrypted; use More → Backup & restore to export them somewhere safe outside the app, and retain original PDFs. The system file picker is used for imports/exports. Actual Android installation, picker behavior, update and low-end performance must still be verified on a real device; a successful CI build alone does not establish these.

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

**Upgrade note:** this release requires the `X-HSC-User` account ID on authenticated API calls other than `/api/session` (returned by sign-in/session). It is an account-binding check, not a credential or substitute for the session cookie. Older cached clients or custom API clients without this header will be rejected; reload/reopen the app online after updating the server. If another tab changes the shared session account, the old tab is signed out locally on its next API call instead of writing to the new account. Avoid editing the same local browser storage from multiple tabs at once: this is not a cross-tab collaborative editor.

Sync uses per-account authorization, revision-checked full snapshots and an offline dirty queue. A conflict pauses upload without overwriting either copy; there is no general automatic merge. First export a local JSON backup from Backup & restore **and** use Account & sync → Download cloud backup. Both backups are unencrypted. A confirmed **Merge independent additions** is available only when both devices made append-only additions to notes, study sessions or journal entries and all existing data, order and settings remain unchanged. It refuses edits, deletions, unsupported collections, missing IDs or unsafe links, and queues the merged local copy for revision-checked upload. It needs secure browser SHA-256 support and a matching baseline from a successful sync or clean reconnect; older offline/conflicted devices may not have one. A small `hsc27_sync_base_v1` localStorage record contains record IDs and hashes, not full attachments; hashes are not encryption. If merge is unavailable, explicitly replace local with cloud, or cloud with local. Either choice discards the other copy's unique changes; keep both backups. Cloud replacement uses the latest revision and refuses if the cloud changes again. Local edits made while an upload is in flight remain queued. Retry pending uploads via Sync now or after reconnecting. Active focus, manual exam, MCQ and written tests (including answers and marking in progress) are device-local and excluded from cloud snapshots. Saved results and reviews are included in subsequent snapshots. Shared devices retain local data after sign-out: remove it deliberately only after backing up. Changing/resetting/restoring data on a connected device can update the cloud copy.

## Optional AI and push

- AI requires an owner-supplied `OPENAI_API_KEY`, plus `AI_ALLOWED_USERS` as a comma-separated list of account usernames (lowercase); `OPENAI_MODEL` is optional (default `gpt-4o-mini`). The server calls OpenAI; credentials never belong in frontend code. Prompts leave your server for the provider, can incur provider costs, and must not include sensitive data. Responses are labelled AI-generated, may be wrong and are not official board questions. This service is disabled unless configured. A live provider call has **not** been verified.
- Web push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a valid `mailto:` or HTTPS contact) in the server environment. Generate keys privately with `npx web-push generate-vapid-keys`; don't commit the private key. After HTTPS deployment, sign in, enable push in Account & sync, grant browser permission, enable the relevant Settings reminders and sync those preferences. The running server checks the latest synced snapshot approximately every minute and sends at most one aggregate reminder per device per Bangladesh day after the configured time. Delivery depends on the browser, OS and push service and can be delayed or blocked. Sign-out attempts to remove the device subscription; if offline, retry while connected. Real delivery has **not** been verified.

Without these optional services there is no provider charge, background push or automatic multi-device sync. Timer alerts and in-app reminders while open depend on browser permissions and execution.

## Study features and offline use

Dashboard, editable chapters and import, planner with task editing, rescheduling and an optional suggestion preview, recoverable focus timer and manual sessions, revisions, practice logs and question bank, exam records, a self-administered countdown and timed MCQ and written practice tests from personal questions, notes and small offline PDF attachments (up to 512 KiB each), formulas and video links, weakness correction tasks, charts, weekly review, journal, calendar and backup are available. Attached PDFs count against browser storage and are included in JSON exports; retain the originals. The MCQ engine uses up to 50 matching personal four-choice questions, equal weighting and no negative marks; it saves answers and processes expiration while open or upon reopening. Written practice takes up to the first 10 matching CQ questions from the personal bank. Answers are saved locally; after submitting (or expiry while open or upon reopening), students manually assign a 0–100% score to every answer. The final score uses equal question weighting and the review retains answers and scores. This is self-assessment, not automatic grading or an official HSC marking scheme. An active test can be discarded with confirmation. No official question bank or official syllabus is supplied. More → Flashcards provides an offline, ungraded review of up to 500 matching personal questions with answers or correct MCQ choices; filter by subject/type, reveal the answer and navigate. Card position is temporary and is not saved on closing the app.

After the first successful online visit, the service worker is designed to cache the app shell for offline use. External links, AI, sync and push need connectivity and appropriate services. A timer can recover on reopening, but background execution/alerts and lock-screen behavior are not guaranteed. If saving a session fails, keep the page open, free storage and retry Stop & save; unsaved time may be lost on closing. Bangla text can be entered throughout; the Bangla UI option translates navigation, many forms, controls, headings and selected settings, **not the entire interface**. User-entered text is never translated.

### Optional planner suggestions and score comparisons

Planner previews up to seven 30-minute tasks for revisions due within the next seven days and active weaknesses, based only on your saved records. It places each on the earliest day from today through six days ahead with enough room under the daily **planned** target, counting existing non-rest tasks; it does not account for actual availability, study time already completed or preferred hours. Nothing is added unless you confirm. Added suggestions can be edited or deleted like other tasks. Linked suggestions are suppressed while their tasks exist (even if completed or edited); pending correction tasks also suppress weakness suggestions. Other manually created tasks cannot be recognized as duplicates. Revisions and weaknesses are not marked complete by finishing a planner task. Review the plan and adjust it yourself.

Progress compares the latest two valid results only for the same exam and marking method (MCQ, written self-mark or manual result). Same-day records require distinct timestamps to establish order. Score averages weight each valid result equally and may mix methods; missing or invalid scores are excluded. These summaries are descriptive, not predictions or official grading. Progress also shows the last 14 days of recorded subject activity and derives personal milestone dates for 10, 50, 100, 250 and 500 hours and 3, 7, 14 and 30 consecutive study days. It excludes future-dated or invalid sessions for these insights. History is recalculated from retained sessions, so changing or deleting sessions changes the milestones; they are not certificates or proof of achievement.

## Android and testing

For a server-free APK, use the GitHub Actions instructions above. Alternatively, deploy the web app to an HTTPS host, open it in Android Chrome and choose Install app/Add to Home screen. Static hosting supports only local features; use the optional backend for its API features. No public deployment URL, actual Android installation, lock-screen behavior or real offline/browser push delivery has been verified.

```sh
npm ci
npm test
npm audit --omit=dev
```

The suite includes Node, jsdom and mocked service-worker/provider/push tests; it is not a substitute for real Android, accessibility, security or deployed end-to-end testing. For shell changes, increment `CACHE` in `sw.js`; the worker removes only old `hsc27-` caches.
