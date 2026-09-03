// preload.js — cliphusk bridge. contextIsolation on; only typed calls.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("husk", {
  query: () => ipcRenderer.invoke("query"),
  paste: (id) => ipcRenderer.invoke("paste", id),
  togglePin: (id) => ipcRenderer.invoke("toggle-pin", id),
  remove: (id) => ipcRenderer.invoke("remove", id),
  clearUnpinned: () => ipcRenderer.invoke("clear-unpinned"),
  hide: () => ipcRenderer.invoke("hide"),
  onHistory: (fn) => ipcRenderer.on("history", (_e, data) => fn(data)),
  onSearchFocus: (fn) => ipcRenderer.on("search-focus", () => fn())
});
