'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  UPDATE_REPO,
  parseVersion,
  isNewerVersion,
  buildWindowsFeedUrl,
  extractLatestRelease
} = require('../src/update-core.js');

test('parseVersion handles plain and v-prefixed versions', () => {
  assert.deepStrictEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepStrictEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.deepStrictEqual(parseVersion(' V10.0.7 '), [10, 0, 7]);
});

test('parseVersion rejects garbage', () => {
  assert.strictEqual(parseVersion('latest'), null);
  assert.strictEqual(parseVersion('1.2'), null);
  assert.strictEqual(parseVersion(''), null);
  assert.strictEqual(parseVersion(null), null);
  assert.strictEqual(parseVersion(undefined), null);
});

test('isNewerVersion orders correctly', () => {
  assert.strictEqual(isNewerVersion('1.1.7', '1.1.8'), true);
  assert.strictEqual(isNewerVersion('1.1.7', '1.2.0'), true);
  assert.strictEqual(isNewerVersion('1.1.7', '2.0.0'), true);
  assert.strictEqual(isNewerVersion('1.1.7', '1.1.7'), false);
  assert.strictEqual(isNewerVersion('1.2.0', '1.1.9'), false);
  // double-digit segments must compare numerically, not as strings
  assert.strictEqual(isNewerVersion('1.9.0', '1.10.0'), true);
  assert.strictEqual(isNewerVersion('1.10.0', '1.9.0'), false);
});

test('isNewerVersion is false when either side is unparseable', () => {
  assert.strictEqual(isNewerVersion('garbage', '1.2.0'), false);
  assert.strictEqual(isNewerVersion('1.2.0', 'garbage'), false);
});

test('buildWindowsFeedUrl embeds repo, arch, and version', () => {
  assert.strictEqual(
    buildWindowsFeedUrl('x64', '1.1.7'),
    'https://update.electronjs.org/' + UPDATE_REPO + '/win32-x64/1.1.7'
  );
});

test('extractLatestRelease reads tag and DMG asset url', () => {
  const body = JSON.stringify({
    tag_name: 'v1.2.0',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'Generate4U-Setup.exe', browser_download_url: 'https://example.com/setup.exe' },
      { name: 'WHS IEP BSP Generator-1.2.0-universal.dmg', browser_download_url: 'https://example.com/app.dmg' }
    ]
  });
  assert.deepStrictEqual(extractLatestRelease(body), {
    version: '1.2.0',
    dmgUrl: 'https://example.com/app.dmg'
  });
});

test('extractLatestRelease tolerates a missing DMG asset', () => {
  const body = JSON.stringify({ tag_name: 'v1.2.0', draft: false, prerelease: false, assets: [] });
  assert.deepStrictEqual(extractLatestRelease(body), { version: '1.2.0', dmgUrl: null });
});

test('extractLatestRelease rejects drafts, prereleases, and bad input', () => {
  assert.strictEqual(extractLatestRelease(JSON.stringify({ tag_name: 'v9.9.9', draft: true, assets: [] })), null);
  assert.strictEqual(extractLatestRelease(JSON.stringify({ tag_name: 'v9.9.9', prerelease: true, assets: [] })), null);
  assert.strictEqual(extractLatestRelease(JSON.stringify({ tag_name: 'not-a-version', assets: [] })), null);
  assert.strictEqual(extractLatestRelease('not json at all'), null);
  assert.strictEqual(extractLatestRelease(''), null);
});
