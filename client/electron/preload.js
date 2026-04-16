import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("aivora", {
  platform: process.platform,

  // Student restriction enforcement
  setStudentSession: (data) => ipcRenderer.send("set-student-session", data),
  clearStudentSession: () => ipcRenderer.send("clear-student-session"),

  // Webview events forwarded to renderer
  onOpenTab: (cb) => {
    ipcRenderer.removeAllListeners("webview-open-tab");
    ipcRenderer.on("webview-open-tab", (_e, data) => cb(data));
  },
  offOpenTab: () => ipcRenderer.removeAllListeners("webview-open-tab"),

  onValidateAndOpen: (cb) => {
    ipcRenderer.removeAllListeners("webview-validate-and-open");
    ipcRenderer.on("webview-validate-and-open", (_e, data) => cb(data));
  },
  offValidateAndOpen: () => ipcRenderer.removeAllListeners("webview-validate-and-open"),

  onBlocked: (cb) => {
    ipcRenderer.removeAllListeners("webview-blocked");
    ipcRenderer.on("webview-blocked", (_e, data) => cb(data));
  },
  offBlocked: () => ipcRenderer.removeAllListeners("webview-blocked")
});

// Expose IPC renderer for webview content scripts
contextBridge.exposeInMainWorld("ipcRenderer", {
  send: (channel, data) => ipcRenderer.send(channel, data)
});
