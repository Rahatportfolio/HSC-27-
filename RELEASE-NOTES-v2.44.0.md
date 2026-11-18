# v2.44.0 / Android code 24 — UI repair and 20 November start

## Publication and upgrade gate

This is the release preparation record, **not a claim that an APK is already published or a safe in-place update**. APK and PWA deployment must be checked independently on the [release page](https://github.com/Rahatportfolio/HSC-27-/releases/tag/v2.44.0), [PR #16](https://github.com/Rahatportfolio/HSC-27-/pull/16) and Actions.

- Keep tagged APK uploads **draft** until typecheck/unit/build/browser, API 34/API 35 native tests, Pages deployment and exact uploaded-asset verification pass.
- Compare the new APK's signing certificate with published **v2.43.0**, not merely its version name. If different, **hold the APK** rather than call it a safe direct update. An asset/signature verification can pass while update compatibility fails.
- Never overwrite/retag the historical v2.43.0 release. Never ask the student to uninstall/Clear data to make a new signature install.
- Existing v2.42.0 and v2.43.0 certificates already differ. JSON and legacy full backups omit scan image bytes; keep the original app/device and independently verify progress plus every PDF/image. New full backup v2 supports actual image bytes, but cannot recover bytes absent from an old archive.
- PWA and APK storage are separate. A PWA deployment does not migrate or remotely change an installed APK profile. Do not clear site storage to get a service-worker update; finish a running timer, close the old app tabs and reopen online.

## What changed

- Remove the persistent native ActionBar/splash-painted strip obscuring the clock. Install the post-splash theme before edge-to-edge decor.
- Pad/separate progress cards and let Bengali labels/counts wrap without touching rounded borders.
- Show unbroken 18px running/paused timer digits, safe status/gesture insets and measured sticky-chrome scroll clearance.
- Stop the decorative timer SVG blocking real Start/Pause taps. Keep clocks usable after scrolling/navigation and at large text sizes.
- Prevent the 320px first-study-day toolbar collision when progress and optional PWA install controls coexist.
- Keep the default routine start **20 November 2026, 06:30 Bangladesh time**. An existing profile with another date gets **Settings → “২০ নভেম্বর, ২০২৬ থেকে শুরু” → সেভ → রুটিন আপডেট**. The shortcut edits a draft; cancellation keeps the saved date. Linked personal targets move by the actual date offset; fixed external deadlines stay fixed. No profile reset, history redating or silent migration.
- Actual completion times, measured sessions, notes, marks, recalls and files retain their meaning. College/HSC 2027 official examination dates remain unverified; 1 February / 6 June defaults are personal targets, not notices.

## Measured evidence

Local release preflight: typecheck, **76 relevant tests**, **772/772 full tests / 87 files**, production build and real production date/scanner/image/PDF/full-backup/restore/undo/quota flows passed. The existing large-bundle warning remains. Browser checks include touch/coarse-pointer phone sizes, large text, Bengali/English, safe insets and both Dhaka/New York device timezones.

Prior UI proof caught 12 source + 12 browser faults; the existing-profile shortcut additionally caught 2 source + 2 browser faults. The release-policy rerun caught all 6 selected metadata/draft/dependency faults with passing controls and byte-for-byte restoration. These are targeted faults, not exhaustive coverage or zero-bug/device certification.

The previous native candidate `6242d1b` is **not** all green: API 35 rejected a first tap before app-window input ownership. The updated harness waits for native window focus in addition to compositor readiness, keeps real touchscreen injection and fails rather than bypassing another window. Fresh final-source native runs and the exact APK SHA-256/certificate comparison must be recorded on PR #16 / the release before promotion.
