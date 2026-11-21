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
