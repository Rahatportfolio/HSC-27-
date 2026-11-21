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

### Background memory mitigation under test

The model worker is now also terminated when the document is hidden or receives `pagehide`, rather than retaining its large memory allocation while another activity or browser tab runs. The panel explains that the model must be loaded again; an interrupted question returns to the input and stale load results are ignored. Unit/UI tests reproduce background and late-result behavior. This is a mitigation, not proof of the Android offline-restart issue's root cause or a guarantee against out-of-memory termination: actual WebView lifecycle delivery, peak inference RAM, and device conditions still require real-model tests.

**Experiment:** Limit ONNX graph optimization to `basic` to test whether reducing graph rewrites/prepacked weights improves WebView peak memory; this is not yet demonstrated to solve out-of-memory failures and may affect inference speed. The prior background-lifecycle change alone did not prevent the subsequent Android AI low-memory kill on rerun `44922535495` (the first attempt timed out during online loading). Actual AI CI results, not this hypothesis, determine whether the experiment is acceptable.

**Experiment update:** Basic graph optimization was not retained: Android run `44924010602` timed out during online loading, so there was no evidence of a memory benefit. A separate experiment now bounds each generated reply to 96 new tokens (rather than 256) to reduce generation work and the growth of temporary attention/cache buffers. This may shorten or truncate answers; it is not a guarantee that loading or inference fits in RAM. Actual online and offline inference checks are required.

The 96-token experiment was also reverted: both attempts of Android run `44924837120` timed out in WebView evaluation before reaching the AI probe. They neither establish a memory benefit nor justify shorter/truncated answers. The original 256-token limit remains. The run `44922535495` did reach offline inference on its second attempt and was killed under memory pressure despite the background release, so Android AI OOM is still open. Avoiding a data reset and retaining the tested Smart Brain fallback are safer than claiming that lowering generation or graph settings fixed it.

### Renderer-loss recovery (pending Android verification)

A native WebView renderer-loss listener removes the dead WebView, tears down its bridge, and presents a native explanation with an explicit reopen button. It does not clear local storage or automatically retry the AI model. Unsaved edits and interrupted operations may be lost. The intended regression `RendererRecoveryInstrumentedTest` deliberately crashes the renderer on an isolated emulator, reopens the activity, and checks a synthetic stored note, routine and sentinel. Android CI must confirm this behavior; the local sandbox cannot run the test. This addresses the app's response to a renderer loss, not the underlying high AI memory requirement, and cannot prevent process-wide OOM kills.
