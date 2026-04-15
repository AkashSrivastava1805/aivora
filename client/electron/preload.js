import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("aivora", {
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("aivora:openExternal", url)
});
