const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  /**
   * Save a Word (.doc) export via the system save dialog (IEP, BSP, or Adjustments).
   * @param {{ content: string, suggestedFilename?: string, docKey?: 'iep'|'bsp'|'classroom' }} options
   */
  saveWordDocument: function (options) {
    return ipcRenderer.invoke('save-word-document', options || {});
  },
  /**
   * Save session progress JSON (default: Downloads/Generate4U-Progress.json).
   * @param {{ content: string, suggestedFilename?: string }} options
   */
  saveProgressJson: function (options) {
    return ipcRenderer.invoke('save-progress-json', options || {});
  },
  /**
   * Open a JSON progress file and return parsed data.
   */
  loadProgressJson: function () {
    return ipcRenderer.invoke('load-progress-json');
  }
});
