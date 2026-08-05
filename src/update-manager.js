/**
 * Auto-update wiring for the packaged desktop app.
 *
 * Main-process only — NOT loaded by index.html; the browser (file://) runtime
 * and the renderer's no-network CSP are untouched. The only network request
 * this app ever makes is the update check here, which carries the app version
 * and nothing else. No student data leaves the machine.
 *
 * Windows: real background auto-update. Squirrel.Windows downloads the new
 *   version silently via update.electronjs.org; the teacher is offered a
 *   restart, and whatever they choose, Squirrel launches the new version the
 *   next time the app opens. The localStorage autosave draft lives in
 *   userData, which survives updates.
 *
 * macOS: Squirrel.Mac refuses to update unsigned apps, so until this app is
 *   code-signed we poll the GitHub Releases API and walk the teacher to the
 *   new DMG instead. When a signing certificate exists, switch this branch to
 *   the built-in autoUpdater (see RELEASING.md, "Signed macOS updates").
 */
'use strict';

const { app, autoUpdater, BrowserWindow, dialog, shell } = require('electron');
const https = require('https');
const {
  UPDATE_REPO,
  isNewerVersion,
  buildWindowsFeedUrl,
  extractLatestRelease
} = require('./update-core');

/** Check at launch and then every 4 hours while the app stays open. */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const LATEST_RELEASE_API = 'https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest';
const LATEST_RELEASE_PAGE = 'https://github.com/' + UPDATE_REPO + '/releases/latest';

let updateDialogOpen = false;

/**
 * Show a dialog attached to the app window when there is one, so it can never
 * appear behind the app. Falls back to a detached dialog.
 * @param {Electron.MessageBoxOptions} options
 * @returns {Promise<Electron.MessageBoxReturnValue>}
 */
function showUpdateDialog(options) {
  const win = BrowserWindow.getAllWindows()[0];
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

/**
 * Start the platform-appropriate update loop. Call once, after app.whenReady().
 * No-ops in dev (`npm start`) so local runs never self-update.
 */
function initUpdateManager() {
  if (!app.isPackaged) return;
  console.log('[update] update checks active for version ' + app.getVersion());
  if (process.platform === 'win32') {
    startWindowsAutoUpdate();
  } else if (process.platform === 'darwin') {
    checkMacOnce();
    setInterval(checkMacOnce, CHECK_INTERVAL_MS);
  }
}

function startWindowsAutoUpdate() {
  try {
    autoUpdater.setFeedURL({ url: buildWindowsFeedUrl(process.arch, app.getVersion()) });
  } catch (err) {
    console.warn('[update] updater unavailable:', err.message);
    return;
  }

  autoUpdater.on('error', (err) => {
    // Offline or GitHub unreachable — stay silent and retry next interval.
    console.warn('[update] check failed:', err.message);
  });

  autoUpdater.on('update-downloaded', () => {
    promptWindowsRestart();
  });

  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
}

function promptWindowsRestart() {
  if (updateDialogOpen) return;
  updateDialogOpen = true;
  showUpdateDialog({
    type: 'info',
    title: 'Update ready',
    message: 'A new version of Generate4U is ready.',
    detail: 'Your work is kept as an autosaved draft and will be offered back after the restart. ' +
      'If you choose "Next time I open the app", the update is applied automatically then instead.',
    buttons: ['Restart and update now', 'Next time I open the app'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    updateDialogOpen = false;
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
    // Either way the update is already downloaded: Squirrel launches the new
    // version on the next start, so the update cannot be skipped.
  });
}

/**
 * Fetch the latest published release, resolving null on any failure —
 * update checks must never crash or interrupt the app.
 * @returns {Promise<{ version: string, dmgUrl: string | null } | null>}
 */
function fetchLatestRelease() {
  return new Promise((resolve) => {
    const req = https.get(LATEST_RELEASE_API, {
      headers: {
        'User-Agent': 'Generate4U-update-check',
        Accept: 'application/vnd.github+json'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(extractLatestRelease(body)));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function checkMacOnce() {
  const latest = await fetchLatestRelease();
  // Logged, not silent: "no dialog appeared" must be distinguishable from
  // "the check never ran" — both when testing and when a teacher reports a
  // machine that never updates.
  if (!latest) {
    console.log('[update] no published release found (offline, or drafts only)');
    return;
  }
  if (!isNewerVersion(app.getVersion(), latest.version)) {
    console.log('[update] up to date (latest published: ' + latest.version + ')');
    return;
  }
  if (updateDialogOpen) return;
  updateDialogOpen = true;
  const result = await showUpdateDialog({
    type: 'info',
    title: 'Update available',
    message: 'Generate4U ' + latest.version + ' is available (you have ' + app.getVersion() + ').',
    detail: 'Please update to keep documents consistent across the school.\n\n' +
      'The new version downloads in your browser. Open it, drag ' +
      '"WHS IEP BSP Generator" into Applications and choose Replace, then quit ' +
      'this app and open it again.\n\n' +
      'Your Mac will show its "unverified developer" warning again — that is normal ' +
      'for this app; the install instructions on the download page explain it. ' +
      'Your work is kept as an autosaved draft.',
    buttons: ['Download the update', 'Remind me later'],
    defaultId: 0,
    cancelId: 1
  });
  updateDialogOpen = false;
  if (result.response === 0) {
    shell.openExternal(latest.dmgUrl || LATEST_RELEASE_PAGE);
  }
}

module.exports = { initUpdateManager };
