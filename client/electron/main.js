import { BrowserWindow, app, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#070913",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    const startUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    mainWindow.loadURL(startUrl);
    return;
  }

  const indexPath = path.join(__dirname, "../dist/index.html");
  mainWindow.loadFile(indexPath);
}

app.whenReady().then(createWindow);
