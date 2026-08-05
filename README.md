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

### Summary of this round of work

Jack, here's the short version of what I've done and why, so you can decide what you're
comfortable with. Nine changes, grouped by what they're actually for.

**Two bugs that were quietly producing incomplete documents.** These are the ones I'd
look at first, because they affected what ended up in a student's file:

- Ticking **two** documents (say BSP and Classroom Adjustments) made the app treat one of
  them as switched off. A BSP generated that way came out missing five whole sections —
  Behaviours Demonstrated Well, Behaviours of Concern, Current Interventions, Functional
  Behaviour and PBIS Interventions. Ticking BSP on its own gave the complete document, so
  the same student could get two different plans depending on the tick-boxes, with no
  warning either way.
- A missing `<div>` tag caused the browser to close the form early, which put the whole
  DIP tab outside it. The required **Learning** box was therefore never checked — a
  Classroom Adjustments document could be generated with it completely empty.

**Three things that reduce risk around student information.** The app holds names,
behaviours, diagnoses and family circumstances, so these felt worth tightening:

- Text typed into the form is now displayed as text in the preview rather than being
  interpreted as page formatting.
- A dormant hook that could have sent student details to an external AI service has been
  removed. It was switched off, but it sat in a public repository with a comment inviting
  someone to add an API key. **The app now makes no network requests of any kind.**
- The desktop window is now pinned to the app's own page and can't be navigated elsewhere.

**Three changes that make future mistakes visible** rather than silent: a warning if a new
form field would be missed by the export, a start-up check that the two code files still
agree on function names, and removal of a redundant line that could rewrite text in the
goal cards. Plus one housekeeping fix to `package-lock.json`.

**How this was checked.** There are no tests in the project, so I built a throwaway test
harness that drives the real app in a browser and captures the exact preview and Word
output for eight scenarios — each document on its own, each pair, all three together, and
a plain-text control. Every change was compared against those captured outputs before and
after. Where a change was meant to alter nothing, the output is byte-for-byte identical;
where it was meant to alter something, only the intended part differs. The harness isn't
part of this repository — it lives outside it, so nothing here depends on it.

**Behaviour you'll notice.** Two changes alter what teachers experience, deliberately:
exports that previously went through with an empty **Learning** box will now stop and ask
for it, and the "Ongoing monitoring of goals" box now sits in its own white card like every
other section. Everything else should look and behave exactly as before.

**Still open, and needing your call before I go further:** whether to self-host the Google
Fonts files or drop them (it affects both appearance and whether the desktop app needs
internet); whether saving an automatic draft of in-progress work to the browser is
acceptable given it would hold student data on a shared staff machine; and whether
Foundation level is the right target for a young student assessed well below standard —
at the moment that level is unreachable in the code. Also worth knowing: the Setup section
near the top of this README refers to a folder and a file that don't exist in the
repository, so those instructions don't currently work.

### Replace pop-up dialogs with on-screen messages
Every message the app gave you — validation prompts, export errors, save failures — came through a browser pop-up that freezes the page until you click OK. In a meeting that's disruptive, and in the desktop app the dialog can end up hidden behind the window. Messages now appear as a small banner at the top of the page that you can keep working around, colour-coded by kind: errors stay until dismissed, everything else clears itself. They're also announced properly to screen readers. One dialog is deliberately kept — if `src/session-progress.js` fails to load the app is genuinely broken, and that warrants stopping you. Also fixed a related annoyance: cancelling a save dialog was reported as "Export finished with some issues", when cancelling is a deliberate choice. The app now distinguishes cancelled from failed, and confirms when documents save successfully.

### Remove a leftover step that no longer did anything
Before building a Word document, the app copied every field's contents back into the page as HTML attributes. That was needed by an older design that built documents by reading the page markup; the current code reads the fields directly, so nothing looked at those attributes any more. The step still ran on every export, doing invisible work. Checked first that nothing reads them — no code reads the attributes back, and no styling depends on them — then removed it. Save and Load Progress still round-trip all 78 fields unchanged, and all eight test documents are byte-for-byte identical.

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
