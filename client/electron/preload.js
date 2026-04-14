import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("aivora", {
  platform: process.platform
});
