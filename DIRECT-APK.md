# Direct APK — exact-source development download, not a production update

The requested installer is an `.apk`, not an Actions ZIP. The current-code path
is in `scripts/publish-current-development-apk.mjs` and the **Current tested
development APK download** job of `.github/workflows/android-apk.yml`.
The older one-off publisher pinned to `14e6640` is historical tooling; it must
not be triggered as delivery of the S/Brain/performance rework.

## Required checks and immutable bytes

- Only `arena/80a86bf2-hsc-27`, a push carrying the explicit
  `[current-dev-apk]` acknowledgement, and the development-only confirmation
  can request publication. Normal builds do not publish downloads.
- Exact repository, full source SHA, workflow, run and attempt must match.
  **Build installable APK**, **API 34**, **API 35**, and **Built web acceptance**
  must each have one completed successful job. Missing/skipped/failed checks
  abort delivery. The public web checks use the production build, not dev HMR.
- The script downloads that run’s immutable artifact on the runner, verifies
  its ZIP size/hash against GitHub metadata, and extracts only the exact named
  debug APK. Unknown paths/entries or duplicates are rejected. Artifact ZIP
  hashes are never presented as APK hashes.
- APK ZIP integrity, actual Android package/version, debug flag, signature and
  certificate are inspected with Android build tools. Packaged shell/entry
  bytes must exist. There is no rebuild, re-sign, identity switch or fallback
  to a different APK. A separate APK SHA-256 and inspection JSON are retained.
- Publication starts as a new draft. Exact uploaded asset sizes, SHA-256 digests
  and direct GitHub URLs are verified before it becomes a **non-Latest
  development prerelease**. No `--clobber`, existing tag/asset replacement or
  version release is allowed; Latest is checked before and after publication.
- 31 current-delivery guard tests complement the existing production/development
  release guards. The old `requireCompatibleUpdate` gate is unchanged.

## Installation/data boundary

This is **NOT an approved compatible production update**. It is debuggable,
package `com.prostuti.hsc27`, version `2.44.0`, Android code `24`. Original
signing-key continuity is not established. A verified debug signature does
not satisfy the non-debuggable production update policy.

Use only a separate test device/profile without a conflicting installation.
**Keep the original app and device. Do not uninstall, Clear data or discard
backups to bypass a signing conflict.** JSON and legacy backups omit original
scan/media bytes; keep verified full-media backups and separately opened PDFs.
PWA and APK private storage remain separate. Emulator checks do not certify
every physical phone, OEM keyboard, background restriction or screen reader.

## Exact-source delivery record

The **Delivery** section of [PR #19](https://github.com/Rahatportfolio/HSC-27-/pull/19)
records the actual direct `.apk` URL, full source SHA, successful run, APK hash
and certificate. Its separate development prerelease contains `inspection.json`
and `SHA256SUMS.txt`; older production assets are not this download. The workflow
also exposes the measured result in a **Current development APK evidence**
annotation and retains `.cache/current-dev-apk/delivery.json` in its artifact.

PWA publication is separate: the protected main Pages workflow checks every
uploaded public file against the exact build after deployment. Its real URL/run
and byte-verification result are in the same PR delivery record, not inferred
from a local preview. [Measured code/browser report](A-Z-RECHECK-REPORT.md).
