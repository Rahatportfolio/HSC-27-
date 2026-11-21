package com.prostuti.hsc27;

import static org.junit.Assert.*;

import android.Manifest;
import android.os.Build;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Slow network/model probe: run explicitly on a disposable Android emulator only. */
@RunWith(AndroidJUnit4.class)
public class AiModelIntegrationTest {
  @BeforeClass public static void dismissNotificationPrecondition() {
    if (Build.VERSION.SDK_INT >= 33) {
      InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
        InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
    }
  }
  private String eval(WebView web, String js) throws Exception {
    AtomicReference<String> result = new AtomicReference<>();
    CountDownLatch done = new CountDownLatch(1);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(js, value -> { result.set(value); done.countDown(); }));
    assertTrue("WebView evaluation timed out", done.await(15, TimeUnit.SECONDS));
    return result.get();
  }
  private void waitFor(WebView web, String condition, long timeout) throws Exception {
    long deadline = SystemClock.elapsedRealtime() + timeout;
    while (SystemClock.elapsedRealtime() < deadline) {
      if ("true".equals(eval(web, condition))) return;
      SystemClock.sleep(500);
    }
    fail("AI probe timed out: " + condition + "; body=" + eval(web, "document.body.innerText.slice(-2500)"));
  }
  private void openModel(WebView web) throws Exception {
    eval(web, "location.hash='brain';dispatchEvent(new HashChangeEvent('hashchange'));true");
    // The view can render before native storage hydration completes. Do not
    // click its disabled opt-in control and then mistake the no-op for a model
    // failure; wait until the panel exists or the button is actually enabled.
    waitFor(web, "!!document.querySelector('.ai-modes button:nth-child(2)') || !!document.querySelector('.brain-welcome button.primary:not(:disabled)')", 60000);
    if ("true".equals(eval(web, "!!document.querySelector('.brain-welcome button.primary:not(:disabled)')"))) {
      eval(web, "document.querySelector('.brain-welcome button.primary').click();true");
    }
    waitFor(web, "!!document.querySelector('.ai-modes button:nth-child(2)')", 60000);
    eval(web, "document.querySelector('.ai-modes button:nth-child(2)').click();true");
    waitFor(web, "!!document.querySelector('.ai-download button')", 30000);
    eval(web, "document.querySelector('.ai-download button').click();true");
    waitFor(web, "!!document.querySelector('.ai-ready, .ai-panel .field-error')", 300000);
    assertEquals("Model did not start; body=" + eval(web, "document.querySelector('.ai-panel').innerText"), "true", eval(web, "!!document.querySelector('.ai-ready')"));
  }
  private void ask(WebView web) throws Exception {
    eval(web, "(()=>{let e=document.querySelector('#ai-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'What is water made of?');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
    eval(web, "document.querySelector('.ai-input button[type=submit]').click();true");
    waitFor(web, "!!document.querySelector('.ai-message.assistant, .ai-panel .field-error')", 300000);
    assertEquals("Inference failed; body=" + eval(web, "document.querySelector('.ai-panel').innerText"), "true", eval(web, "!!document.querySelector('.ai-message.assistant')"));
  }
  @Test public void modelRunsOnlineAndAfterOfflineActivityRestart() throws Exception {
    Assume.assumeTrue("Slow model probe is opt-in", "true".equals(InstrumentationRegistry.getArguments().getString("aiIntegration")));
    String raw;
    try (java.io.InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("native-personal-profile.json")) {
      raw = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      WebView web = ref.get();
      waitFor(web, "document.readyState==='complete'", 60000);
      SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
      format.setTimeZone(TimeZone.getTimeZone("UTC"));
      String stamp = format.format(new Date(System.currentTimeMillis() + 86400000L));
      eval(web, "localStorage.setItem('hsc27-prostuti-v1-saved-at'," + JSONObject.quote(stamp) + ");localStorage.setItem('hsc27-prostuti-v1'," + JSONObject.quote(raw) + ");true");
      InstrumentationRegistry.getInstrumentation().runOnMainSync(web::reload);
      waitFor(web, "!!document.querySelector('.personal-home')", 60000);
      openModel(web); ask(web);
      // Disable both network transports on the disposable emulator, then destroy
      // the WebView activity so an in-memory model cannot satisfy the second run.
      InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("svc wifi disable").close();
      InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("svc data disable").close();
      scenario.recreate();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      web = ref.get();
      waitFor(web, "document.readyState==='complete'", 60000);
      openModel(web); ask(web);
    }
  }
}
