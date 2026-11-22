#!/usr/bin/env bash
# Disposable CI emulator only. Install the exact signed, non-debuggable APK,
# an instrumentation APK signed with the same one-time key, and the old test
# package. Never clear or uninstall the old package.
set -euo pipefail
sha256sum -c candidate/SHA256SUMS.txt
adb shell svc power stayon true
adb shell settings put system screen_off_timeout 2147483647
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell settings put global hide_error_dialogs 1
adb shell settings put global anr_show_background 0
adb shell svc wifi disable
adb shell svc data disable
adb install candidate/original-debug.apk
adb install candidate/previous-fresh-debug.apk
adb install candidate/previous-category-debug.apk
adb install candidate/previous-selected-debug.apk
adb install candidate/previous-final-debug.apk
adb install candidate/previous-custom-debug.apk
adb install candidate/prostuti-hsc27-calm.apk
adb install candidate/instrumentation.apk
adb shell pm path com.prostuti.hsc27 | grep '^package:'
adb shell pm path com.prostuti.hsc27.fresh | grep '^package:'
adb shell pm path com.prostuti.hsc27.calm | grep '^package:'
adb shell "run-as com.prostuti.hsc27 sh -c 'mkdir -p files; echo original-private-snapshot > files/arena-isolation-check'"
adb shell "run-as com.prostuti.hsc27.fresh sh -c 'mkdir -p files; echo fresh-private-snapshot > files/arena-isolation-check'"
adb shell "run-as com.prostuti.hsc27.category sh -c 'mkdir -p files; echo category-private-snapshot > files/arena-isolation-check'"
adb shell "run-as com.prostuti.hsc27.finalapp sh -c 'mkdir -p files; echo final-private-snapshot > files/arena-isolation-check'"
adb shell "run-as com.prostuti.hsc27.custom sh -c 'mkdir -p files; echo custom-private-snapshot > files/arena-isolation-check'"
adb shell "run-as com.prostuti.hsc27.selected sh -c 'mkdir -p files; echo selected-private-snapshot > files/arena-isolation-check'"
# -r exposes each test class; -e supplies the exact expected install identity.
# Instrumentation can run against the non-debuggable APK because the test APK
# is signed by the same one-time key. Never upload that key.
adb shell am instrument -w -r -e expectedPackage com.prostuti.hsc27.calm \
  com.prostuti.hsc27.calm.test/androidx.test.runner.AndroidJUnitRunner | tee instrumentation.log
grep -E 'OK \([0-9]+ tests?\)' instrumentation.log
grep -F 'INSTRUMENTATION_CODE: -1' instrumentation.log
grep -F 'class=com.prostuti.hsc27.RendererRecoveryInstrumentedTest' instrumentation.log
grep -F 'class=com.prostuti.hsc27.MobileShellInstrumentedTest' instrumentation.log
if grep -E 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=Process crashed' instrumentation.log; then exit 1; fi
adb shell pm path com.prostuti.hsc27 | grep '^package:'
adb shell pm path com.prostuti.hsc27.fresh | grep '^package:'
adb shell run-as com.prostuti.hsc27 cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'original-private-snapshot'

adb shell pm path com.prostuti.hsc27.calm | grep '^package:'
adb shell run-as com.prostuti.hsc27.fresh cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'fresh-private-snapshot'

adb shell pm path com.prostuti.hsc27.category | grep '^package:'
adb shell run-as com.prostuti.hsc27.category cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'category-private-snapshot'

adb shell pm path com.prostuti.hsc27.selected | grep '^package:'
adb shell run-as com.prostuti.hsc27.selected cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'selected-private-snapshot'

adb shell pm path com.prostuti.hsc27.finalapp | grep '^package:'
adb shell run-as com.prostuti.hsc27.finalapp cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'final-private-snapshot'

adb shell pm path com.prostuti.hsc27.custom | grep '^package:'
adb shell run-as com.prostuti.hsc27.custom cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'custom-private-snapshot'
