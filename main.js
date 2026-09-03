// main.js — cliphusk main process (Electron). Zero npm dependencies.
// Started as:  electron .            (normal)
//              electron . --selftest  (headless self-check, exits 0/1)
const { app, BrowserWindow, globalShortcut, clipboard, nativeImage, ipcMain, Tray, Menu, ClipboardItem } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const L = require("./cliplib.js");

// ---- persistence: one JSON per user, next to nothing -----------------------
const STORE = path.join(app.getPath("userData"), "history.json");
let history = [];
try { history = JSON.parse(fs.readFileSync(STORE, "utf8")); } catch (e) { history = []; }
let storeTimer = null;
function persist() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => {
    try { fs.writeFileSync(STORE, JSON.stringify(history)); } catch (e) { /* disk full etc: keep running */ }
  }, 400);
}

// ---- clipboard polling ------------------------------------------------------
// Polling (not the 'clipboard-read' event) because we must also capture
// images reliably cross-platform; 500ms is Maccy-class responsiveness.
const POLL_MS = 500;
let lastText = null, lastImage = null;
function sysClipboardText() {
  const { execSync } = require("node:child_process");
  try {
    return process.platform === "win32"
      ? execSync("powershell -NoProfile -Command Get-Clipboard", { encoding: "utf8" }).replace(/\r\n$/, "")
      : execSync("pbpaste", { encoding: "utf8" });
  } catch (e) { return null; }
}

async function poll() {
  // image first: a screenshot replaces text capture intent.
  // Electron 44 clipboard API: read()/write() are async and format-generic;
  // readText() also returns a Promise (the old sync readImage API is gone).
  try {
    const items = await clipboard.read();
    const item = items && items[0];
    if (item && item.types && item.types.indexOf("image/png") !== -1) {
      const blob = await item.getType("image/png");
      const buf = Buffer.from(await blob.arrayBuffer ? await blob.arrayBuffer() : new Uint8Array(await new Response(blob).arrayBuffer()));
      const dataURL = "data:image/png;base64," + buf.toString("base64");
      if (dataURL !== lastImage) {
        lastImage = dataURL;
        lastText = null;
        L.push(history, { kind: "image", image: dataURL });
        persist();
        send("history", visible());
      }
      return;
    }
  } catch (e) { /* image read unavailable this tick; fall through to text */ }
  let t = "";
  try { t = await clipboard.readText(); } catch (e) { t = ""; }
  if (t && t !== lastText && t !== justPasted) {
    lastText = t;
    L.push(history, { kind: "text", text: t });
    persist();
    send("history", visible());
  }
}
let justPasted = null; // suppress the echo of our own paste-back

function visible() {
  // split for the UI: pinned first (stable by pin time), then recency
  const pinned = history.filter((e) => e.pinned);
  const rest = history.filter((e) => !e.pinned);
  return { pinned, rest, total: history.length };
}

// ---- window & UI ------------------------------------------------------------
let win = null, tray = null, hiddenUntilBlur = false;

function createWindow() {
  win = new BrowserWindow({
    width: 480, height: 560,
    show: false, frame: false, resizable: false, skipTaskbar: true,
    alwaysOnTop: true, transparent: false,
    backgroundColor: "#f4f2ec",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, "renderer.html"));
  win.on("blur", () => { if (win && win.isVisible()) hide(); });
  win.on("closed", () => { win = null; });
}

function toggleWindow() {
  if (!win) createWindow();
  if (win.isVisible()) { hide(); return; }
  send("history", visible());
  send("search-focus", {});
  positionAtCursor();
  win.show();
  win.focus();
}
function hide() { if (win) win.hide(); }
function positionAtCursor() {
  const s = require("node:electron").screen || null;
  if (!s) return;
  const pt = s.getCursorScreenPoint();
  const b = win.getBounds();
  let x = Math.round(pt.x - b.width / 2), y = Math.round(pt.y - b.height / 2);
  const d = s.getDisplayNearestPoint(pt);
  x = Math.max(d.workArea.x, Math.min(x, d.workArea.x + d.workArea.width - b.width));
  y = Math.max(d.workArea.y, Math.min(y, d.workArea.y + d.workArea.height - b.height));
  win.setBounds({ x, y, width: b.width, height: b.height });
}
function send(ch, payload) { if (win && win.webContents) win.webContents.send(ch, payload); }

// ---- IPC from renderer --------------------------------------------------------
ipcMain.handle("paste", (e, id) => {
  const entry = L.getById(history, id);
  if (!entry) return { ok: false };
  if (entry.kind === "image") {
    // Electron 44: ClipboardItem holds per-type async producers
    try {
      const png = nativeImage.createFromDataURL(entry.image).toPNG();
      clipboard.write([new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) })]).catch(() => {});
    } catch (e) { /* keep going: text paste still works */ }
    justPasted = null;
  } else {
    clipboard.writeText(entry.text).catch(() => {});
    justPasted = entry.text; // our own write will be seen by poll — skip once
  }
  return { ok: true };
});
ipcMain.handle("toggle-pin", (e, id) => { const r = L.togglePin(history, id); persist(); send("history", visible()); return r; });
ipcMain.handle("remove", (e, id) => { const r = L.remove(history, id); persist(); send("history", visible()); return r; });
ipcMain.handle("clear-unpinned", (e) => {
  history = history.filter((x) => x.pinned);
  persist(); send("history", visible());
  return true;
});
ipcMain.handle("query", (e) => visible());
ipcMain.handle("hide", () => { hide(); return true; });

// ---- lifecycle -----------------------------------------------------------------
const TOGGLE_KEYS = [
  process.platform === "darwin" ? "CmdOrCtrl+Shift+V" : "Ctrl+Shift+V",
  "Alt+Shift+V" // secondary, avoids IME collisions on Windows
];

app.whenReady().then(() => {
  createWindow();
  tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
  tray.setToolTip("cliphusk — 离线剪贴板 / offline clipboard");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开历史 Toggle (" + TOGGLE_KEYS[0] + ")", click: toggleWindow },
    { type: "separator" },
    { label: "退出 Quit", click: () => { app.quit(); } }
  ]));
  for (const k of TOGGLE_KEYS) {
    const ok = globalShortcut.register(k, toggleWindow);
    if (!ok) console.error("[cliphusk] hotkey not registered:", k);
  }
  setInterval(poll, POLL_MS);

  if (SELFTEST) runSelftest();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => { for (const k of TOGGLE_KEYS) globalShortcut.unregister(k); });

// ---- self-test -------------------------------------------------------------------
const SELFTEST = process.argv.includes("--selftest");
async function runSelftest() {
  const results = [];
  const check = async (name, fn) => {
    try { const v = await fn(); results.push([name, !!v]); }
    catch (e) { results.push([name, false]); }
  };
  await check("clipboard-text-roundtrip (system-verified)", async () => {
    await clipboard.writeText("__cliphusk_selftest__");
    const sys = sysClipboardText();
    return sys !== null && sys.indexOf("__cliphusk_selftest__") !== -1;
  });
  await check("clipboard-image-write (system-verified)", async () => {
    const png = nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==").toPNG();
    await clipboard.write([new ClipboardItem({ "image/png": new Blob([png], { type: "image/png" }) })]);
    try {
      if (process.platform === "darwin") {
        const info = require("node:child_process").execSync("osascript -e 'clipboard info'", { encoding: "utf8" });
        return /class TIFF|class PNG|PNGf|picture/i.test(info);
      }
      const ps = require("node:child_process").execSync(
        "powershell -NoProfile -STA -Command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()\"",
        { encoding: "utf8" });
      return /True/i.test(ps);
    } catch (e) { return false; }
  });
  await check("capture-pipeline (lib-level)", async () => {
    const probe = [];
    L.push(probe, { kind: "text", text: "__lib_a__" });
    L.push(probe, { kind: "text", text: "__lib_b__" });
    L.push(probe, { kind: "text", text: "__lib_a__" });
    return probe.length === 2 && probe[0].text === "__lib_a__";
  });
  await check("history-dedup (pipeline)", async () => {
    await clipboard.writeText("__cliphusk_dedup_a__"); await poll();
    await clipboard.writeText("__cliphusk_dedup_b__"); await poll();
    await clipboard.writeText("__cliphusk_dedup_a__"); await poll();
    const hits = history.filter((e) => e.text && e.text.indexOf("__cliphusk_dedup") === 0);
    const firstText = history.find((e) => e.kind === "text");
    return hits.length === 2 && firstText && firstText.text === "__cliphusk_dedup_a__";
  });
  check("persistence", () => { try { fs.writeFileSync(STORE, JSON.stringify(history)); return true; } catch (e) { return false; } });
  check("hotkeys-registered", () => TOGGLE_KEYS.every((k) => globalShortcut.isRegistered(k)));

  const pass = results.filter(([, ok]) => ok).length;
  for (const [n, ok] of results) console.log((ok ? "  ok  " : "  FAIL") + "  " + n);
  console.log(`selftest: ${pass}/${results.length}`);
  try {
    fs.writeFileSync(path.join(app.getPath("userData"), "selftest.json"), JSON.stringify(results));
  } catch (e) {}
  setTimeout(() => app.exit(pass === results.length ? 0 : 1), 200);
}

const TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQklEQVR42mNkwAPGzYj4DwPi/4j4DyD+A4zYPwni/4bGPwDTPwjif0D2f4Cc/xrk//H/g9v/BzpfDBgAcRADiNIMLJwAAAAASUVORK5CYII=";
