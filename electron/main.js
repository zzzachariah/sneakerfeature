const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const SITE_URL = process.env.SNEAKERFEATURE_URL || "https://snkrfeature.com";
const SITE_ORIGIN = new URL(SITE_URL).origin;
const IS_DEV = process.env.ELECTRON_DEV === "1";
const IS_MAC = process.platform === "darwin";

// Persist window size+position across launches so the app remembers where the
// user left it. Stored as a small JSON blob under the app's userData dir, which
// Electron places per-user per-app on every OS. Defaults are picked to suit
// the slide-deck layout: wide enough for the two-up cards, tall enough for the
// shoe detail slide without scrolling.
const DEFAULT_BOUNDS = { width: 1280, height: 820 };
const STATE_FILE = "window-state.json";

function readWindowState() {
  try {
    const raw = fs.readFileSync(path.join(app.getPath("userData"), STATE_FILE), "utf-8");
    const data = JSON.parse(raw);
    if (
      data &&
      typeof data.width === "number" &&
      typeof data.height === "number" &&
      data.width >= 600 &&
      data.height >= 400
    ) {
      return data;
    }
  } catch {
    /* missing / malformed — use defaults */
  }
  return DEFAULT_BOUNDS;
}

function writeWindowState(win) {
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(
      path.join(app.getPath("userData"), STATE_FILE),
      JSON.stringify(bounds, null, 2)
    );
  } catch {
    /* best-effort */
  }
}

function createWindow() {
  const state = readWindowState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    title: "sneakerfeature",
    show: false,
    // On macOS, hide the OS title bar and inset the traffic-light buttons so
    // the dark site fills the chrome — a much more native, polished feel than
    // the default white strip.
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    trafficLightPosition: IS_MAC ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Present a clean, vanilla-Chromium User-Agent with our own app marker: strip
  // the "Electron/..." token (and the app's own product token, which Electron
  // injects by default) so anti-automation heuristics on third-party links don't
  // flag the desktop app, then append our marker so we can identify app traffic.
  const baseUa = win.webContents
    .getUserAgent()
    .replace(/\sElectron\/\S+/i, "")
    .replace(new RegExp(`\\s${app.getName()}\\/\\S+`, "i"), "");
  win.webContents.setUserAgent(`${baseUa} sneakerfeature-desktop/${app.getVersion()}`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.origin === SITE_ORIGIN) {
        return { action: "allow" };
      }
    } catch {
      // fall through to deny + open externally
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      if (target.origin !== SITE_ORIGIN) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  // Don't show the window until the first paint is ready — avoids a brief
  // flash of empty chrome before the page boots.
  win.once("ready-to-show", () => {
    win.show();
  });

  // Persist size+position when the user is done resizing/moving the window.
  // Debounce both events through a single timer so we don't write on every
  // pixel of drag.
  let saveTimer = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeWindowState(win), 300);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", () => {
    if (saveTimer) clearTimeout(saveTimer);
    writeWindowState(win);
  });

  win.loadURL(SITE_URL);

  if (IS_DEV) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  return win;
}

// Single-instance: opening the .dmg / .exe a second time focuses the existing
// window instead of spawning a duplicate. Without this, double-clicking the
// dock/start-menu icon while the app is already running creates a second
// process pointing at the same URL.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    buildApplicationMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (!IS_MAC) {
    app.quit();
  }
});

// Trimmed application menu. The Electron default carries a bunch of items
// (File → Open Recent, Help → Learn More, etc.) that don't apply to a thin
// site shell; we ship a focused menu with just the things a desktop user
// expects (zoom, copy/paste, window controls, an explicit Reload).
function buildApplicationMenu() {
  const template = [
    ...(IS_MAC
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(IS_DEV ? [{ role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(IS_MAC ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Open sneakerfeature.com",
          click: () => shell.openExternal(SITE_URL),
        },
        {
          label: "Report a bug",
          click: () => shell.openExternal("https://github.com/zzzachariah/sneakerfeature/issues/new"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
