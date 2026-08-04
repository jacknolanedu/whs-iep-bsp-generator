# WHS IEP/BSP Generator (Desktop)

Electron Forge desktop wrapper for the single-page IEP/BSP/Adjustments generator.

**Repository:** https://github.com/jacknolanedu/whs-iep-bsp-generator

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer (includes npm)

## Setup

```bash
cd IEP-BSP-Generator-App
npm install
```

`index.html` is the app UI. After editing `IEP-BSP-Generator.html` in the parent folder, copy it here:

```bash
copy ..\IEP-BSP-Generator.html index.html
```

## Run in development

```bash
npm start
```

Optional DevTools: `set ELECTRON_DEVTOOLS=1` (Windows) then `npm start`.

## Build installers

```bash
npm run package
npm run make
```

Windows installers are written under `out/make/`.

## Publish to GitHub Releases

1. Create the repo `whs-iep-bsp-generator` under https://github.com/jacknolanedu (or update `repository` in `package.json` and `publishers` in `forge.config.js` if you use another name).
2. Set a token with `repo` scope: `set GITHUB_TOKEN=your_token` (Windows CMD) or `$env:GITHUB_TOKEN="your_token"` (PowerShell).
3. Run:

```bash
npm run publish
```

## Generate All (3 Word documents)

The bundled `index.html` preserves **All Documents** mode: three mode-scoped scrapes (`IEP`, `BSP`, `Adjustments`), filenames `[Name]_IEP.doc`, `[Name]_BSP.doc`, `[Name]_Adjustments.doc`, and a 1 second delay between downloads.

## Word export (desktop)

After you **Generate** documents, each export row has **Generate Word** only (no PDF buttons). In the desktop app, saving uses Electron’s system **Save** dialog and `fs.writeFile` in `src/main.js` (`save-word-document` IPC), so each IEP, BSP, and Adjustments file is written independently without blocking the UI.

Implementation:

- `src/main.js` — IPC handler `save-word-document`
- `src/preload.js` — exposes `window.electronAPI.saveWordDocument()`
- `index.html` — isolated per-document snapshots and individual **Generate Word** actions (including in Full suite / All Documents mode)

## Changes by mrdavearms

Contributions from [@mrdavearms](https://github.com/mrdavearms), newest first. Each entry says what changed and why, so the reasoning is visible without reading the diff.

### Sync package-lock.json with package.json
The lockfile still described the project as `whs-iep-bsp-generator` version `1.0.0`, while `package.json` says `generate4u` version `1.1.7`. npm rewrites those fields automatically on the next `npm install`, so the mismatch showed up as an unexpected change in the working directory for anyone setting the project up. Committing the corrected values makes a fresh `npm install` leave the repository clean. No dependency versions changed and there is no effect on the app.
