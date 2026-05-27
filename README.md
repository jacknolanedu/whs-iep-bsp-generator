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

## PDF export

In the desktop app, after you **Generate** documents, each export row includes **Save PDF**. That uses Electron’s native `webContents.printToPDF()` (Chromium) with the same print CSS as **Print / Save as PDF**, so only the selected document section is included.

Implementation:

- `src/main.js` — IPC handler `save-document-pdf`
- `src/preload.js` — exposes `window.electronAPI.saveDocumentAsPdf()`
- `index.html` — **Save PDF** buttons when running inside Electron
