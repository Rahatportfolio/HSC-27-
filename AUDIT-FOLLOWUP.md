# Follow-up to the HSC 2027 audit

The eight functional findings in `AUDIT-VERIFICATION.md` were fixed and merged in PR #38. This follow-up addresses two previously open engineering risks rather than claiming those bugs were unfixed:

1. The full development dependency audit had reported two high advisories via Transformers.js 3.8.1 and its nested `sharp` 0.34.5. Transformers.js is updated to 4.3.2, which uses the patched shared `sharp` 0.35.5; the complete dependency audit is checked with `npm audit --audit-level=high`. This is a major AI runtime update, so ordinary mocked tests alone are not sufficient evidence: real online model inference and a cold offline restart must pass the AI Chromium and Android WebView integration workflows. Those jobs are required for evaluating this change; see the PR checks for their actual status. The 135M Q8 model and download-on-demand design are unchanged.
2. There was no lint command. `npm run lint` now runs an explicit ESLint baseline over TypeScript/TSX and project scripts, looking for a limited set of correctness hazards (such as duplicate object keys, unreachable code and unsafe finally blocks) and dynamic evaluation in production source. A guard verifies the command rejects bad input. This is not a comprehensive security analysis or a blanket React hooks check. TypeScript strict checks and other tests remain separate. Existing mutation-guard scripts intentionally prioritize restoration failures, so their two `finally` throws have documented, local rule exceptions. CI runs lint and the high-severity dependency audit.

The actual-model integration workflows now run when the model worker or dependency manifests/lockfile change, not just when the AI facade or test changes. This prevents future runtime changes silently bypassing online/offline model testing.

## Remaining limitations

- Local-first data and existing features are retained; no data is intentionally reset or migrated. Tests cannot prove all update paths on all devices.
- Offline model use still depends on the browser/WebView retaining the downloaded model cache; eviction or storage cleanup can require a fresh download. Bengali answer quality is not certified.
- The local sandbox has no Android SDK, Java runtime, Chrome or access to the model host. Android APK, emulator, production-browser and real-model online/offline evidence must come from the existing GitHub Actions workflows. Physical devices have not been certified.
- CI results and final command counts should be read from the PR checks; a pending job is not a pass. The lint rules are intentionally limited and do not imply the absence of other security or quality issues.

## Additional confirmed settings race found during follow-up

- **Priority:** P1 (an unsaved settings edit can disappear, and the same failure blocked the Pages test/deploy).
- **Location:** `src/views/Settings.tsx`; regression `src/settings.pending-effect.ui.test.tsx`.
- **Reproduction:** Open Settings and change the routine start before the initial passive settings synchronization has run. The previously scheduled clean-state effect can overwrite the new date and linked boost date. The same assertion failed in the two latest main-branch Pages runs; repeated local runs reproduced it intermittently, and the new controlled regression failed on the pre-fix code.
- **Root cause:** React's passive synchronization captured `dirty = false` before the user's edit and could enqueue an obsolete draft replacement after the edit event.
- **Fix:** Mark the draft dirty synchronously in a ref before state updates, and check that ref both when the sync effect runs and when its queued draft update is applied. Save, restore and reset still explicitly mark the draft clean. This does not change stored settings or reset user data.
- **Verification:** The controlled regression passes with the fix and fails without it; normal date-cascade tests exercise confirmation and persistence. The public Pages deployment remains unchanged until the PR is merged and a deployment actually succeeds.

## Additional AI worker lifecycle issue

- **Priority:** P2 — a delayed error from a terminated worker can reject the new worker's in-flight load/chat request.
- **Location:** `src/aiModel.ts` worker event handlers; `src/aiModel.test.ts`.
- **Reproduction:** Start loading, unload the worker, start a new load, then deliver a previously queued error from the old worker. The synthetic regression rejected the replacement load on the previous implementation.
- **Root cause and fix:** The error handler cleared the shared pending-request map even when it belonged to a newer worker. Ignore messages/errors from non-current workers; current-worker failures still reject pending work and permit retry.
- **Android AI test limitation:** The first 642721b Android AI run ended with the instrumented process dying; its retry passed. Available annotations did not establish the cause. This lifecycle fix is not claimed to explain or fix that crash. The emulator workflow now retains synthetic-test logcat and test results on failure and records model-loading/inference stages for diagnosis if it recurs; no phone user data is collected.

## Observed Android WebView memory pressure

The Android AI integration run `44919713468` on a357f9a failed: Android's low-memory killer terminated the WebView renderer, and Chromium then terminated the app. Logcat reports about 998 MB resident and 1.37 GB swap for that renderer at termination. The 140 MB model download is **not** the model's peak working-memory requirement; this is not evidence that the worker event fix caused the failure, nor that it solves the memory pressure. Earlier runs and one retry passed; performance and stability depend on available RAM, emulator/phone conditions and runtime.

To avoid a misleading size implication, the model panel now warns that substantially more RAM is required and recommends the rule-based Smart Brain as an alternative. Switching from model mode back to Smart Brain terminates the model worker and resets its loaded state; switching back needs a reload and may need internet if the cache is unavailable. This releases memory when it is no longer needed but does **not** guarantee that loading or inference will fit on a memory-constrained device. The workflow now preserves diagnostic logs and explicitly surfaces probe stages if another failure occurs. Real-device memory behavior and a robust solution for insufficient RAM remain unverified.
