package com.prostuti.hsc27;

import static org.junit.Assert.*;

import android.os.SystemClock;
import android.util.Base64;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the actual registered Capacitor plugin in Android's WebView, not a JS mock. */
@RunWith(AndroidJUnit4.class)
public class StudyFilesInstrumentedTest {

  private String evaluate(WebView view, String script) throws Exception {
    AtomicReference<String> value = new AtomicReference<>();
    CountDownLatch done = new CountDownLatch(1);
    InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
      view.evaluateJavascript(script, result -> {
        value.set(result);
        done.countDown();
      })
    );
    assertTrue("WebView callback timed out", done.await(15, TimeUnit.SECONDS));
    return value.get();
  }

  private void waitFor(
    WebView view,
    String expression,
    long timeout
  ) throws Exception {
    long until = SystemClock.elapsedRealtime() + timeout;
    while (SystemClock.elapsedRealtime() < until) {
      if ("true".equals(evaluate(view, expression))) return;
      SystemClock.sleep(100);
    }
    fail(
      "Timed out: " +
        expression +
        ". Result: " +
        evaluate(view, "JSON.stringify(window.__studyNativeTest||null)")
    );
  }

  private byte[] fixture() throws Exception {
    try (
      InputStream in = InstrumentationRegistry.getInstrumentation()
        .getContext()
        .getAssets()
        .open("offline-test.webm");
      ByteArrayOutputStream out = new ByteArrayOutputStream()
    ) {
      byte[] b = new byte[4096];
      int n;
      while ((n = in.read(b)) != -1) out.write(b, 0, n);
      return out.toByteArray();
    }
  }

  @Test
  public void nativeStoragePlaybackAndRestartPersistWithoutNetwork() throws Exception {
    try (
      ActivityScenario<MainActivity> scenario = ActivityScenario.launch(
        MainActivity.class
      )
    ) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      WebView web = ref.get();
      waitFor(
        web,
        "!!(window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.StudyFiles)",
        45000
      );
      String bytes = Base64.encodeToString(fixture(), Base64.NO_WRAP);
      String script =
        "(async()=>{const p=Capacitor.Plugins.StudyFiles;const id='instrumented-native-video';try{" +
        "await p.remove({id});await p.abort({id});" +
        "await p.begin({id,name:'Offline test',type:'video/webm',createdAt:'2026-11-15T00:00:00Z'});" +
        "await p.append({id,data:" +
        JSONObject.quote(bytes) +
        "});await p.commit({id});" +
        "const info=await p.info({id});if(info.size<=0)throw Error('Empty native file');" +
        "const src=Capacitor.convertFileSrc(info.uri);const response=await fetch(src);if(!response.ok||(await response.blob()).size!==info.size)throw Error('Local file URL is not readable');" +
        "const video=document.createElement('video');video.muted=true;video.src=src;document.body.appendChild(video);" +
        "await video.play();await new Promise((resolve,reject)=>{const started=performance.now();const tick=()=>{if(video.currentTime>.2){video.pause();video.remove();resolve();}else if(performance.now()-started>15000)reject(Error('Native video did not advance'));else setTimeout(tick,100);};tick();});" +
        "let rejected=false;await p.begin({id,name:'Must not overwrite',type:'video/webm',createdAt:'2026-11-15T00:00:00Z'});await p.append({id,data:btoa('wrong')});try{await p.commit({id});}catch{rejected=true;}await p.abort({id});if(!rejected||(await p.info({id})).size!==info.size)throw Error('Existing file was overwritten');" +
        "const storage=await p.estimate();if(storage.usage<info.size||storage.quota<=storage.usage)throw Error('Invalid device storage estimate');" +
        "window.__studyNativeTest={ok:true,id,size:info.size};" +
        "}catch(e){window.__studyNativeTest={ok:false,error:String(e),stack:e.stack};}})();";
      evaluate(web, script);
      waitFor(web, "!!window.__studyNativeTest", 45000);
      String encoded = evaluate(
        web,
        "JSON.stringify(window.__studyNativeTest)"
      );
      JSONObject result = new JSONObject(
        (String) new JSONTokener(encoded).nextValue()
      );
      assertTrue(result.toString(), result.optBoolean("ok"));
      // Real Activity recreation: the file must outlive the old JS bridge and plugin instance.
      scenario.recreate();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      web = ref.get();
      waitFor(
        web,
        "!!(window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.StudyFiles)",
        45000
      );
      evaluate(
        web,
        "(async()=>{try{const p=Capacitor.Plugins.StudyFiles;const f=await p.info({id:'instrumented-native-video'});await p.remove({id:f.id});const list=await p.list();if(list.files.some(x=>x.id===f.id))throw Error('Delete did not persist');window.__studyNativeTest={ok:f.size>0};}catch(e){window.__studyNativeTest={ok:false,error:String(e)};}})();"
      );
      waitFor(web, "!!window.__studyNativeTest", 30000);
      encoded = evaluate(web, "JSON.stringify(window.__studyNativeTest)");
      result = new JSONObject((String) new JSONTokener(encoded).nextValue());
      assertTrue(result.toString(), result.optBoolean("ok"));
    }
  }

  @Test
  public void failedDownloadsAndExplicitResetNeverLeaveACompletedFile() throws Exception {
    try (
      ActivityScenario<MainActivity> scenario = ActivityScenario.launch(
        MainActivity.class
      )
    ) {
      AtomicReference<WebView> ref = new AtomicReference<>();
      scenario.onActivity(a -> ref.set(a.getBridge().getWebView()));
      WebView web = ref.get();
      waitFor(
        web,
        "!!(window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.StudyFiles)",
        45000
      );
      evaluate(
        web,
        "(async()=>{const p=Capacitor.Plugins.StudyFiles;try{let rejected=false;try{await p.download({id:'blocked-download',name:'Restricted source',url:'https://youtube.com/watch?v=test',kind:'video'});}catch{rejected=true;}if(!rejected)throw Error('Restricted platform accepted');await p.begin({id:'reset-staging',name:'Partial',type:'application/pdf',createdAt:'2026-11-15T00:00:00Z'});await p.append({id:'reset-staging',data:btoa('%PDF-1.7')});await p.clear();const list=await p.list();if(list.files.length)throw Error('Reset left media behind');let committed=false;try{await p.commit({id:'reset-staging'});committed=true;}catch{}if(committed)throw Error('Partial download resurrected after reset');window.__studyNativeTest={ok:true};}catch(e){window.__studyNativeTest={ok:false,error:String(e)};}})();"
      );
      waitFor(web, "!!window.__studyNativeTest", 30000);
      String encoded = evaluate(
        web,
        "JSON.stringify(window.__studyNativeTest)"
      );
      JSONObject result = new JSONObject(
        (String) new JSONTokener(encoded).nextValue()
      );
      assertTrue(result.toString(), result.optBoolean("ok"));
    }
  }
}
