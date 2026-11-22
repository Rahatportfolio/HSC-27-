#!/usr/bin/env bash
# Disposable emulator only. Verify both package IDs coexist and the old app's
# private data remains intact while the separate app runs its regression suite.
set -euxo pipefail
adb shell svc power stayon true
adb shell settings put system screen_off_timeout 2147483647
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell settings put global hide_error_dialogs 1
adb shell settings put global anr_show_background 0
adb shell svc wifi disable
adb shell svc data disable
adb install android/old-package.apk
adb install android/separate-package.apk
adb shell pm path com.prostuti.hsc27 | grep -q '^package:'
adb shell pm path com.prostuti.hsc27.fresh | grep -q '^package:'
adb shell "run-as com.prostuti.hsc27 sh -c 'mkdir -p files; echo original-private-snapshot > files/arena-isolation-check'"
adb shell "run-as com.prostuti.hsc27.fresh sh -c 'test ! -e files/arena-isolation-check'"
(cd android && ./gradlew :app:connectedDebugAndroidTest -PseparateInstall=true --no-daemon --stacktrace)
# Gradle uninstalls the *test target* after instrumentation. Reinstall only
# the fresh disposable-emulator package; never uninstall or modify the old one.
adb install android/separate-package.apk
adb shell pm path com.prostuti.hsc27 | grep -q '^package:'
adb shell pm path com.prostuti.hsc27.fresh | grep -q '^package:'
adb shell run-as com.prostuti.hsc27 cat files/arena-isolation-check | tr -d '\r' | grep -Fx 'original-private-snapshot'
adb shell "run-as com.prostuti.hsc27.fresh sh -c 'test ! -e files/arena-isolation-check'"
