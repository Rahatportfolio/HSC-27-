# HSC 2027 Study

A local-first, mobile-oriented study tracker for a Bangladesh HSC Science student. The initial repository contained only a README; see [AUDIT.md](AUDIT.md) for the audit, implementation scope, test evidence and limitations.

The app starts with 13 subject names and **no official chapters**. Enter your own chapters or import a CSV/JSON file from a trusted syllabus. A/B/C priorities are personal, not official. Demonstration data is optional and labelled.

## Use

Serve the repository with a static HTTP server (opening `index.html` as a file does not provide PWA features):

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000` on the same machine. For Android installation, deploy the files to an HTTPS static host, open its URL in Chrome, and use **Install app** or **Add to Home screen**. No production deployment has been configured by this change. On GitHub Pages, an administrator can publish this branch or merge it and configure Pages in repository settings; visit the URL shown there. Use a stable URL: local browser storage is separate per origin.

After first loading all assets online, the service worker is designed to cache the app shell. Your chapters, plans, notes, sessions and other records are stored on this device in browser `localStorage`; they are not synchronized. External videos and document links require connectivity. Browser storage can be cleared or evicted, so **regularly download a JSON backup** from More → Backup & restore. Restore replaces the current local data; back it up first. Backups are unencrypted and should be kept private. There is no account or server-side data isolation.

The focus timer uses elapsed timestamps while the app remains running. Mobile browsers can suspend or terminate it; completed countdown periods are saved when execution resumes, not necessarily at the exact deadline. Save or stop a running timer before closing the app; unfinished timer state is not persisted.

## Implemented scope

Dashboard, subject/chapter management and chapter import, day/week/month planner, focus timer and manual sessions, revisions, practice logs and question bank, exam/result records, notes/formulas/video links, weakness records, charts, weekly review, journal, calendar, settings, backup and export. This is a practical foundation, not a claim that every item in the original feature inventory is complete. See [AUDIT.md](AUDIT.md) for specific gaps.

Reminders are shown in-app; optional browser permission is used for timer phase alerts only while the app is running. The AI assistant is **not implemented**: a secure server-side integration would be required, and no provider key should be entered into the frontend. No paid service is needed for the current app.

## Tests

Node 18+ and npm are needed for development tests only; the deployed app has no runtime package dependencies.

```sh
npm ci
npm test
```

Unit tests, view-rendering checks, jsdom interaction tests and mocked service-worker checks do not substitute for a real Android browser, install, lock-screen, offline, accessibility or end-to-end test. See the audit for coverage and known gaps.

## PWA updates

When changing cached shell files for a release, increment `CACHE` in `sw.js` so installed clients receive the new version. The worker removes only older `hsc27-` caches.
