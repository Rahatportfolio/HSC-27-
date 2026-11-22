#!/usr/bin/env bash
set -euxo pipefail
cd android
./gradlew :app:assembleDebug --no-daemon --max-workers=2
cp app/build/outputs/apk/debug/app-debug.apk old-package.apk
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest -PseparateInstall=true --no-daemon --max-workers=2
cp app/build/outputs/apk/debug/app-debug.apk separate-package.apk
SDK_ROOT="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
AAPT=$(find "$SDK_ROOT/build-tools" -name aapt -type f | sort -V | tail -1)
"$AAPT" dump badging old-package.apk | grep -F "package: name='com.prostuti.hsc27'"
"$AAPT" dump badging separate-package.apk | grep -F "package: name='com.prostuti.hsc27.fresh'"
