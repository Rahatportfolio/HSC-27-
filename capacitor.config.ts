import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android packaging is optional: the same build still runs as a PWA in a browser.
 * `npm run android:sync` copies dist/ into the native project and updates plugins.
 */
const config: CapacitorConfig = {
  appId: 'com.prostuti.hsc27',
  appName: 'প্রস্তুতি',
  webDir: 'dist',
  android: {
    backgroundColor: '#f6f7f3',
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#28634e',
    },
    /**
     * Android 15 and 16 draw every app edge-to-edge. Capacitor then injects the real
     * insets as `--safe-area-inset-*`, which the stylesheet turns into padding so the
     * status bar, the gesture bar and camera cutouts never cover content.
     */
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
