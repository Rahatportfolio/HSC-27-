package com.prostuti.hsc27;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.*;

/** Private app storage; no broad storage permission, cookies or DRM extraction.
 * Downloads stream to a staging file and become visible only after an atomic rename. */
@CapacitorPlugin(name = "StudyFiles")
public class StudyFilesPlugin extends Plugin {

  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final ExecutorService downloads = Executors.newSingleThreadExecutor();

  @Override
  public void load() {
    try {
      File[] files = root().listFiles();
      if (files != null) for (File f : files)
        if (f.getName().endsWith(".part")) clean(f);
    } catch (Exception ignored) {}
  }

  @Override
  protected void handleOnDestroy() {
    worker.shutdownNow();
    downloads.shutdownNow();
  }

  @PluginMethod
  public void exportFile(PluginCall c) {
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(c.getString("type", "application/octet-stream"));
    intent.putExtra(
      Intent.EXTRA_TITLE,
      c.getString("name", "prostuti-backup.prostuti")
    );
    startActivityForResult(c, intent, "finishExport");
  }

  @ActivityCallback
  private void finishExport(PluginCall c, ActivityResult result) {
    if (c == null) return;
    if (
      result.getResultCode() != Activity.RESULT_OK ||
      result.getData() == null ||
      result.getData().getData() == null
    ) {
      c.reject("Export cancelled", "EXPORT_CANCELLED");
      return;
    }
    Uri uri = result.getData().getData();
    run(c, () -> {
      try (
        InputStream in = new FileInputStream(
          new File(dir(c.getString("id"), false), "bytes")
        );
        OutputStream out = getContext()
          .getContentResolver()
          .openOutputStream(uri, "w")
      ) {
        if (out == null) throw new IOException("Cannot open destination");
        byte[] buffer = new byte[256 * 1024];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
        out.flush();
      }
      c.resolve();
    });
  }

  private String readText(File f) throws Exception {
    try (
      FileInputStream in = new FileInputStream(f);
      ByteArrayOutputStream out = new ByteArrayOutputStream()
    ) {
      byte[] b = new byte[4096];
      int n;
      while ((n = in.read(b)) != -1) out.write(b, 0, n);
      return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
  }

  private String timestamp() {
    java.text.SimpleDateFormat f = new java.text.SimpleDateFormat(
      "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
      java.util.Locale.US
    );
    f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
    return f.format(new java.util.Date());
  }

  private File root() throws Exception {
    File r = new File(getContext().getFilesDir(), "study-media");
    if (!r.exists() && !r.mkdirs()) throw new IOException(
      "Storage unavailable"
    );
    return r;
  }

  private String key(String id) throws Exception {
    if (id == null || id.isEmpty() || id.length() > 180) throw new IOException(
      "Invalid file id"
    );
    byte[] hash = MessageDigest.getInstance("SHA-256").digest(
      id.getBytes(StandardCharsets.UTF_8)
    );
    StringBuilder b = new StringBuilder();
    for (byte v : hash) b.append(String.format("%02x", v));
    return b.toString();
  }

  private File dir(String id, boolean staging) throws Exception {
    return new File(root(), key(id) + (staging ? ".part" : ""));
  }

  private JSObject infoFor(File d) throws Exception {
    JSObject meta = new JSObject(readText(new File(d, "meta.json")));
    File bytes = new File(d, "bytes");
    if (!bytes.isFile()) throw new IOException("File missing");
    meta.put("size", bytes.length());
    meta.put("uri", "file://" + bytes.getAbsolutePath());
    return meta;
  }

  private synchronized void beginFile(
    String id,
    String name,
    String type,
    String at
  ) throws Exception {
    File d = dir(id, true);
    if (d.exists()) throw new IOException("File already busy");
    if (!d.mkdirs()) throw new IOException("Cannot create staging file");
    JSObject meta = new JSObject();
    meta.put("id", id);
    meta.put("name", name);
    meta.put("type", type);
    meta.put("createdAt", at);
    try (
      FileOutputStream out = new FileOutputStream(new File(d, "meta.json"))
    ) {
      out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
    }
    new File(d, "bytes").createNewFile();
  }

  private void clean(File d) {
    File[] files = d.listFiles();
    if (files != null) for (File f : files) f.delete();
    d.delete();
  }

  private synchronized void commitFile(String id) throws Exception {
    File stage = dir(id, true),
      dest = dir(id, false);
    if (!stage.isDirectory()) throw new IOException("No staged file");
    if (dest.exists()) throw new IOException(
      "File id exists; refusing to overwrite"
    );
    try (
      RandomAccessFile bytes = new RandomAccessFile(
        new File(stage, "bytes"),
        "rw"
      )
    ) {
      bytes.getFD().sync();
    }
    if (!stage.renameTo(dest)) throw new IOException(
      "Atomic file commit failed"
    );
  }

  private interface Job {
    void run() throws Exception;
  }

  private void run(PluginCall c, Job job) {
    worker.execute(() -> {
      try {
        job.run();
      } catch (Exception e) {
        c.reject(e.getMessage(), e);
      }
    });
  }

  private void runDownload(PluginCall c, Job job) {
    downloads.execute(() -> {
      try {
        job.run();
      } catch (Exception e) {
        c.reject(e.getMessage(), e);
      }
    });
  }

  @PluginMethod
  public void list(PluginCall c) {
    run(c, () -> {
      JSArray list = new JSArray();
      File[] dirs = root().listFiles();
      if (dirs != null) for (File d : dirs)
        if (d.isDirectory() && !d.getName().endsWith(".part")) list.put(
          infoFor(d)
        );
      JSObject r = new JSObject();
      r.put("files", list);
      c.resolve(r);
    });
  }

  @PluginMethod
  public void info(PluginCall c) {
    run(c, () -> c.resolve(infoFor(dir(c.getString("id"), false))));
  }

  @PluginMethod
  public void begin(PluginCall c) {
    run(c, () -> {
      beginFile(
        c.getString("id"),
        c.getString("name", "File"),
        c.getString("type", "application/octet-stream"),
        c.getString("createdAt", "")
      );
      c.resolve();
    });
  }

  @PluginMethod
  public void append(PluginCall c) {
    run(c, () -> {
      byte[] bytes = Base64.decode(c.getString("data", ""), Base64.DEFAULT);
      if (bytes.length > 1024 * 1024) throw new IOException("Chunk too large");
      File d = dir(c.getString("id"), true);
      if (
        root().getUsableSpace() < bytes.length + 5 * 1024 * 1024
      ) throw new IOException("Storage full");
      try (
        FileOutputStream out = new FileOutputStream(new File(d, "bytes"), true)
      ) {
        out.write(bytes);
      }
      c.resolve();
    });
  }

  @PluginMethod
  public void commit(PluginCall c) {
    run(c, () -> {
      commitFile(c.getString("id"));
      c.resolve();
    });
  }

  @PluginMethod
  public void abort(PluginCall c) {
    run(c, () -> {
      clean(dir(c.getString("id"), true));
      c.resolve();
    });
  }

  @PluginMethod
  public void remove(PluginCall c) {
    run(c, () -> {
      File d = dir(c.getString("id"), false);
      clean(d);
      if (d.exists()) throw new IOException("Could not delete file");
      c.resolve();
    });
  }

  @PluginMethod
  public void estimate(PluginCall c) {
    run(c, () -> {
      long usage = 0;
      File[] dirs = root().listFiles();
      if (dirs != null) for (File d : dirs)
        usage += new File(d, "bytes").length();
      JSObject r = new JSObject();
      r.put("usage", usage);
      r.put("quota", usage + root().getUsableSpace());
      c.resolve(r);
    });
  }

  private URL allowed(String raw, String kind) throws Exception {
    URL url = new URL(raw);
    String host = url.getHost().toLowerCase();
    if (
      !url.getProtocol().equals("https") || url.getUserInfo() != null
    ) throw new IOException("Native downloads require public HTTPS");
    InetAddress[] addresses = InetAddress.getAllByName(host);
    for (InetAddress a : addresses)
      if (
        a.isAnyLocalAddress() ||
        a.isLoopbackAddress() ||
        a.isLinkLocalAddress() ||
        a.isSiteLocalAddress()
      ) throw new IOException("Private address not allowed");
    if (
      kind.equals("video") &&
      (!url.getPath().toLowerCase().matches(".*\\.(mp4|webm|ogg|m4v)$") ||
        host.equals("youtu.be") ||
        host.endsWith("youtube.com") ||
        host.endsWith("vimeo.com"))
    ) throw new IOException("Only permitted direct video files");
    return url;
  }

  @PluginMethod
  public void download(PluginCall c) {
    runDownload(c, () -> {
      String id = c.getString("id"),
        kind = c.getString("kind", "pdf");
      HttpURLConnection connection = null;
      boolean begun = false;
      try {
        URL url = allowed(c.getString("url"), kind);
        for (int n = 0; n < 6; n++) {
          connection = (HttpURLConnection) url.openConnection();
          connection.setInstanceFollowRedirects(false);
          connection.setConnectTimeout(20000);
          connection.setReadTimeout(30000);
          connection.setRequestProperty(
            "Accept",
            kind.equals("pdf") ? "application/pdf" : "video/*"
          );
          int status = connection.getResponseCode();
          if (status >= 300 && status < 400) {
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            url = allowed(new URL(url, location).toString(), kind);
            if (n == 5) throw new IOException("Too many redirects");
            continue;
          }
          if (status != 200) throw new IOException("HTTP " + status);
          break;
        }
        String type = connection.getContentType();
        if (type == null) type = "application/octet-stream";
        if (
          kind.equals("video") &&
          !type.startsWith("video/") &&
          !type.startsWith("application/octet-stream")
        ) throw new IOException("Not a video file");
        long total = connection.getContentLengthLong();
        long max = kind.equals("pdf") ? 100L * 1024 * 1024 : 2_000_000_000L;
        if (
          total > max || total > root().getUsableSpace() - 5 * 1024 * 1024
        ) throw new IOException("Not enough device storage / file too large");
        beginFile(
          id,
          c.getString("name", "File"),
          kind.equals("pdf") ? "application/pdf" : type,
          timestamp()
        );
        begun = true;
        long loaded = 0,
          last = 0;
        try (
          InputStream in = new BufferedInputStream(connection.getInputStream());
          FileOutputStream out = new FileOutputStream(
            new File(dir(id, true), "bytes")
          )
        ) {
          byte[] buffer = new byte[64 * 1024];
          int count;
          if (kind.equals("pdf")) {
            byte[] signature = new byte[5];
            int position = 0;
            while (position < 5) {
              int n = in.read(signature, position, 5 - position);
              if (n < 0) throw new IOException("Not a PDF file");
              position += n;
            }
            if (
              !new String(signature, StandardCharsets.US_ASCII).equals("%PDF-")
            ) throw new IOException("Not a PDF file");
            out.write(signature);
            loaded = 5;
          }
          while ((count = in.read(buffer)) != -1) {
            loaded += count;
            if (
              loaded > max || root().getUsableSpace() < count + 5 * 1024 * 1024
            ) throw new IOException("Storage limit exceeded");
            out.write(buffer, 0, count);
            if (System.currentTimeMillis() - last > 250) {
              JSObject p = new JSObject();
              p.put("id", id);
              p.put("loaded", loaded);
              p.put("total", Math.max(0, total));
              notifyListeners("downloadProgress", p);
              last = System.currentTimeMillis();
            }
          }
          out.getFD().sync();
        }
        if (
          loaded == 0 || (total >= 0 && loaded != total)
        ) throw new IOException("Incomplete download");
        commitFile(id);
        JSObject r = new JSObject();
        r.put("size", loaded);
        c.resolve(r);
      } finally {
        if (connection != null) connection.disconnect();
        if (begun) clean(dir(id, true));
      }
    });
  }
}
