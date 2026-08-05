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

### Report when the two code files fall out of step
`index.html` and `src/session-progress.js` are connected only by function names: the second file looks up around 46 functions defined in the first, and every lookup quietly does nothing if the name isn't found. So renaming a function in `index.html` doesn't produce an error — it just makes part of Save/Load Progress or the Full Suite export stop working, with nothing to indicate why. The expected names are now listed in one place and checked when the app starts, printing a clear message naming anything missing. A healthy start-up stays silent; add `?debug=1` to the address to confirm the check ran.

### Warn when a new field would be missed by the export
When each document is built, the app copies the form's contents through a hand-written list of field names. Any field added to the form in future but forgotten in that list would be silently left out of the generated document — no error, just missing content. The list is correct today; this adds a check that prints a clear warning to the developer console if the two ever drift apart, so the problem shows up during development rather than in a student's document. Also merges two near-identical text-escaping helpers into one, since the older of the two handled slightly less. Nothing changes in the app's output.

### Remove the unused AI hook from the goal generator
The goal generator contained a dormant option to send student details to an external AI service, switched off by two blank settings and accompanied by a comment inviting someone to fill in an API key. Because the app is a single HTML file in a public repository, filling those in would have put the key in plain sight and sent student information to a third party — a lot of risk sitting behind two empty strings. The code was never active, so removing it changes nothing: goals are still built from the local template library, and all eight test documents are byte-for-byte identical. The app now makes no network requests of any kind.

### Stop the desktop app navigating away from itself
The desktop app had no restriction on where its window could go. Nothing in the app tries to open external links, but with no guard in place, content in the page could in principle send the window to another site — which matters because the form holds student information. The window is now pinned to the app's own page: attempts to open a new window or navigate elsewhere are refused and logged, while reloading the app itself still works. Saving documents is unaffected, as downloads use a separate mechanism. Browser use is unchanged; this only applies to the desktop build.

### Show typed text as text in the on-screen preview
The preview was built by dropping the form's contents straight into the page, so anything a teacher typed that looked like HTML — angle brackets, ampersands — was treated as formatting instead of being shown as text. A note like "reading < Year 4 level" displayed incorrectly, and pasted content could disturb the page. The preview now shows typed text exactly as entered. The Word export already handled this correctly and is unchanged: all eight test documents are byte-for-byte identical to before, as is the preview for text that contains no special characters.

### Remove a redundant line that could alter goal text
When preparing a Word export, the app copied each text box's contents back into the page twice — once correctly, and once in a way that made the browser re-interpret the text as HTML. For most text that makes no difference. But in the SMART goal cards, text containing sequences like `&amp;` or `&lt;` was silently rewritten (`&amp;` became `&`), changing what appeared in the document. The second copy was never needed; the line above it already does the job. Removing it leaves normal exports byte-for-byte identical — verified across eight test cases covering every document combination.

### Fix content being dropped when two documents are selected
Ticking exactly two documents (say BSP and Classroom Adjustments) caused the app to treat one of them as switched off. The form can only track a single "mode" at a time, and the code only used the real tick-box selection when all three documents were chosen — with two, it fell back to whichever tab happened to be open and marked the other document's tabs inactive. Fields on those tabs were then skipped when the document was built. The visible consequence: a BSP generated with two documents selected was missing Behaviours Demonstrated Well, Behaviours of Concern, Current Interventions, Functional Behaviour and PBIS Interventions — with no warning. Selecting BSP on its own produced the complete document, so the same student could get two different plans depending on the tick-boxes. The selection is now used whenever more than one document is chosen. Documents generated from a two-document selection are now identical to the single-document versions.

### Fix missing tag that stopped DIP fields being validated
A `<div>` opening tag was missing in the IEP tab, around the "Ongoing monitoring of goals" box. Browsers repair markup like this silently, and the effect here was that the browser closed the `<form>` early — so the whole DIP tab ended up outside the form as far as the page was concerned. The visible consequence: the required **Learning** box on the DIP tab was never checked, so a teacher could generate a Classroom Adjustments document with it completely empty and get no warning. Adding the missing tag puts the DIP tab back inside the form and the check now runs. **This changes behaviour** — exports that previously went through with an empty Learning box will now stop and ask for it, and the monitoring box now sits in its own white card like every other section.

### Sync package-lock.json with package.json
The lockfile still described the project as `whs-iep-bsp-generator` version `1.0.0`, while `package.json` says `generate4u` version `1.1.7`. npm rewrites those fields automatically on the next `npm install`, so the mismatch showed up as an unexpected change in the working directory for anyone setting the project up. Committing the corrected values makes a fresh `npm install` leave the repository clean. No dependency versions changed and there is no effect on the app.
