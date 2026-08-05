# WHS IEP/BSP Generator (Desktop)

Electron Forge desktop wrapper for the single-page IEP/BSP/Adjustments generator.

**Repository:** https://github.com/jacknolanedu/whs-iep-bsp-generator

## 📥 Get Generate4U (for teachers)

**[Click here to download the latest version](https://github.com/jacknolanedu/whs-iep-bsp-generator/releases/latest)** — then follow the steps for your computer below. On Windows the app then updates itself automatically; on a Mac it tells you when a new version is ready.

### On a Mac

> On your Mac the app is called **WHS IEP BSP Generator** — that's the name
> you'll see in the Applications folder and in any security messages.

1. On the download page, click the file ending in **`.dmg`**.
2. Open the downloaded file and **drag WHS IEP BSP Generator into the
   Applications folder**.
3. The first time you open it, your Mac may say it *"could not verify"* the app
   or that it's from an *"unidentified developer"*. That's normal for small school
   tools that aren't in Apple's paid developer program — the app is safe, works
   offline, and never sends student information anywhere. To open it:
   - **Newer Macs (macOS 15 and later):** click **Done** on the warning, open
     **System Settings → Privacy & Security**, scroll down, and click
     **Open Anyway** next to WHS IEP BSP Generator. Then confirm **Open Anyway**
     again.
   - **Older Macs:** in Applications, **right-click (or Control-click)
     WHS IEP BSP Generator → Open → Open**.
4. Updating later: the app tells you when a new version is out and gives you a
   download button. Drag the new copy into Applications, click **Replace**, then
   **quit the app and open it again** to start using the new version.
   **Heads-up:** your Mac shows that same security warning after *every* update,
   so expect to repeat step 3 each time. (Buying an Apple developer certificate
   would remove the warning permanently — a school decision, not a technical one.)

### On a Windows computer

1. On the download page, click **`Generate4U-Setup.exe`**.
2. Open the downloaded file. Windows may show a blue **"Windows protected your
   PC"** box — that appears for any new app from a small publisher, and this app
   is safe. Click **More info**, then **Run anyway**.
3. There's no install wizard — a short animation plays and the app opens itself,
   with shortcuts added to your Start menu and desktop. That's it.
4. Updating later is automatic: new versions install themselves quietly the next
   time you open the app.

> **School network note:** if the download is blocked at school, ask IT to allow
> `github.com`, or download at home. On Windows, automatic updates also need
> `update.electronjs.org`, so it's worth asking IT about both at once. IT can
> verify the app themselves — all of its code is public on this page.

### Your privacy and student data

- Everything you type **stays on your computer**. Documents and progress files
  save locally; nothing you write is ever uploaded anywhere.
- The desktop app's only internet use is checking whether a newer version exists.
  On a Mac it asks GitHub for the latest version number. On Windows it asks
  `update.electronjs.org` — a free service run by the Electron project — which
  looks up this page's latest release; that request includes the app's own
  version number and whether the computer is 64-bit, and nothing else.
  **No student information is sent, on either system.**
- The browser version makes no internet connections at all.
- Your in-progress form is autosaved on your computer and offered back if the
  app closes.

### No install allowed? Use the browser version

If you can't install apps on your computer, you can run Generate4U in a web
browser instead — same forms, same documents:

1. [Download the code as a ZIP](https://github.com/jacknolanedu/whs-iep-bsp-generator/archive/refs/heads/main.zip)
2. Double-click the downloaded ZIP to unzip it, open the folder, and
   double-click **`index.html`** — it opens in your browser, no installation.
3. Note: the browser version doesn't update itself — re-download the ZIP now
   and then to stay current.

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

### Give teachers a plain-English download page
The README now opens with a download section written for teachers, not
developers: one link to the latest version, step-by-step install instructions
for Mac and Windows including exactly what to do when the computer shows its
"unverified app" security warning (unavoidable without paid signing
certificates, and worth explaining rather than leaving people stuck), a plain
statement of what the app does and doesn't do with student data, and the
browser-based fallback for locked-down computers.

### Let GitHub build every release automatically
Pushing a version tag now makes GitHub build the Mac DMG and the Windows
installer and publish them as a release — no more building installers by hand
on someone's laptop. The release goes live as soon as the build finishes, and
that is also the moment installed apps start updating to it, so a tag should
only ever be pushed on a commit that's ready for teachers. A second small
workflow now also syntax-checks the code and runs the unit tests on every pull
request. The step-by-step release routine is written down in RELEASING.md.

### The desktop app now keeps itself up to date
Installed copies of the desktop app now check GitHub for new versions when they
open and every few hours after that. On Windows the new version downloads in the
background and installs itself the next time the app opens — teachers are offered
an immediate restart but can finish what they're doing first, and either way the
update isn't skippable. Apple doesn't allow self-updating without a paid developer
certificate, so on Mac the app instead shows a clear "new version available"
message with a one-click download, then the usual drag-into-Applications step. The
update check sends only the app's version number to GitHub — never any student
data — and the browser (open-index.html) version is completely unaffected.

### Prepare the desktop packaging for automatic installer builds
The Mac build now produces a proper DMG (the standard drag-to-Applications
installer) that runs on both Intel and Apple-Silicon Macs, and the Windows
installer is named Generate4U-Setup.exe so teachers can tell what it is. Also
added the standard guard so the Windows installer's behind-the-scenes launches
don't flash app windows during install and update. No change to how documents
generate or to the open-index.html-in-a-browser path.

### Summary of this round of work

Jack, here's the short version of what I've done and why, so you can decide what you're
comfortable with. Eleven changes, grouped by what they're actually for. Every one has its
own entry below with the reasoning; this is the overview.

| # | Change | Kind |
| - | ------ | ---- |
| 1 | Two-document selection dropped five BSP sections | Document correctness |
| 2 | Missing tag meant DIP fields were never validated | Document correctness |
| 3 | Typed text now shown as text in the preview | Student-data risk |
| 4 | Dormant AI hook removed | Student-data risk |
| 5 | Desktop window pinned to the app's own page | Student-data risk |
| 6 | Redundant line that could rewrite goal-card text | Robustness |
| 7 | Warning if a new field would be missed by the export | Robustness |
| 8 | Start-up check that the two code files still agree | Robustness |
| 9 | Leftover export step that no longer did anything, removed | Tidying |
| 10 | Pop-up dialogs replaced with on-screen messages | Usability |
| 11 | `package-lock.json` name/version synced | Housekeeping |

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
goal cards.

**One usability change.** Every message the app gave you came through a pop-up that froze
the page until you clicked OK — and in the desktop app those can end up hidden behind the
window. Messages now appear as a banner you can work around. Cancelling a save is no longer
reported as a failure, and a successful export now confirms itself.

**Two tidying changes:** a leftover export step that no longer did anything, and the
`package-lock.json` name/version mismatch.

#### How this was checked

There are no tests in the project, so I built a throwaway harness that drives the real app
in a browser and captures the exact preview and Word output for **eight scenarios** — each
document on its own, each of the three pairs, all three together, and a plain-text control.
Every change was compared against those captures before and after:

- Where a change was meant to alter **nothing**, the output is byte-for-byte identical.
- Where it was meant to alter **something**, only the intended part differs.

Two details worth knowing, because they took a while to get right. The clock is frozen
during capture — otherwise every run differs on dates and no comparison means anything. And
the active tab is pinned, because with two documents ticked the app decides what to include
partly from which tab is open.

The harness lives **outside this repository**. Nothing here depends on it, and no test
tooling has been added to `package.json`.

#### What you'll notice as a user

Three changes alter what teachers experience, all deliberately:

1. Exports that previously went through with an empty **Learning** box on the DIP tab now
   stop and ask for it.
2. The "Ongoing monitoring of goals" box now sits in its own white card, like every other
   section.
3. Messages appear as a banner at the top of the page instead of a pop-up.

Everything else — including every generated document — should look and behave exactly as
before.

#### Still open, and needing your call

- **Foundation level.** For a student assessed well below standard, the code can currently
  never target Foundation level — it stops at Level 1, so a Year 1 or 2 student is given
  goals pitched above where they're working. Changing it alters the wording of generated
  goals, so it needs your view on what's pedagogically right rather than mine. I can send a
  before-and-after sample of the wording whenever you'd like to look at it.

One other thing worth knowing: the **Setup** section near the top of this README tells you
to `cd IEP-BSP-Generator-App` and copy a file from the parent folder. Neither path exists in
this repository, so those instructions don't currently work. I've left it alone since it's
your documentation, but happy to fix it if you'd like.

### Keep an automatic draft so work isn't lost
Closing the window used to lose everything not manually saved with **Save Progress** — the most likely way for a teacher to lose an afternoon's work, particularly when notes are being taken live in a meeting. The app now keeps a draft on the computer as you type, and shows "Draft saved 2:15pm" in the header with a **Discard draft** link beside it. When you next open the app it *offers* the draft back, naming the student and the time, with **Restore** and **Discard** buttons — it never fills the form in on its own, because silently loading the previous student's details would be worse than losing them. The draft clears itself once all your documents have saved successfully. An untouched form doesn't create one.

### Make the app work without an internet connection
The app loaded its fonts from Google's servers and a small download helper from another external site. On a laptop with no connection — or a school network that blocks them — the app fell back to a different typeface and looked wrong. The two font families are now bundled in `fonts/` (about 160KB, under the SIL Open Font License, with the licence included), and the download helper has been removed because the app already had a working built-in fallback. A security policy has also been added that blocks the app from contacting anything external at all, so student information cannot leave the machine even if something went wrong elsewhere in the page. Tested with the network switched off: the app looks identical and generates documents normally.

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
