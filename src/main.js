const path = require('path');
const fs = require('fs/promises');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const PRINT_DOC_KEYS = ['iep', 'bsp', 'classroom'];

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
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

/**
 * Apply print-only CSS class so printToPDF captures a single document section.
 * @param {import('electron').WebContents} webContents
 * @param {string} docKey
 */
async function applyPrintDocClass(webContents, docKey) {
  const safeKey = PRINT_DOC_KEYS.includes(docKey) ? docKey : 'iep';
  await webContents.executeJavaScript(
    `(function () {
      document.body.classList.remove('print-doc-iep', 'print-doc-bsp', 'print-doc-classroom');
      document.body.classList.add('print-doc-${safeKey}');
      return true;
    })();`
  );
}

/** @param {import('electron').WebContents} webContents */
async function clearPrintDocClass(webContents) {
  await webContents.executeJavaScript(
    `document.body.classList.remove('print-doc-iep', 'print-doc-bsp', 'print-doc-classroom');`
  );
}

/**
 * High-quality PDF via Chromium's native printToPDF (same engine as Chrome print).
 */
async function generatePdfFromWindow(webContents, docKey) {
  await applyPrintDocClass(webContents, docKey);
  try {
    return await webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: 'A4',
      margins: {
        marginType: 'default'
      }
    });
  } finally {
    await clearPrintDocClass(webContents);
  }
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

ipcMain.handle('save-document-pdf', async (event, options) => {
  const docKey = options && options.docKey;
  const suggestedFilename = (options && options.suggestedFilename) || 'document.pdf';

  if (!PRINT_DOC_KEYS.includes(docKey)) {
    throw new Error('Invalid document key: ' + docKey);
  }

  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (!win) {
    throw new Error('Could not find application window.');
  }

  const sectionExists = await webContents.executeJavaScript(
    `!!document.getElementById('doc-section-${docKey}');`
  );
  if (!sectionExists) {
    throw new Error('Generate your plan documents first, then save as PDF.');
  }

  const pdfBuffer = await generatePdfFromWindow(webContents, docKey);

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save PDF',
    defaultPath: suggestedFilename,
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const finalPath = filePath.toLowerCase().endsWith('.pdf') ? filePath : filePath + '.pdf';
  await fs.writeFile(finalPath, pdfBuffer);

  return { canceled: false, filePath: finalPath };
});

ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (filePath) {
    shell.showItemInFolder(filePath);
  }
});
