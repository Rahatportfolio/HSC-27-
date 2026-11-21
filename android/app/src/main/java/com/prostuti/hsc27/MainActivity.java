package com.prostuti.hsc27;

import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    static final String RENDERER_RECOVERY_BUTTON_TAG = "renderer-recovery-restart";
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Apply postSplashScreenTheme BEFORE EdgeToEdge touches window.decorView.
        // Inflating decor under Theme.SplashScreen can leave a framework ActionBar
        // behind, painted with the stretched splash image and covering the clock.
        SplashScreen.installSplashScreen(this);
        registerPlugin(StudyTimerPlugin.class);
        registerPlugin(StudyFilesPlugin.class);
        // Android 15/16 force edge-to-edge; enabling it on Android 14 as well keeps the
        // layout identical on every supported version. Insets arrive as CSS variables
        // through Capacitor's SystemBars handling.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        if (bridge != null) bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                return showRendererRecovery(view);
            }
        });
    }

    /** A dead WebView cannot be reused. Keep persisted data intact and ask the
     * user before recreating the Activity, rather than silently restarting a
     * resource-heavy model or allowing Chromium to terminate the whole app. */
    private boolean showRendererRecovery(WebView view) {
        Bridge oldBridge = bridge;
        if (oldBridge == null || oldBridge.getWebView() != view) return false;
        bridge = null; // BridgeActivity must not call into the destroyed WebView again.
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        try {
            oldBridge.onDestroy();
        } catch (RuntimeException error) {
            Log.e("ProstutiRecovery", "Could not fully shut down old bridge", error);
        }
        view.removeAllViews();
        view.destroy();

        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(pad, pad, pad, pad);
        TextView message = new TextView(this);
        message.setTextSize(18);
        message.setText("অ্যাপের পর্দা বন্ধ হয়েছে। কম মেমোরি বা অন্য ত্রুটি এর কারণ হতে পারে। সংরক্ষিত তথ্য মুছে ফেলা হয়নি; অসংরক্ষিত পরিবর্তন হারিয়ে যেতে পারে। আবার খুলে চাইলে স্মার্ট ব্রেইন ব্যবহার করো।\n\nThe app screen stopped, possibly due to low memory or another error. Saved data has not been erased; unsaved changes may be lost. Reopen and consider using Smart brain.");
        Button restart = new Button(this);
        restart.setTag(RENDERER_RECOVERY_BUTTON_TAG);
        restart.setText("অ্যাপ আবার খোলো / Reopen app");
        restart.setOnClickListener((View ignored) -> recreate());
        layout.addView(message);
        layout.addView(restart);
        setContentView(layout);
        return true;
    }
}
