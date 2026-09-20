const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agonDesktop', {
  savePdf: (html, suggestedName) => ipcRenderer.invoke('save-report-pdf', { html, suggestedName }),
  openRasterFile: () => ipcRenderer.invoke('raster-open-file'),
  inspectRaster: (args) => ipcRenderer.invoke('raster-inspect', args),
  previewRaster: (args) => ipcRenderer.invoke('raster-preview', args),
  georeferenceRaster: (args) => ipcRenderer.invoke('raster-georeference', args),
  reprojectRaster: (args) => ipcRenderer.invoke('raster-reproject', args),
});
