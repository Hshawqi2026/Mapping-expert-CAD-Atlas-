const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agonDesktop', {
  savePdf: (html, suggestedName) => ipcRenderer.invoke('save-report-pdf', { html, suggestedName }),
});
