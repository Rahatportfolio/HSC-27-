package com.prostuti.hsc27;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge for {@link StudyTimerService}: start/stop the ongoing session notification. */
@CapacitorPlugin(name = "StudyTimer")
public class StudyTimerPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "পড়া চলছে");
        String body = call.getString("body", "টাইমার চলছে—অ্যাপ বন্ধ করলেও সময় গণনা চলবে।");
        Context context = getContext();
        Intent intent = new Intent(context, StudyTimerService.class);
        intent.setAction(StudyTimerService.ACTION_START);
        intent.putExtra(StudyTimerService.EXTRA_TITLE, title);
        intent.putExtra(StudyTimerService.EXTRA_BODY, body);
        Long referenceTime = call.getLong("referenceTime", 0L);
        boolean countdown = call.getBoolean("countdown", false);
        intent.putExtra(StudyTimerService.EXTRA_REFERENCE_TIME, referenceTime == null ? 0L : referenceTime);
        intent.putExtra(StudyTimerService.EXTRA_COUNTDOWN, countdown);
        try {
            Intent update = new Intent(TimerPictureInPictureActivity.ACTION_UPDATE).setPackage(context.getPackageName());
            update.putExtra(StudyTimerService.EXTRA_TITLE, title);
            update.putExtra(StudyTimerService.EXTRA_REFERENCE_TIME, referenceTime == null ? 0L : referenceTime);
            update.putExtra(StudyTimerService.EXTRA_COUNTDOWN, countdown);
            context.sendBroadcast(update);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("ফোরগ্রাউন্ড সার্ভিস চালু করা যায়নি", error);
        }
    }

    /** A native, system-managed floating clock. No draw-over-other-apps permission is needed. */
    @PluginMethod
    public void enterPictureInPicture(PluginCall call) {
        Long referenceTime = call.getLong("referenceTime", 0L);
        boolean countdown = call.getBoolean("countdown", false);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || referenceTime == null || referenceTime <= 0 ||
                !getContext().getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            JSObject result = new JSObject();
            result.put("started", false);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(getActivity(), TimerPictureInPictureActivity.class);
        intent.putExtra(StudyTimerService.EXTRA_TITLE, call.getString("title", "স্টাডি টাইমার"));
        intent.putExtra(StudyTimerService.EXTRA_REFERENCE_TIME, referenceTime);
        intent.putExtra(StudyTimerService.EXTRA_COUNTDOWN, countdown);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("ভাসমান ঘড়ি চালু করা যায়নি", error);
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.sendBroadcast(new Intent(TimerPictureInPictureActivity.ACTION_CLOSE).setPackage(context.getPackageName()));
        Intent intent = new Intent(context, StudyTimerService.class);
        intent.setAction(StudyTimerService.ACTION_STOP);
        try {
            context.startService(intent);
        } catch (Exception ignored) {
            // Android 12+ blocks starting a service from the background; stopping it is still safe.
        }
        try {
            context.stopService(new Intent(context, StudyTimerService.class));
        } catch (Exception ignored) {
            // nothing left to stop
        }
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }
}
