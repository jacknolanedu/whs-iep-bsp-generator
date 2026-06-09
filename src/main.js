const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** Serialize Word save dialogs so Full Suite batch + individual buttons never deadlock. */
let wordSaveQueue = Promise.resolve();

function enqueueWordSave(task) {
  const run = wordSaveQueue.then(task, task);
  wordSaveQueue = run.catch(function () {
    /* keep queue alive after a failed save */
  });
  return run;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Generate4U',
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  if (!app.isPackaged && process.env.ELECTRON_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Save one Word (.doc) export. Each invoke is independent; requests are queued
 * so Full Suite batch downloads and per-document buttons do not block each other.
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {{ content: string, suggestedFilename?: string, docKey?: string }} options
 */
ipcMain.handle('save-word-document', async (event, options) => {
  return enqueueWordSave(async () => {
    const suggestedFilename = (options && options.suggestedFilename) || 'document.doc';
    const content = options && options.content;

    if (content == null || content === '') {
      throw new Error('No document content to save.');
    }

    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) {
      throw new Error('Could not find application window.');
    }

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Word document',
      defaultPath: suggestedFilename,
      filters: [{ name: 'Word documents', extensions: ['doc'] }]
    });

    if (canceled || !filePath) {
      return { canceled: true, docKey: options && options.docKey };
    }

    const finalPath = filePath.toLowerCase().endsWith('.doc') ? filePath : filePath + '.doc';
    await fs.writeFile(finalPath, content, 'utf8');

    return { canceled: false, filePath: finalPath, docKey: options && options.docKey };
  });
});

ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (filePath) {
    shell.showItemInFolder(filePath);
  }
});

const DEFAULT_PROGRESS_FILENAME = 'Generate4U-Progress.json';

/**
 * Save session progress JSON — native save dialog defaulting to Downloads.
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {{ content: string, suggestedFilename?: string }} options
 */
ipcMain.handle('save-progress-json', async (event, options) => {
  const content = options && options.content;
  if (content == null || content === '') {
    throw new Error('No progress data to save.');
  }

  const suggestedFilename = (options && options.suggestedFilename) || DEFAULT_PROGRESS_FILENAME;
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (!win) {
    throw new Error('Could not find application window.');
  }

  const defaultPath = path.join(app.getPath('downloads'), suggestedFilename);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save progress',
    defaultPath,
    filters: [{ name: 'JSON progress', extensions: ['json'] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const finalPath = filePath.toLowerCase().endsWith('.json') ? filePath : filePath + '.json';
  await fs.writeFile(finalPath, content, 'utf8');
  return { canceled: false, filePath: finalPath };
});

/**
 * Load session progress JSON via native open dialog.
 * @param {import('electron').IpcMainInvokeEvent} event
 */
ipcMain.handle('load-progress-json', async (event) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (!win) {
    throw new Error('Could not find application window.');
  }

  const downloadsDir = app.getPath('downloads');
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Load progress',
    defaultPath: path.join(downloadsDir, DEFAULT_PROGRESS_FILENAME),
    filters: [{ name: 'JSON progress', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled || !filePaths || !filePaths.length) {
    return { canceled: true };
  }

  const text = await fs.readFile(filePaths[0], 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (parseErr) {
    throw new Error('The selected file is not valid JSON.');
  }

  return { canceled: false, filePath: filePaths[0], data };
});
