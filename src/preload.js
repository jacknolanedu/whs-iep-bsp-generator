const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  /**
   * Save a Word (.doc) export via the system save dialog.
   * @param {{ content: string, suggestedFilename?: string }} options
   */
  saveWordDocument: function (options) {
    return ipcRenderer.invoke('save-word-document', options || {});
  },
  /**
   * Save the active generated document section as PDF using Chromium printToPDF.
   * @param {{ docKey: 'iep'|'bsp'|'classroom', suggestedFilename?: string }} options
   */
  saveDocumentAsPdf: function (options) {
    return ipcRenderer.invoke('save-document-pdf', options || {});
  }
});
