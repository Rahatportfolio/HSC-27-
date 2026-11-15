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

import androidx.core.app.NotificationCompat;

/**
 * Keeps a study session alive while the app sits in the background.
 *
 * The web timer already measures elapsed time from a saved start timestamp, so the
 * numbers stay exact even after the phone sleeps. What this service adds is the
 * ongoing notification plus a foreground process, which stops Android from freezing
 * the WebView (and with it the completion alert) when the student switches apps.
 */
public class StudyTimerService extends Service {
    public static final String CHANNEL_ID = "study-timer-running";
    public static final int NOTIFICATION_ID = 2727;
    public static final String ACTION_START = "com.prostuti.hsc27.START";
    public static final String ACTION_STOP = "com.prostuti.hsc27.STOP";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

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

        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification(title, body));
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
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

    private Notification buildNotification(String title, String body) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent content = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(content)
            .build();
    }

    private void removeNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }
}
