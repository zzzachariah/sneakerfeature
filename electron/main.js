const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const SITE_URL = process.env.SNEAKERFEATURE_URL || "https://snkrfeature.com";
const SITE_ORIGIN = new URL(SITE_URL).origin;
const IS_DEV = process.env.ELECTRON_DEV === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    title: "sneakerfeature",
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

  win.loadURL(SITE_URL);

  if (IS_DEV) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
