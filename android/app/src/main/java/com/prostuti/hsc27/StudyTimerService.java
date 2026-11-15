package com.prostuti.hsc27;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

/**
 * Keeps a study session alive while the app sits in the background.
 *
 * The WebView uses a saved wall-clock timestamp; Android's notification chronometer
 * independently displays the same clock, including while the WebView is suspended.
 * Completion alerts are scheduled separately and may be delayed by system settings.
 */
public class StudyTimerService extends Service {
    public static final String CHANNEL_ID = "study-timer-running";
    public static final int NOTIFICATION_ID = 2727;
    public static final String ACTION_START = "com.prostuti.hsc27.START";
    public static final String ACTION_STOP = "com.prostuti.hsc27.STOP";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_REFERENCE_TIME = "referenceTime";
    public static final String EXTRA_COUNTDOWN = "countdown";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable finishCountdown = this::stopSelf;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            removeNotification();
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent == null ? null : intent.getStringExtra(EXTRA_TITLE);
        String body = intent == null ? null : intent.getStringExtra(EXTRA_BODY);
        if (title == null || title.trim().isEmpty()) title = "পড়া চলছে";
        if (body == null || body.trim().isEmpty()) body = "টাইমার চলছে—অ্যাপ বন্ধ করলেও সময় গণনা চলবে।";

        long referenceTime = intent == null ? 0L : intent.getLongExtra(EXTRA_REFERENCE_TIME, 0L);
        boolean countdown = intent != null && intent.getBooleanExtra(EXTRA_COUNTDOWN, false);
        handler.removeCallbacks(finishCountdown);
        if (referenceTime <= 0 || (countdown && referenceTime <= System.currentTimeMillis())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification(title, body, referenceTime, countdown));
        if (countdown && referenceTime > 0) {
            handler.postDelayed(finishCountdown, Math.max(0, referenceTime - System.currentTimeMillis()));
        }
        return START_REDELIVER_INTENT;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(finishCountdown);
        removeNotification();
        super.onDestroy();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "স্টাডি টাইমার",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("সেশন চলার সময় চলমান নোটিফিকেশন");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String title, String body, long referenceTime, boolean countdown) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent content = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(content);
        if (referenceTime > 0) {
            builder.setWhen(referenceTime).setShowWhen(true).setUsesChronometer(true)
                .setChronometerCountDown(countdown);
        } else {
            builder.setShowWhen(false);
        }
        return builder.build();
    }

    private void removeNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }
}
