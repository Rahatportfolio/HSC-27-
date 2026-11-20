package com.prostuti.hsc27;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.KeyguardManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.BeforeClass;
import org.junit.FixMethodOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.MethodSorters;

/** UI geometry and real taps in Android WebView. Isolated test emulator only. */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class MobileShellInstrumentedTest {
  @BeforeClass
  public static void grantNotificationPrecondition() {
    PowerManager power = InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(PowerManager.class);
    KeyguardManager keyguard = InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(KeyguardManager.class);
    assertTrue("Test emulator must be awake before Activity/window tests", power.isInteractive());
    assertFalse("Test emulator must be unlocked before Activity/window tests", keyguard.isKeyguardLocked());
    // A system permission prompt is not the UI under test. Do not leave it on top
    // of later ActivityScenario/storage tests after starting the first timer.
    if (Build.VERSION.SDK_INT >= 33) {
      InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(
        InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName(),
        Manifest.permission.POST_NOTIFICATIONS
      );
    }
  }

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
      if ("true".equals(evaluate(web, expression))) {
        // DOM readiness precedes compositor presentation. Wait for a real WebView
        // draw before capturing pixels or injecting a screen-coordinate tap.
        CountDownLatch painted = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.postVisualStateCallback(
          SystemClock.uptimeMillis(), new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) { painted.countDown(); }
          }
        ));
        assertTrue("WebView did not present its layout", painted.await(15, TimeUnit.SECONDS));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        SystemClock.sleep(150);
        return;
      }
      SystemClock.sleep(100);
    }
    fail("Mobile shell did not become ready: " + expression);
  }

  private JSONObject object(WebView web, String expression) throws Exception {
    String raw = evaluate(web, "JSON.stringify((()=>{try{return (" + expression + ");}catch(error){return {__measurementError:String(error),stack:String(error.stack)};}})())");
    Object decoded = new JSONTokener(raw == null ? "null" : raw).nextValue();
    assertTrue("WebView returned no geometry; raw=" + raw + ", expression=" + expression, decoded instanceof String);
    JSONObject result = new JSONObject((String) decoded);
    assertFalse("WebView measurement threw: " + result, result.has("__measurementError"));
    return result;
  }

  private File evidenceDirectory() {
    File dir = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "mobile-shell");
    assertTrue("Could not create evidence folder", dir.isDirectory() || dir.mkdirs());
    return dir;
  }

  private void record(String stage, JSONObject result) throws Exception {
    result.put("stage", stage).put("androidApi", Build.VERSION.SDK_INT);
    try (FileOutputStream out = new FileOutputStream(new File(evidenceDirectory(), "measurements.jsonl"), true)) {
      out.write((result.toString() + "\n").getBytes(StandardCharsets.UTF_8));
    }
    publishEvidence();
  }

  private void publishEvidence() throws Exception {
    // Gradle may uninstall the instrumented APK at teardown, removing its scoped
    // external-files folder. Copy test-only evidence via the emulator shell first.
    shell("mkdir -p /sdcard/Download/prostuti-instrumented-shell");
    shell("cp -r " + evidenceDirectory().getAbsolutePath() + "/. /sdcard/Download/prostuti-instrumented-shell");
    String files = shell("ls /sdcard/Download/prostuti-instrumented-shell");
    assertTrue("Could not retain emulator evidence: " + files, files.contains(".png") || files.contains("measurements.jsonl"));
  }

  private String shell(String command) throws Exception {
    try (InputStream stream = new ParcelFileDescriptor.AutoCloseInputStream(
      InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command)
    )) {
      return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private void screenshot(String name) throws Exception {
    Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
    assertNotNull("Screenshot unavailable", image);
    try (FileOutputStream out = new FileOutputStream(new File(evidenceDirectory(), name + ".png"))) {
      assertTrue("Screenshot encoding failed", image.compress(Bitmap.CompressFormat.PNG, 100, out));
    } finally { image.recycle(); }
    publishEvidence();
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

  /**
   * UiAutomation.executeShellCommand runs the raw command without a shell, so a
   * literal pipe is rejected by dumpsys (observed as "Bad window command ...
   * |"). Filter the dump in Java instead of piping it.
   */
  private String focusedWindowLines(String dump) {
    StringBuilder kept = new StringBuilder();
    for (String line : dump.split("\n")) {
      String trimmed = line.trim();
      if (trimmed.startsWith("mCurrentFocus") || trimmed.startsWith("mFocusedApp") || trimmed.startsWith("mTopFocusedDisplayId")) {
        if (kept.length() > 0) kept.append('\n');
        kept.append(trimmed);
      }
    }
    return kept.length() == 0 ? "(no focus lines in dumpsys window)" : kept.toString();
  }

  private void waitForFocusedWindow(WebView web) throws Exception {
    // A presented WebView frame does not imply that Android's input dispatcher
    // has focused its window after Activity launch/recreation (notably API 35).
    // Do not bypass a system dialog or inject into another app's window.
    long until = SystemClock.elapsedRealtime() + 15000;
    int stable = 0;
    while (SystemClock.elapsedRealtime() < until) {
      boolean[] ready = new boolean[1];
      InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
        ready[0] = web.isAttachedToWindow() && web.isShown() && web.hasWindowFocus()
      );
      stable = ready[0] ? stable + 1 : 0;
      if (stable >= 2) return;
      SystemClock.sleep(100);
    }
    // On API 35 the system launcher can throw its own ANR dialog while the
    // WebView is still settling. That dialog takes the input focus away from
    // our window, so every later tap would be refused. Dismiss only that
    // system-owned ANR (never our app, never a permission/keyguard dialog),
    // then let the ordinary focus wait finish on its own.
    String owner = focusedWindowLines(shell("dumpsys window"));
    if (owner.contains("Application Not Responding") && !owner.contains("com.prostuti.hsc27")) {
      record("system-anr-dismissed", new JSONObject().put("windowOwner", owner));
      shell("input keyevent KEYCODE_ENTER");
      long retryUntil = SystemClock.elapsedRealtime() + 15000;
      while (SystemClock.elapsedRealtime() < retryUntil) {
        boolean[] focused = new boolean[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> focused[0] = web.hasWindowFocus());
        if (focused[0]) return;
        SystemClock.sleep(150);
        // A second ANR can appear while the first is closing; keep pressing OK.
        String again = focusedWindowLines(shell("dumpsys window"));
        if (again.contains("Application Not Responding") && !again.contains("com.prostuti.hsc27")) shell("input keyevent KEYCODE_ENTER");
      }
      owner = focusedWindowLines(shell("dumpsys window"));
    }
    PowerManager power = InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(PowerManager.class);
    KeyguardManager keyguard = InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(KeyguardManager.class);
    record("unfocused-input", new JSONObject().put("interactive", power.isInteractive()).put("keyguardLocked", keyguard.isKeyguardLocked()).put("windowOwner", owner));
    screenshot("unfocused-input");
    fail("App window never gained input focus; refusing an unowned screen tap. interactive=" + power.isInteractive() + ", keyguardLocked=" + keyguard.isKeyguardLocked() + ", owner=" + owner);
  }

  private void tap(WebView web, String selector) throws Exception {
    waitFor(web, "!!document.querySelector(" + JSONObject.quote(selector) + ")");
    waitForFocusedWindow(web);
    waitFor(web, "!document.fonts||document.fonts.status==='loaded'");
    evaluate(web, "document.querySelector(" + JSONObject.quote(selector) + ").scrollIntoView({block:'center',behavior:'instant'});true");
    SystemClock.sleep(300);
    JSONObject point = object(web,
      "(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");const r=e.getBoundingClientRect();let zoom=1;for(let p=e;p;p=p.parentElement){zoom*=parseFloat(getComputedStyle(p).zoom)||1;}" +
      // Accept an Android CSS-zoom coordinate space ONLY when the ordinary
      // viewport mapping fails and THREE exposed points, including both near
      // edges, prove that the adjusted box hits this exact control. No JS click,
      // overlay removal, arbitrary point search or unverified coordinate guess.
      "const spaces=[{method:'viewport DOMRect',scale:1}];if(/Android/.test(navigator.userAgent)&&zoom>1.05)spaces.push({method:'verified Android CSS-zoom coordinates',scale:zoom});" +
      "const probes=spaces.map(space=>{const box={left:r.left*space.scale,top:r.top*space.scale,width:r.width*space.scale,height:r.height*space.scale};const points=[.04,.5,.96].map(fraction=>{const x=box.left+box.width*fraction,y=box.top+box.height/2,h=document.elementFromPoint(x,y);return {x,y,exposed:x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&!!h&&(h===e||e.contains(h)),blocker:h?.tagName+'.'+h?.className,html:h?.outerHTML.slice(0,350)};});return {...space,box,points,exposed:points.every(point=>point.exposed)};});" +
      "const chosen=probes.find(probe=>probe.exposed)||probes[0];return {x:chosen.points[1].x,y:chosen.points[1].y,width:innerWidth,height:innerHeight,hit:chosen.exposed,disabled:!!e.disabled,zoom,method:chosen.method,userAgent:navigator.userAgent,probes};})()"
    );
    if (!point.getBoolean("hit") || point.getBoolean("disabled")) {
      record("blocked-touch", new JSONObject().put("selector", selector).put("point", point));
      screenshot("blocked-touch");
    } else if (!point.getString("method").equals("viewport DOMRect")) {
      record("native-coordinate-calibration", new JSONObject().put("selector", selector).put("point", point));
    }
    assertFalse("Tap target is disabled: " + selector + " " + point, point.getBoolean("disabled"));
    assertTrue("Tap target is covered: " + selector + " " + point, point.getBoolean("hit"));
    final float[] coordinates = new float[2];
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
      int[] origin = new int[2]; web.getLocationOnScreen(origin);
      float scale = (float) (web.getWidth() / point.optDouble("width"));
      coordinates[0] = origin[0] + (float) point.optDouble("x") * scale;
      coordinates[1] = origin[1] + (float) point.optDouble("y") * scale;
    });
    long at = SystemClock.uptimeMillis();
    MotionEvent down = MotionEvent.obtain(at, at, MotionEvent.ACTION_DOWN, coordinates[0], coordinates[1], 0);
    MotionEvent up = MotionEvent.obtain(at, at + 80, MotionEvent.ACTION_UP, coordinates[0], coordinates[1], 0);
    down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
    up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
    try {
      InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
      InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
    } catch (RuntimeException error) {
      screenshot("failed-input");
      throw new AssertionError("Real tap failed for " + selector + " at screen (" + coordinates[0] + "," + coordinates[1] + "), DOM=" + point, error);
    } finally { down.recycle(); up.recycle(); }
  }

  @Test
  public void a_launchHasNoPersistentNativeLogoActionBar() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      waitFor(ref.get(), "!!document.querySelector('.personal-setup form')");
      assertEquals("Fresh Android users must give availability before receiving a routine", "true", evaluate(ref.get(), "!document.querySelector('.today-view')&&!document.querySelector('.personal-home')&&!JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).personalRoutine"));
      record("availability-first", new JSONObject().put("freshSetupVisible", true).put("automaticRoutineCreated", false));
      screenshot("startup");
      AtomicReference<String> chrome = new AtomicReference<>();
      scenario.onActivity(a -> chrome.set(
        "supportActionBar=" + (a.getSupportActionBar() != null && a.getSupportActionBar().isShowing()) +
        ", frameworkActionBar=" + (a.getActionBar() != null && a.getActionBar().isShowing()) +
        ", visibleNativeToolbar=" + hasVisibleNativeToolbar(a.getWindow().getDecorView())
      ));
      record("startup", new JSONObject().put("chrome", chrome.get()));
      assertFalse("Persistent native splash/logo bar covers the WebView: " + chrome.get(), chrome.get().contains("true"));
      scenario.recreate();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      // Wait for this Activity's own WebView, not whichever document finishing
      // load happened last. Then prove the fresh availability-first form is
      // still the visible screen rather than a partially mounted shell.
      waitFor(ref.get(), "!!document.querySelector('.topbar') && !!document.querySelector('.personal-setup form')");
      assertEquals("Recreation must not create a routine for a fresh user",
        "true", evaluate(ref.get(), "!JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).personalRoutine&&!!JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).routineSetupRequired"));
      screenshot("recreated");
      scenario.onActivity(a -> chrome.set("visibleNativeToolbar=" + hasVisibleNativeToolbar(a.getWindow().getDecorView())));
      record("recreated", new JSONObject().put("chrome", chrome.get()));
      assertEquals("visibleNativeToolbar=false", chrome.get());
      completeFreshSetupAndRecover(scenario, ref.get());
    }
  }

  /** Actual fresh-app form, not a synthetic saved-profile shortcut. Field entry
   * uses DOM input events; all choices/Next/Save/completion use real native taps.
   * This does not certify an OEM soft keyboard or a live YouTube catalogue. */
  private void enterField(WebView web, String selector, String value) throws Exception {
    waitFor(web, "!!document.querySelector(" + JSONObject.quote(selector) + ")");
    evaluate(web, "(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e," + JSONObject.quote(value) + ");e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
    waitFor(web, "document.querySelector(" + JSONObject.quote(selector) + ").value===" + JSONObject.quote(value));
  }

  private void completeFreshSetupAndRecover(ActivityScenario<MainActivity> scenario, WebView web) throws Exception {
    waitFor(web, "!!document.querySelector('.personal-setup form')");
    tap(web, ".lang-toggle-chip");
    waitFor(web, "document.documentElement.lang==='en'");
    // Invalid empty form cannot skip availability or create default hours.
    tap(web, ".personal-setup-actions button[type='submit']");
    waitFor(web, "!!document.querySelector('.personal-setup [role=alert]')");
    assertEquals("Empty availability created a routine", "true", evaluate(web, "!JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).personalRoutine"));
    tap(web, ".availability-row .text-button");
    enterField(web, "input[aria-label='Window 1 start']", "18:00");
    enterField(web, "input[aria-label='Window 1 end']", "22:00");
    enterField(web, ".personal-availability>.form-label input", "4");
    tap(web, "input[name='fixed-obligations'][value='none']");
    enterField(web, ".personal-session-options label:first-child input", "60");
    enterField(web, ".personal-session-options label:last-child input", "5");
    tap(web, ".personal-setup-actions button[type='submit']");
    waitFor(web, "!!document.querySelector('.personal-chapter-choices')");
    tap(web, ".personal-shortlist-actions .button.ghost");
    tap(web, ".personal-chapter-choices input[value='physics-1-3']");
    tap(web, ".personal-chapter-choices input[value='chemistry-1-3']");
    tap(web, ".personal-setup-actions button[type='submit']");
    waitFor(web, "!!document.querySelector('.personal-workload-editor')");
    // Step 3 opens on the editable 20-hour estimate and is optional: the plan is
    // already dated before any minute is typed here.
    assertEquals("Step 3 must open on the editable 20-hour estimate, not a blank plan", "true",
        evaluate(web, "(()=>{const t=document.querySelector('.personal-workload-editor').textContent;return t.includes('The schedule already works')&&t.includes('each chapter gets');})()"));
    // The two first-pair buttons select different chapters without feeding a
    // prebuilt profile into storage. Long durations must NOT become 80 minutes.
    for (int chapter = 1; chapter <= 2; chapter++) {
      tap(web, ".personal-workload-editor .personal-shortlist-actions button:nth-child(" + chapter + ")");
      enterField(web, "input[aria-label='Chapter class minutes']", chapter == 1 ? "480" : "420");
      enterField(web, "input[aria-label='Textbook reading minutes']", "30");
      enterField(web, "input[aria-label='Note making minutes']", "20");
      enterField(web, "input[aria-label='MCQ solving class minutes']", "0");
      enterField(web, "input[aria-label='Own MCQ practice minutes']", "45");
      enterField(web, "input[aria-label='CQ solving class minutes']", "0");
      enterField(web, "input[aria-label='Own CQ practice minutes']", "60");
      enterField(web, "input[aria-label='Chapter revision minutes']", "20");
    }
    tap(web, ".personal-setup-actions button[type='submit']");
    waitFor(web, "!!document.querySelector('.personal-preview-day')");
    assertEquals("Capacity must extend the same pair rather than claim a two-day finish", "true", evaluate(web, "document.querySelector('.personal-preview').textContent.includes('SAME pair continues on extra days')"));
    screenshot("new-student-preview");
    tap(web, ".personal-setup-actions button[type='submit']");
    waitFor(web, "!!document.querySelector('.personal-home .personal-tasks .task-check')");
    JSONObject saved = object(web, "JSON.parse(localStorage.getItem('hsc27-prostuti-v1'))");
    JSONObject routine = saved.getJSONObject("personalRoutine");
    assertFalse("Setup flag was not completed", saved.getBoolean("routineSetupRequired"));
    assertEquals("2026-11-20", saved.getJSONObject("settings").getString("startDate"));
    assertEquals("S", routine.getString("scope"));
    assertEquals(2, routine.getJSONArray("chapterIds").length());
    assertEquals(7, routine.getJSONArray("windows").length());
    assertEquals(240, routine.getInt("dailyLimitMinutes"));
    assertEquals(480, routine.getJSONObject("workloads").getJSONObject("physics-1-3").getJSONObject("class").getInt("minutes"));
    assertEquals(420, routine.getJSONObject("workloads").getJSONObject("chemistry-1-3").getJSONObject("class").getInt("minutes"));
    tap(web, ".personal-tasks .task-check");
    enterField(web, "textarea[aria-label='Day note']", "Native fresh setup note: retain after restart and recovery");
    waitFor(web, "(()=>{const d=JSON.parse(localStorage.getItem('hsc27-prostuti-v1'));return Object.keys(d.completed).length===1&&Object.values(d.notes).includes('Native fresh setup note: retain after restart and recovery');})()");
    assertEquals("A single segment must not finish a chapter", "0/2", new JSONTokener(evaluate(web, "document.querySelector('.personal-goal .card-heading>strong').textContent")).nextValue());
    String retained = evaluate(web, "(()=>{const d=JSON.parse(localStorage.getItem('hsc27-prostuti-v1'));return JSON.stringify([d.personalRoutine,d.notes,d.completed]);})()");
    scenario.recreate();
    AtomicReference<WebView> ref = new AtomicReference<>();
    scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
    web = ref.get();
    waitFor(web, "!!document.querySelector('.personal-home')");
    // No grace loop: the teardown flush must already own this write. A delayed
    // re-read would hide a real loss caused by a late debounce or missing flush.
    assertEquals("Fresh setup lost routine/notes/completion after native recreation", retained, evaluate(web, "(()=>{const d=JSON.parse(localStorage.getItem('hsc27-prostuti-v1'));return JSON.stringify([d.personalRoutine,d.notes,d.completed]);})()"));
    record("new-student-setup-restart", new JSONObject().put("noProfileInjection", true).put("nativeChoiceAndSubmitTaps", true).put("fieldEntry", "DOM input events, not soft-keyboard certification").put("shortlistChapters", 2).put("dailyNetMinutes", 240).put("retainedRoutineNotesCompletion", true));
    screenshot("new-student-after-restart");
    String raw = evaluate(web, "localStorage.getItem('hsc27-prostuti-v1')");
    final WebView recoveryWeb = web;
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> recoveryWeb.loadUrl("https://localhost/recovery.html"));
    waitFor(web, "!!document.querySelector('#recovery-profile')");
    tap(web, "#recovery-profile");
    waitFor(web, "!!document.querySelector('#recovery-json').value");
    assertEquals("Independent native recovery changed raw JSON", raw, evaluate(web, "document.querySelector('#recovery-json').value"));
    assertEquals("Independent native recovery wrote to storage", raw, evaluate(web, "localStorage.getItem('hsc27-prostuti-v1')"));
    screenshot("new-student-independent-recovery");
    tap(web, "#recovery-reopen");
    waitFor(web, "!!document.querySelector('.personal-home')");
    assertEquals("Returning from native recovery changed routine/history", retained, evaluate(web, "(()=>{const d=JSON.parse(localStorage.getItem('hsc27-prostuti-v1'));return JSON.stringify([d.personalRoutine,d.notes,d.completed]);})()"));
    record("new-student-independent-recovery", new JSONObject().put("exactRawLocalJson", true).put("zeroRecoveryStorageWrites", true).put("returnedToSavedRoutine", true).put("sqliteOrMediaRecoveryCertified", false));
  }

  private String syntheticProfile(String profile) throws Exception {
    try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("native-" + profile + "-profile.json")) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private void loadSyntheticProfile(WebView web, String profile) throws Exception {
    // Isolated instrumentation emulator only. The app still requires real new
    // users to finish availability setup. Do not add a production test hook or
    // weaken that rule merely to make this legacy-dashboard regression pass.
    String raw = syntheticProfile(profile);
    // Replace the durable SQLite mirror together with local storage. Without
    // this the mount-time restore can re-apply an older real snapshot over the
    // synthetic profile: a newer mirror stamp wins by design in production.
    // Isolated instrumentation emulator only; no production test hook exists.
    // A fixed literal pattern with zone UTC keeps this independent of host locale.
    long syntheticEpoch = System.currentTimeMillis() + 86_400_000L;
    String iso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US) {{ setTimeZone(java.util.TimeZone.getTimeZone("UTC")); }}.format(new java.util.Date(syntheticEpoch));
    assertTrue("Synthetic stamp must stay a valid ISO instant", iso.endsWith("Z") && iso.length() == 24);
    evaluate(web,
      "(()=>{const key='hsc27-prostuti-v1', stampKey=key+'-saved-at';" +
      "localStorage.setItem(stampKey," + JSONObject.quote(iso) + ");" +
      "localStorage.setItem(key," + JSONObject.quote(raw) + ");history.replaceState(null,'','#today');return true;})()"
    );
    InstrumentationRegistry.getInstrumentation().runOnMainSync(web::reload);
    waitFor(web, "!!document.querySelector('" + (profile.equals("personal") ? ".personal-home" : ".today-view") + "')");
  }

  private void assertSyntheticProfile(WebView web, String profile) throws Exception {
    JSONObject result = object(web,
      "(()=>{const actual=JSON.parse(localStorage.getItem('hsc27-prostuti-v1')),expected=" + syntheticProfile(profile) + ";return {" +
      "notesUnchanged:JSON.stringify(actual.notes)===JSON.stringify(expected.notes)," +
      "completionUnchanged:JSON.stringify(actual.completed)===JSON.stringify(expected.completed)," +
      "routineUnchanged:JSON.stringify(actual.personalRoutine||null)===JSON.stringify(expected.personalRoutine||null)};})()"
    );
    record(profile + "-retained-profile", result);
    assertTrue("Clock/navigation changed private notes: " + result, result.getBoolean("notesUnchanged"));
    assertTrue("Clock/navigation certified unfinished work: " + result, result.getBoolean("completionUnchanged"));
    assertTrue("Clock/navigation silently changed the routine: " + result, result.getBoolean("routineUnchanged"));
  }

  @Test
  public void b_clockAndProgressStayReadableWithAndroidTextZoomAndScroll() throws Exception {
    try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      WebView web = ref.get();
      waitFor(web, "!!document.querySelector('.topbar')");
      for (String profile : new String[] {"legacy", "personal"}) {
        loadSyntheticProfile(web, profile);
        try {
          evaluate(web, "location.hash='timer';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
          waitFor(web, "!!document.querySelector('.timer-main-button')");
          // A paused clock deliberately survives profile/restart. Reset it via
          // the real confirmation UI before selecting another synthetic run.
          if ("true".equals(evaluate(web, "!!document.querySelector('.timer-presets > button:nth-child(5)')?.disabled"))) {
            tap(web, ".timer-reset-button");
            tap(web, ".modal-actions .button.danger");
            waitFor(web, "!document.querySelector('.modal')&&!document.querySelector('.timer-presets > button:nth-child(5)').disabled");
          }
          tap(web, ".timer-presets > button:nth-child(5)");
          tap(web, ".timer-main-button");
          waitFor(web, "!!document.querySelector('.live-timer-topbar.running')");
          evaluate(web, "location.hash='today';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
          waitFor(web, "!!document.querySelector('" + (profile.equals("personal") ? ".personal-home" : ".today-view") + "')");
          // The synthetic local snapshot must win over any older device mirror,
          // otherwise a clock check would silently run against another student's
          // data. This is a real precondition, not an artifact-tolerance retry.
          waitFor(web, "(()=>{const raw=localStorage.getItem('hsc27-prostuti-v1');if(!raw)return false;const actual=JSON.parse(raw),expected=" + syntheticProfile(profile) + ";return JSON.stringify(actual.notes)===JSON.stringify(expected.notes)&&JSON.stringify(actual.completed)===JSON.stringify(expected.completed);})()");
          for (int zoom : new int[] {100, 130}) {
            scenario.onActivity(a -> a.getBridge().getWebView().getSettings().setTextZoom(zoom));
            evaluate(web, "document.documentElement.dataset.font='lg';window.scrollTo({top:0,behavior:'instant'});true");
            SystemClock.sleep(500);
            assertClock(web, profile + "-home-" + zoom);
            JSONObject card = object(web,
              "(()=>{const e=" + (profile.equals("personal") ? "document.querySelector('.personal-goal')" : "document.querySelector('.test-readiness-subjects').closest('section')") + ";const s=getComputedStyle(e);const r=e.getBoundingClientRect();const n=e.nextElementSibling.getBoundingClientRect();return {left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),bottom:parseFloat(s.paddingBottom),gap:n.top-r.bottom};})()"
            );
            record(profile + "-progress-" + zoom, card);
            assertTrue("Progress text needs an inset, not rounded-edge clipping: " + card, card.getDouble("left") >= 12 && card.getDouble("right") >= 12 && card.getDouble("bottom") >= 12);
            assertTrue("Adjacent dashboard cards need spacing: " + card, card.getDouble("gap") >= 10);
            evaluate(web, "window.scrollTo({top:1000,behavior:'instant'});true");
            waitFor(web, "window.scrollY>100");
            assertClock(web, profile + "-scrolled-" + zoom);
            tap(web, ".live-btn.toggle");
            waitFor(web, "!!document.querySelector('.live-timer-topbar.paused')");
            String paused = evaluate(web, "document.querySelector('.live-clock-chip.remaining strong').textContent");
            SystemClock.sleep(1200);
            assertEquals("Paused time changed", paused, evaluate(web, "document.querySelector('.live-clock-chip.remaining strong').textContent"));
            assertClock(web, profile + "-paused-" + zoom);
            tap(web, ".live-btn.toggle");
            waitFor(web, "!!document.querySelector('.live-timer-topbar.running')");
          }
          evaluate(web, "location.hash='syllabus';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
          waitFor(web, "!!document.querySelector('.syllabus-card')");
          assertClock(web, profile + "-navigated");
          tap(web, ".live-timer-indicator");
          waitFor(web, "!!document.querySelector('.timer-view')");
          assertClock(web, profile + "-opened-timer");
          assertSyntheticProfile(web, profile);
        } finally {
          // Cleanup is deliberately not a claimed user tap. Stop the native timer
          // before the next synthetic profile or unrelated storage tests.
          evaluate(web, "document.querySelector('.live-timer-topbar.running .live-btn.toggle')?.click();true");
          scenario.onActivity(a -> a.getBridge().getWebView().getSettings().setTextZoom(100));
          SystemClock.sleep(300);
        }
      }
      // S profile plus opt-in-disabled Brain must survive an actual Activity
      // recreation offline, not just a DOM rerender or a localStorage mock.
      scenario.recreate();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      web = ref.get();
      waitFor(web, "!!document.querySelector('.topbar')");
      evaluate(web, "location.hash='today';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
      waitFor(web, "!!document.querySelector('.personal-home')");
      assertSyntheticProfile(web, "personal");
      evaluate(web, "location.hash='brain';window.dispatchEvent(new HashChangeEvent('hashchange'));true");
      waitFor(web, "!!document.querySelector('.brain-welcome .button.primary')");
      assertEquals("Brain must not enable itself during native navigation/restart", "true", evaluate(web, "!JSON.parse(localStorage.getItem('hsc27-prostuti-v1')).studyBrain"));
      assertSyntheticProfile(web, "personal");
      screenshot("personal-offline-brain-after-restart");
    }
  }

  private void assertClock(WebView web, String stage) throws Exception {
    screenshot(stage);
    JSONObject result = object(web,
      "(()=>{const bar=document.querySelector('.live-timer-topbar');const safe=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'))||0;const clocks=[...bar.querySelectorAll('.live-clock-chip strong')].map(e=>{const r=e.getBoundingClientRect();const hit=[.12,.5,.88].every(x=>{const h=document.elementFromPoint(r.x+r.width*x,r.y+r.height/2);return !!h&&(h===e||e.contains(h));});const range=document.createRange();range.selectNodeContents(e);const tr=range.getBoundingClientRect();let clipped=false;for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),pr=p.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(s.overflowX)&&(tr.left<pr.left-1||tr.right>pr.right+1))clipped=true;if(/hidden|clip|auto|scroll/.test(s.overflowY)&&(tr.top<pr.top-1||tr.bottom>pr.bottom+1))clipped=true;}return {text:e.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right,font:parseFloat(getComputedStyle(e).fontSize),hit,clipped};});return {safe,width:innerWidth,height:innerHeight,textZoom:document.documentElement.dataset.font,scrollY,clocks};})()"
    );
    record(stage, result);
    assertEquals("Both elapsed and remaining clocks must be present: " + result, 2, result.getJSONArray("clocks").length());
    for (int i = 0; i < result.getJSONArray("clocks").length(); i++) {
      JSONObject clock = result.getJSONArray("clocks").getJSONObject(i);
      assertTrue(stage + ": hidden/occluded timer digits: " + result,
        clock.getDouble("top") >= result.getDouble("safe") - 1 &&
        clock.getDouble("bottom") < result.getDouble("height") && clock.getDouble("font") >= 16 &&
        clock.getDouble("left") >= 0 && clock.getDouble("right") <= result.getDouble("width") &&
        clock.getBoolean("hit") && !clock.getBoolean("clipped"));
    }
  }
}
