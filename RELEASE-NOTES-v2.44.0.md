# v2.44.0 / Android code 24 — UI repair and 20 November start

## Publication outcome: PWA deployed; APK held

**ওয়েব/PWA আপডেট প্রকাশ হয়েছে। APK signing certificate আগেরটির সঙ্গে না মেলায় সেটি draft-এ আছে; সরাসরি আপডেট হিসেবে প্রকাশ করা হয়নি। পুরোনো অ্যাপ uninstall বা Clear data কোরো না।**

- [PR #16](https://github.com/Rahatportfolio/HSC-27-/pull/16) merged as **`98b949f1936c2ab754ddf4123949156640dbb058`**. Its tree `9d2cb688c83a64b483831bc83cfb9514282e397d` matched tested `791ed5c775f832bf2add95cf96f6c477e88a01c7`. Tag **v2.44.0** still points to that merge; historical v2.43.0 was not replaced/retagged.
- **Public PWA:** [open the updated app](https://rahatportfolio.github.io/HSC-27-/), or [Settings](https://rahatportfolio.github.io/HSC-27-/#settings). [Pages run 44265638550](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265638550), deployment **7877892588**, succeeded for the merge SHA. The deployment/status API was inspected; direct public-site byte/visual inspection was restricted by the outbound-host allowlist.
- **APK held:** release **449690511** remains draft, with the same inspected asset **762550392** and digest below. No v2.44.0 APK publication was performed. A valid cryptographic signature is not proof of signing continuity.
- The user reports the original installed/published APK's signing keystore is unavailable or uncertain. A new key, the APK or its public certificate cannot reproduce that private key. No key/password was requested in chat. No alternate package identity or data migration was silently introduced.
- PWA and APK data is separate. A web deployment cannot migrate or remotely edit APK-private storage. Finish an active timer, close old PWA tabs and reopen online to receive the web update; do not clear site storage.

## Apply the requested start safely

New profiles start **20 November 2026, 06:30 Bangladesh time**. For a saved profile with another date:

**Settings → “২০ নভেম্বর, ২০২৬ থেকে শুরু” → review the preview → “সেভ করো” → “রুটিন আপডেট করো”.**

On an older installed APK without the shortcut, set the routine-start field manually to **20 November 2026**, then use the same Save/confirmation flow. Reset is unnecessary. The shortcut edits a draft; cancelling preserves the saved date. Linked personal targets move by the actual offset; a saved fixed-deadline policy remains fixed. Identity, custom hours, actual history, notes, sessions and files retain their meaning. No silent profile migration or phone-data edit is performed.

College/HSC 2027 official examination dates remain unverified. The 1 February / 6 June defaults are personal preparation targets, not official notices.

## UI changes and measured release evidence

- Remove the persistent native ActionBar/splash-painted strip; install the post-splash theme before edge-to-edge decor.
- Pad/separate Bengali dashboard cards; scale the non-interactive timer SVG so it cannot block Start/Pause taps.
- Keep 18px running/paused digits, safe status/gesture insets and actual scroll/focus clearance through navigation and large text. Observe chrome **border-box** changes, including late inset padding.
- Published-source local gates passed: TypeScript; **772/772 tests / 87 files**; production build; **41 mobile probes**, **23 responsive views**; real date/scanner/image/PDF/full-backup/restore/undo/quota/media/PWA-offline flows. **25/25 selected shell faults** (13 source / 12 browser) and the 2 source / 2 browser date-shortcut faults were caught with restored originals. These are targeted checks, not zero-bug certification.
- [Tagged native run 44265675381](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265675381), **attempt 2, SUCCESS**: APK **134675188036**, API 34 **134675186351**, API 35 **134675245350**. The failed-only retry repaired an initial Maven HTTP 429 dependency failure on API 34; successful APK/API 35 results were reused, not rebuilt or counted twice. The draft asset remained unchanged.
- [Main Android run 44265638543](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44265638543), **attempt 2, SUCCESS**: build **134675196526**, API 34 **134677752401**, API 35 **134677752396**. These final outcomes were previously unknown after merged-branch remote access closed; the continuation explicitly verified them.
- Tagged API 34/35 evidence retains 12 stages each: clock digits **18px at 100% / 23.4px at 130%**, measured hit/unclipped points and no native toolbar. Both scrolled 130% screenshots were visually inspected. Reused API 35 annotations remain on original check **134671395051**. Emulators are not physical/OEM-phone certification.

## Exact draft APK inspection — not a safe-update approval

[Read-only audit 44266592857](https://github.com/Rahatportfolio/HSC-27-/actions/runs/44266592857) inspected the uploaded draft asset, not a locally rebuilt substitute:

| Field | Observed value |
|---|---|
| Source | `98b949f1936c2ab754ddf4123949156640dbb058` |
| Asset | `762550392`, `prostuti-hsc27-v2.44.0.apk`, **15,231,160 bytes** |
| Android metadata | `com.prostuti.hsc27`, versionName **2.44.0**, versionCode **24** |
| APK SHA-256 | `6bc0b311fabda582b9f9a4c67c1e873ecb7cbf216e1d1060943e69ab90dbfec0` |
| ZIP / signature | Integrity passed; cryptographic signature verified |
| Embedded main asset | `assets/index-j4-gSn9R.js` |
| Main-asset SHA-256 | `969b360834b6f3888a4b7ae0f4c8a8f9ac85f27bf65304618851031a0c95020f` — exact match to the tested production bundle |
| v2.44.0 certificate SHA-256 | `7c33848abbb4706ea70bb37b70da297bc5991e97fb04a510adb10f1af02303fb` |
| Published v2.43.0 certificate SHA-256 | `30c33e6e24b125db7291e3fb6f3ea746054532b2c016bb3f24d79023cac5ab72` |
| Same signing certificate | **false — direct Android update blocked** |

The historical workflow skipped release-keystore/signed-release steps and used a per-run debug signer. Do not uninstall/Clear data to work around the mismatch. Repeat exact-asset checks after any rebuild/replacement; do not retag a historical release.

## Continuation: fail-closed release automation

The continuation adds prerequisites for **future workflow runs using the hardened source**, not retroactive signing repair of tag v2.44.0:

1. Version-tag builds require all four signing inputs before building; developer debug builds still work without secrets. Inputs alone do not prove the key matches.
2. Tagged assets select **only the release APK**, never the debug APK under a production filename. Contributor debug artifacts are explicitly labelled `-debug.apk`.
3. Tagged exact-asset audits wait for APK plus both native jobs. Manual read-only audits remain possible, including when build jobs are skipped.
4. A separate mandatory gate requires the pinned v2.43.0 asset/digest/certificate, a higher Android code and an explicitly non-debuggable current APK. Missing, contradictory or different signing facts fail the job. Audit evidence is retained even on rejection. Uploads remain **draft**; there is no automatic publication.

The five new workflow/artifact regressions failed against the old pipeline before repair. Local controls passed **8 release-policy tests + 57 Node helper/CLI/auditor tests**. **29/29 selected faults** were caught: 16 workflow/artifact/metadata faults plus 13 isolated module faults; originals stayed/restored byte-for-byte. The workflow artifact tests execute the real collection shell against synthetic debug/release files rather than relying only on source matching. The continuation additionally passed **777/777 tests / 87 files (210.39s)**, TypeScript, build **6.75s**, date/image/PDF/full-backup/restore/undo/quota/offline-media flows, **41 mobile probes** and **23 responsive views**, with identical application bytes. Remote hardening checks are recorded separately on the continuation PR and must not be inferred from local controls. Details: [AUDIT.md](AUDIT.md).

If the original key is later found, configure it through repository Actions Secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), never chat. Then verify the certificate against the installed/published baseline before building a new, separately versioned release. An unrelated replacement key cannot update the installed app. A separately identified app/migration would require a separate explicit decision.

## Data-safety limits

Published v2.42.0/v2.43.0 certificates already differ. JSON and legacy full backups omit scan image bytes; keep the original app/device and independently open/verify progress exports plus **every PDF/image**. New full backup v2 supports actual image bytes, but cannot recover bytes absent from an old archive. PWA/APK storage does not automatically sync.

No physical-phone, background-alarm, battery, every-accessibility-setting or examination-result guarantee is made.
