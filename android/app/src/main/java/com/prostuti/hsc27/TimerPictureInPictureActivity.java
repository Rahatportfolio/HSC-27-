package com.prostuti.hsc27;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.content.Context;

import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.widget.Chronometer;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** A real Android PiP window: the native chronometer keeps updating outside the WebView. */
public class TimerPictureInPictureActivity extends Activity {
    public static final String ACTION_UPDATE = "com.prostuti.hsc27.PIP_UPDATE";
    public static final String ACTION_CLOSE = "com.prostuti.hsc27.PIP_CLOSE";
    private Chronometer clock;
    private TextView heading;
    private TextView title;
    private final BroadcastReceiver timerUpdates = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (ACTION_CLOSE.equals(intent.getAction())) finish();
            else if (ACTION_UPDATE.equals(intent.getAction())) applyTimer(intent);
        }
    };
    private boolean requested = false;
    private boolean entered = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent intent = getIntent();
        long reference = intent.getLongExtra(StudyTimerService.EXTRA_REFERENCE_TIME, 0L);
        boolean countdown = intent.getBooleanExtra(StudyTimerService.EXTRA_COUNTDOWN, false);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || reference <= 0 ||
                !getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            finish();
            return;
        }
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(12, 8, 12, 8);
        layout.setBackgroundColor(Color.rgb(20, 39, 31));

        heading = new TextView(this);
        heading.setText(countdown ? "বাকি সময়" : "অতিবাহিত সময়");
        heading.setTextColor(Color.rgb(177, 219, 197));
        heading.setTextSize(13);
        heading.setGravity(Gravity.CENTER);
        layout.addView(heading);

        clock = new Chronometer(this);
        clock.setTextColor(Color.WHITE);
        clock.setTextSize(30);
        clock.setGravity(Gravity.CENTER);
        clock.setBase(SystemClock.elapsedRealtime() + reference - System.currentTimeMillis());
        clock.setCountDown(countdown);
        if (countdown) {
            clock.setOnChronometerTickListener(value -> {
                if (SystemClock.elapsedRealtime() >= value.getBase()) {
                    value.stop();
                    value.setBase(SystemClock.elapsedRealtime());
                }
            });
        }
        layout.addView(clock);
        title = new TextView(this);
        title.setText(intent.getStringExtra(StudyTimerService.EXTRA_TITLE));
        title.setTextColor(Color.rgb(220, 235, 225));
        title.setTextSize(12);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setGravity(Gravity.CENTER);
        layout.addView(title);
        setContentView(layout);
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_UPDATE);
        filter.addAction(ACTION_CLOSE);
        ContextCompat.registerReceiver(this, timerUpdates, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        clock.start();
    }

    private void applyTimer(Intent intent) {
        long reference = intent.getLongExtra(StudyTimerService.EXTRA_REFERENCE_TIME, 0L);
        if (reference <= 0) { finish(); return; }
        boolean countdown = intent.getBooleanExtra(StudyTimerService.EXTRA_COUNTDOWN, false);
        heading.setText(countdown ? "বাকি সময়" : "অতিবাহিত সময়");
        title.setText(intent.getStringExtra(StudyTimerService.EXTRA_TITLE));
        clock.stop();
        clock.setBase(SystemClock.elapsedRealtime() + reference - System.currentTimeMillis());
        clock.setCountDown(countdown);
        clock.setOnChronometerTickListener(countdown ? value -> {
            if (SystemClock.elapsedRealtime() >= value.getBase()) {
                value.stop();
                value.setBase(SystemClock.elapsedRealtime());
            }
        } : null);
        clock.start();
    }

    @Override protected void onDestroy() {
        try { unregisterReceiver(timerUpdates); } catch (IllegalArgumentException ignored) { }
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (requested || isFinishing()) return;
        requested = true;
        getWindow().getDecorView().post(() -> {
            if (isFinishing()) return;
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9)).build();
                if (!enterPictureInPictureMode(params)) {
                    Toast.makeText(this, "Picture-in-picture অনুমতি চালু করো।", Toast.LENGTH_LONG).show();
                    finish();
                }
            } catch (Exception error) {
                Toast.makeText(this, "ভাসমান ঘড়ি চালু করা যায়নি।", Toast.LENGTH_LONG).show();
                finish();
            }
        });
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPictureInPictureMode) {
        super.onPictureInPictureModeChanged(inPictureInPictureMode);
        if (inPictureInPictureMode) entered = true;
        else if (entered) finish();
    }
}
