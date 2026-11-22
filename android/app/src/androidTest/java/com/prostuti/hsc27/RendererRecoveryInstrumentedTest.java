package com.prostuti.hsc27;

import static org.junit.Assert.*;

import android.Manifest;
import android.os.Build;
import android.os.SystemClock;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import android.view.View;
import android.webkit.WebView;
import android.widget.Button;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Intentionally crash only a disposable emulator's WebView renderer. */
@RunWith(AndroidJUnit4.class)
public class RendererRecoveryInstrumentedTest {
  @BeforeClass public static void grantNotificationPermission() {
    if (Build.VERSION.SDK_INT >= 33) {
      InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
        InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
    }
  }

  private String eval(WebView web, String js) throws Exception {
    AtomicReference<String> result = new AtomicReference<>();
    CountDownLatch done = new CountDownLatch(1);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(js, value -> {
      result.set(value);
      done.countDown();
    }));
    assertTrue("WebView evaluation timed out", done.await(15, TimeUnit.SECONDS));
    return result.get();
  }

  private void waitFor(WebView web, String expression) throws Exception {
    long end = SystemClock.elapsedRealtime() + 60000;
    while (SystemClock.elapsedRealtime() < end) {
      if ("true".equals(eval(web, expression))) return;
      SystemClock.sleep(200);
    }
    fail("WebView did not become ready: " + expression);
  }

  /** The synthetic injected profile is not a user edit. Before an intentional
   * renderer kill, prove the native SQLite mirror actually committed it; a DOM
   * localStorage read alone does not prove its asynchronous disk flush. */
  private void waitForDurableSyntheticSnapshot() throws Exception {
    File path = InstrumentationRegistry.getInstrumentation().getTargetContext().getDatabasePath("hsc27SQLite.db");
    long end = SystemClock.elapsedRealtime() + 30000;
    while (SystemClock.elapsedRealtime() < end) {
      if (path.exists()) {
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(path.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor cursor = db.rawQuery("SELECT payload FROM app_state WHERE id = 1", null)) {
          if (cursor.moveToFirst()) {
            JSONObject snapshot = new JSONObject(cursor.getString(0));
            if ("Synthetic native test note — keep through navigation and restart".equals(snapshot.getJSONObject("notes").optString("2026-11-20"))) return;
          }
        } catch (Exception ignored) { /* The native plugin may still be opening the DB. */ }
      }
      SystemClock.sleep(100);
    }
    fail("Synthetic profile never reached the durable SQLite mirror before forced crash");
  }

  @Test public void rendererCrashShowsRecoveryAndRetainsSavedStorage() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      AtomicReference<MainActivity> first = new AtomicReference<>();
      AtomicReference<WebView> web = new AtomicReference<>();
      scenario.onActivity(a -> { first.set(a); web.set(a.getBridge().getWebView()); });
      waitFor(web.get(), "document.readyState === 'complete'");
      // Fixture writes must not race the old React document and its teardown.
      InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.get().loadUrl("https://localhost/recovery.html"));
      waitFor(web.get(), "!!document.querySelector('#recovery-profile')");
      String profile;
      try (java.io.InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("native-personal-profile.json")) {
        profile = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      }
      assertEquals("true", eval(web.get(), "localStorage.setItem('hsc27-prostuti-v1-saved-at','2099-01-01T00:00:00.000Z');localStorage.setItem('hsc27-prostuti-v1'," + JSONObject.quote(profile) + ");localStorage.setItem('renderer-recovery-test','saved synthetic value');true"));
      InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.get().loadUrl("https://localhost/#today"));
      waitFor(web.get(), "!!document.querySelector('.personal-home') && JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).notes['2026-11-20'] === 'Synthetic native test note — keep through navigation and restart'");
      waitForDurableSyntheticSnapshot();
      scenario.onActivity(a -> a.getBridge().getWebView().loadUrl("chrome://crash"));

      long deadline = SystemClock.elapsedRealtime() + 60000;
      AtomicReference<Button> recovery = new AtomicReference<>();
      while (SystemClock.elapsedRealtime() < deadline && recovery.get() == null) {
        scenario.onActivity(a -> {
          View button = a.getWindow().getDecorView().findViewWithTag(MainActivity.RENDERER_RECOVERY_BUTTON_TAG);
          if (button instanceof Button) recovery.set((Button) button);
        });
        if (recovery.get() == null) SystemClock.sleep(200);
      }
      assertNotNull("Renderer crash did not show native recovery", recovery.get());
      scenario.onActivity(a -> {
        assertNull("Broken bridge must not be reused", a.getBridge());
        assertTrue(recovery.get().performClick());
      });

      deadline = SystemClock.elapsedRealtime() + 60000;
      AtomicReference<WebView> reopened = new AtomicReference<>();
      while (SystemClock.elapsedRealtime() < deadline && reopened.get() == null) {
        try {
          scenario.onActivity(a -> {
            if (a != first.get() && a.getBridge() != null) reopened.set(a.getBridge().getWebView());
          });
        } catch (IllegalStateException ignored) { /* recreation is in progress */ }
        if (reopened.get() == null) SystemClock.sleep(200);
      }
      assertNotNull("Reopen did not create a fresh WebView", reopened.get());
      waitFor(reopened.get(), "!!document.querySelector('.personal-home')");
      assertEquals("\"saved synthetic value\"", eval(reopened.get(), "localStorage.getItem('renderer-recovery-test')"));
      assertEquals("\"Synthetic native test note — keep through navigation and restart\"", eval(reopened.get(), "JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).notes['2026-11-20']"));
      assertEquals("true", eval(reopened.get(), "JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).personalRoutine.chapterIds.includes('physics-1-3')"));
      eval(reopened.get(), "localStorage.removeItem('renderer-recovery-test');true");
    }
  }
}
