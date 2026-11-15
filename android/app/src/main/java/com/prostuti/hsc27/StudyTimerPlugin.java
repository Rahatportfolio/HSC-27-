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
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("ফোরগ্রাউন্ড সার্ভিস চালু করা যায়নি", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
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
