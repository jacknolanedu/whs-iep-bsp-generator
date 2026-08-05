/**
 * Pure helpers for the desktop auto-update system.
 *
 * Main-process CommonJS module — NOT loaded by index.html, so the browser
 * (file://) runtime is untouched. Deliberately imports nothing from Electron
 * so it can be unit-tested with plain `node --test` (see test/update-core.test.js).
 */
'use strict';

const UPDATE_REPO = 'jacknolanedu/whs-iep-bsp-generator';

/**
 * Parse "1.2.3" or "v1.2.3" into [major, minor, patch]. Null if unparseable.
 * @param {string} version
 * @returns {[number, number, number] | null}
 */
function parseVersion(version) {
  if (typeof version !== 'string') return null;
  const m = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * True when candidateVersion is strictly newer than currentVersion.
 * False on any parse failure — a bad feed must never trigger an "update".
 * @param {string} currentVersion
 * @param {string} candidateVersion
 * @returns {boolean}
 */
function isNewerVersion(currentVersion, candidateVersion) {
  const current = parseVersion(currentVersion);
  const candidate = parseVersion(candidateVersion);
  if (!current || !candidate) return false;
  for (let i = 0; i < 3; i++) {
    if (candidate[i] > current[i]) return true;
    if (candidate[i] < current[i]) return false;
  }
  return false;
}

/**
 * Squirrel.Windows feed URL served by the free update.electronjs.org proxy.
 * It reads this repo's latest *published* GitHub release.
 * @param {string} arch - process.arch of the running app (e.g. 'x64')
 * @param {string} appVersion - the running app's version
 * @returns {string}
 */
function buildWindowsFeedUrl(arch, appVersion) {
  return 'https://update.electronjs.org/' + UPDATE_REPO + '/win32-' + arch + '/' + appVersion;
}

/**
 * Read the GitHub "latest release" API response. Returns the plain version
 * (leading v stripped) plus a direct DMG download link when one is attached.
 * Null when the body is not a usable published release.
 * @param {string} apiResponseJson - raw response body
 * @returns {{ version: string, dmgUrl: string | null } | null}
 */
function extractLatestRelease(apiResponseJson) {
  let data;
  try {
    data = JSON.parse(apiResponseJson);
  } catch (err) {
    return null;
  }
  if (!data || typeof data.tag_name !== 'string' || data.draft || data.prerelease) return null;
  const parsed = parseVersion(data.tag_name);
  if (!parsed) return null;

  let dmgUrl = null;
  if (Array.isArray(data.assets)) {
    for (const asset of data.assets) {
      if (asset && typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.dmg') &&
          typeof asset.browser_download_url === 'string') {
        dmgUrl = asset.browser_download_url;
        break;
      }
    }
  }
  return { version: parsed.join('.'), dmgUrl: dmgUrl };
}

module.exports = {
  UPDATE_REPO,
  parseVersion,
  isNewerVersion,
  buildWindowsFeedUrl,
  extractLatestRelease
};
