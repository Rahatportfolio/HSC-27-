/** Real-browser regression for media storage, playback, collector, backup and responsive tabs.
 * CHROMIUM_PATH must point to an installed Chromium; no browser dependency is added. */
import { chromium } from "playwright-core";
import { createServer, preview } from "vite";
import { readFile, mkdir } from "node:fs/promises";
import { freshData, STORAGE_KEY, todayKey } from "../src/planner";
import { CHAPTERS } from "../src/data";
import { emptyAdvanced } from "../src/advanced";

if (!process.env.CHROMIUM_PATH) throw new Error("Set CHROMIUM_PATH");
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const address = server.httpServer!.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({
  viewport: { width: 320, height: 800 },
  reducedMotion: "reduce",
});
try {
  await page.goto(base, { waitUntil: "networkidle" });
  // Generate a real short playable WebM, not dummy app content or fake watch progress.
  const fixture = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const ended = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 2 ? "#236149" : "#2c5e8a";
      ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = "white";
      ctx.fillText(`Prostuti test ${i}`, 15, 40);
      await new Promise((r) => setTimeout(r, 100));
    }
    recorder.stop();
    await ended;
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      ),
    );
  });
  await page.route("**/class.webm", (route) =>
    route.fulfill({
      status: 200,
      contentType: "video/webm",
      headers: {
        "content-length": String(fixture.length),
        "access-control-allow-origin": "*",
      },
      body: Buffer.from(fixture),
    }),
  );
  const data = freshData();
  const today = todayKey();
  data.settings.startDate = today;
  data.settings.dailyHours = 4;
  data.settings.boostEnabled = false;
  data.advanced = {
    ...emptyAdvanced(),
    classes: [
      {
        id: "browser-video",
        url: `${base}/class.webm`,
        title: "Browser real media",
        teacher: "Test teacher",
        chapterId: CHAPTERS[0].id,
        duration: 25200,
        position: 0,
        watched: 0,
        speed: 1,
        permitted: true,
        note: "",
      },
    ],
  };
  await page.evaluate(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      location.hash = "studySystem";
    },
    { key: STORAGE_KEY, data },
  );
  await page.reload({ waitUntil: "networkidle" });
  const fits = async () => {
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw new Error("Study workspace overflows viewport");
  };
  await page.getByRole("button", { name: "Save offline", exact: true }).click();
  await page.getByRole("button", { name: "Remove download only" }).waitFor();
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await fits();
  if ((await page.locator(".study-session").count()) < 3)
    throw new Error("Full routine did not receive video sessions");
  for (const tab of ["প্রস্তুতি", "Offline library", "ক্লাস"]) {
    await page
      .getByRole("navigation", { name: "Study workspace" })
      .getByRole("button", { name: tab, exact: true })
      .click();
    await fits();
  }
  await page.getByRole("button", { name: /Resume/ }).click();
  await page.locator("video").evaluate(async (v: HTMLVideoElement) => {
    await v.play();
  });
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.currentTime > 0.5;
  });
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
  await page.getByLabel("Quick notes").fill("Persistent class note");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /বন্ধ করো|Close/ })
    .click();
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).advanced.classes[0].position > 0.4,
    STORAGE_KEY,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Resume/ }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState > 0 && v.currentTime > 0.4;
  });
  if (
    (await page.getByLabel("Quick notes").inputValue()) !==
    "Persistent class note"
  )
    throw new Error("Class note lost");
  await page.context().setOffline(true);
  await page.locator("video").evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = 0;
    await v.play();
  });
  await page.waitForFunction(
    () => document.querySelector("video")!.currentTime > 0.2,
  );
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
  await page.context().setOffline(false);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /বন্ধ করো|Close/ })
    .click();
  await page.goto(`${base}/#settings`, { waitUntil: "networkidle" });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Full backup export|Export full backup/ })
    .click();
  const download = await downloadPromise;
  await mkdir(".cache", { recursive: true });
  const file = ".cache/browser-full.prostuti";
  await download.saveAs(file);
  const bytes = await readFile(file);
  if (bytes.length < fixture.length)
    throw new Error("Backup omitted media bytes");
  await page.locator('input[accept*=".prostuti"]').setInputFiles(file);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /নিশ্চিত|Confirm|ঠিক আছে/ })
    .click();
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).advanced.classes[0].id !==
      "browser-video",
    STORAGE_KEY,
  );
  await page.goto(`${base}/#studySystem`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Resume/ }).click();
  await page.waitForFunction(
    () => document.querySelector("video")!.readyState > 0,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /বন্ধ করো|Close/ })
    .click();
  await page.goto(
    `${base}/?collect=1&title=Public+sheet&text=${encodeURIComponent("Shared notes https://example.org/notes.pdf")}`,
    { waitUntil: "networkidle" },
  );
  if (
    (await page.getByPlaceholder("https://…/file.pdf").inputValue()) !==
    "https://example.org/notes.pdf"
  )
    throw new Error("PWA shared link was not collected");
  await fits();
  const production = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  const productionAddress = production.httpServer.address() as { port: number };
  const offlineContext = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  const offlinePage = await offlineContext.newPage();
  try {
    await offlinePage.goto(
      `http://127.0.0.1:${productionAddress.port}/#studySystem`,
      { waitUntil: "networkidle" },
    );
    await offlinePage.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const offlineData = {
      ...data,
      advanced: {
        ...data.advanced!,
        classes: data.advanced!.classes.map((c) => ({
          ...c,
          local: true,
          size: fixture.length,
          note: "Offline PWA note",
        })),
      },
    };
    await offlinePage.evaluate(
      async ({ key, data, bytes }) => {
        localStorage.setItem(key, JSON.stringify(data));
        await new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("prostuti-files", 1);
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains("blobs"))
              open.result.createObjectStore("blobs", { keyPath: "id" });
          };
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("blobs", "readwrite");
            tx.objectStore("blobs").put({
              id: "browser-video",
              name: "Video",
              size: bytes.length,
              createdAt: "2026-11-15T00:00:00Z",
              blob: new Blob([new Uint8Array(bytes)], { type: "video/webm" }),
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      { key: STORAGE_KEY, data: offlineData, bytes: fixture },
    );
    await offlinePage.reload({ waitUntil: "networkidle" });
    await offlinePage.waitForFunction(
      () => !!navigator.serviceWorker.controller,
    );
    await offlineContext.setOffline(true);
    await offlinePage.reload({ waitUntil: "load" });
    await offlinePage.getByRole("button", { name: /Resume/ }).click();
    await offlinePage.locator("video").evaluate(async (v: HTMLVideoElement) => {
      await v.play();
    });
    await offlinePage.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0.2,
    );
    if (
      (await offlinePage.getByLabel("Quick notes").inputValue()) !==
      "Offline PWA note"
    )
      throw new Error("Production offline note missing");
  } finally {
    await offlineContext.close();
    await new Promise<void>((resolve) =>
      production.httpServer.close(() => resolve()),
    );
  }
  console.log(
    "Browser study checks passed: real offline video, resume, notes, full backup/restore, shared collector, mobile tabs and production PWA offline reload.",
  );
} finally {
  await browser.close();
  await server.close();
}
