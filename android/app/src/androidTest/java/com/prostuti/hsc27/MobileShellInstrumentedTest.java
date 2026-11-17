package com.prostuti.hsc27;

import static org.junit.Assert.*;

import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

/** UI geometry in a real Android WebView. Run on an isolated test emulator only. */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class MobileShellInstrumentedTest {
  private String evaluate(WebView web, String script) throws Exception {
    AtomicReference<String> value = new AtomicReference<>();
    CountDownLatch done = new CountDownLatch(1);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
      web.evaluateJavascript(script, result -> { value.set(result); done.countDown(); })
    );
    assertTrue("WebView callback timed out", done.await(15, TimeUnit.SECONDS));
    return value.get();
  }

  private void waitFor(WebView web, String expression) throws Exception {
    long until = SystemClock.elapsedRealtime() + 45000;
    while (SystemClock.elapsedRealtime() < until) {
      if ("true".equals(evaluate(web, expression))) return;
      SystemClock.sleep(100);
    }
    fail("Mobile shell did not become ready: " + expression);
  }

  private JSONObject object(WebView web, String expression) throws Exception {
    return new JSONObject((String) new JSONTokener(evaluate(web, "JSON.stringify(" + expression + ")")).nextValue());
  }

  private void screenshot(String name) throws Exception {
    File dir = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "mobile-shell");
    assertTrue("Could not create screenshot folder", dir.isDirectory() || dir.mkdirs());
    Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
    assertNotNull("Screenshot unavailable", image);
    try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
      assertTrue("Screenshot encoding failed", image.compress(Bitmap.CompressFormat.PNG, 100, out));
    } finally { image.recycle(); }
  }

  private boolean hasVisibleNativeToolbar(View view) {
    String name = view.getClass().getSimpleName();
    if (view.isShown() && view.getHeight() > 0 &&
        (name.equals("ActionBarContainer") || name.equals("Toolbar") || name.equals("ActionBarContextView"))) return true;
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) if (hasVisibleNativeToolbar(group.getChildAt(i))) return true;
    }
    return false;
  }

  @Test
  public void a_launchHasNoPersistentNativeLogoActionBar() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      waitFor(ref.get(), "!!document.querySelector('.topbar')");
      screenshot("startup");
      AtomicReference<String> chrome = new AtomicReference<>();
      scenario.onActivity(a -> chrome.set(
        "supportActionBar=" + (a.getSupportActionBar() != null && a.getSupportActionBar().isShowing()) +
        ", frameworkActionBar=" + (a.getActionBar() != null && a.getActionBar().isShowing()) +
        ", visibleNativeToolbar=" + hasVisibleNativeToolbar(a.getWindow().getDecorView())
      ));
      assertFalse("Persistent native splash/logo bar covers the WebView: " + chrome.get(), chrome.get().contains("true"));
      // Activity recreation must not reintroduce a toolbar after the launch screen.
      scenario.recreate();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      waitFor(ref.get(), "!!document.querySelector('.topbar')");
      screenshot("recreated");
      scenario.onActivity(a -> chrome.set("visibleNativeToolbar=" + hasVisibleNativeToolbar(a.getWindow().getDecorView())));
      assertEquals("visibleNativeToolbar=false", chrome.get());
    }
  }

  @Test
  public void b_clockAndProgressStayReadableWithAndroidTextZoomAndScroll() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      WebView web = ref.get();
      waitFor(web, "!!document.querySelector('.topbar')");
      evaluate(web, "location.hash='timer';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
      waitFor(web, "!!document.querySelector('.timer-main-button')");
      evaluate(web, "if(!document.querySelector('.live-timer-topbar.running'))document.querySelector('.timer-main-button').click();true");
      waitFor(web, "!!document.querySelector('.live-timer-topbar.running')");
      evaluate(web, "location.hash='today';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
      waitFor(web, "!!document.querySelector('.today-view')");
      for (int zoom : new int[] {100, 130}) {
        scenario.onActivity(a -> a.getBridge().getWebView().getSettings().setTextZoom(zoom));
        evaluate(web, "document.documentElement.dataset.font='lg';window.scrollTo({top:0,behavior:'instant'});true");
        SystemClock.sleep(500);
        assertClock(web, "home-" + zoom);
        JSONObject card = object(web,
          "(()=>{const e=document.querySelector('section[aria-label=\"সিলেবাসের অগ্রগতি\"]');const s=getComputedStyle(e);const r=e.getBoundingClientRect();const n=e.nextElementSibling.getBoundingClientRect();return {left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),bottom:parseFloat(s.paddingBottom),gap:n.top-r.bottom};})()"
        );
        assertTrue("Progress text needs an inset, not rounded-edge clipping: " + card, card.getDouble("left") >= 12 && card.getDouble("right") >= 12 && card.getDouble("bottom") >= 12);
        assertTrue("Adjacent dashboard cards need spacing: " + card, card.getDouble("gap") >= 10);
        evaluate(web, "window.scrollTo({top:1000,behavior:'instant'});true");
        waitFor(web, "window.scrollY>100");
        assertClock(web, "scrolled-" + zoom);
      }
      scenario.onActivity(a -> a.getBridge().getWebView().getSettings().setTextZoom(100));
    }
  }

  private void assertClock(WebView web, String stage) throws Exception {
    screenshot(stage);
    JSONObject result = object(web,
      "(()=>{const bar=document.querySelector('.live-timer-topbar');const safe=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'))||0;const clocks=[...bar.querySelectorAll('.live-clock-chip strong')].map(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:e.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right,hit:!!hit&&(hit===e||e.contains(hit))};});return {safe,width:innerWidth,height:innerHeight,clocks};})()"
    );
    assertEquals("Both elapsed and remaining clocks must be present: " + result, 2, result.getJSONArray("clocks").length());
    for (int i = 0; i < result.getJSONArray("clocks").length(); i++) {
      JSONObject clock = result.getJSONArray("clocks").getJSONObject(i);
      assertTrue(stage + ": hidden/occluded timer digits: " + result,
        clock.getDouble("top") >= result.getDouble("safe") - 1 &&
        clock.getDouble("bottom") < result.getDouble("height") &&
        clock.getDouble("left") >= 0 && clock.getDouble("right") <= result.getDouble("width") && clock.getBoolean("hit"));
    }
  }
}
