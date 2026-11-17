package com.prostuti.hsc27;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
    }
}
