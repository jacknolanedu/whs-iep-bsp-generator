# How we work on this repo

Plain-English working agreement for Generate4U. Written for two people — Jack, who
owns the repo, and Dave, who has collaborator access — so neither of us has to
remember what we agreed in a chat window six weeks ago.

Nothing here is fussy for its own sake. Every rule exists because breaking it has a
real consequence, and the consequence is spelled out.

---

## The short version

1. **Never commit directly to `main`.** Branch, open a pull request, merge the PR.
2. **Never use `git push --force`.** It destroys history other people may have.
3. **Branch from `main`**, not from another branch.
4. **One idea per pull request.** Small enough to read in five minutes.
5. **Every PR adds an entry to `## Changes by mrdavearms` in the README.**
6. **Delete the branch after the PR merges.**
7. **Only tag a release when it's ready for teachers** — publishing is instant and
   installed apps start updating within hours.

---

## Why not just commit to `main`?

`main` is what teachers download. A mistake there is live immediately — there's no
staging copy and no undo button that doesn't involve pain.

A pull request costs about thirty seconds and gives you three things: the automated
checks run before anything lands, the change gets a written explanation attached to
it forever, and if it turns out to be wrong you can revert one tidy commit instead
of untangling a dozen.

### Making this automatic (Jack — this needs your admin access)

Right now the rule above is an honour system. `main` is unprotected, so a mistyped
command *would* succeed. GitHub can enforce it instead, and it takes about a minute.

**Settings → Branches → Add branch ruleset** (on older layouts: *Add rule*)

- Branch name pattern: `main`
- ✅ **Require a pull request before merging**
- ✅ **Require status checks to pass** → search for and select **`checks`**
  (that's the test job — it stops a PR that breaks the app from merging)
- ✅ **Block force pushes**
- ❌ **Do not** tick *Require approvals* yet. With only two people it means neither
  of us can merge anything alone. Turn it on if a third person ever joins.

Also worth ticking, in **Settings → General**:

- ✅ **Automatically delete head branches** — does rule 6 for you, safely.

Only a repository **admin** can do this. Dave has Write access, which is enough to
push branches and merge PRs but *not* enough to change settings — so this one is
yours, and it can't be done on your behalf.

---

## Branches

Name them `type/short-description`:

| Prefix | For |
| ------ | --- |
| `fix/` | Something is broken |
| `feat/` | Something new |
| `docs/` | Documentation only |
| `chore/` | Housekeeping, dependencies, config |

Examples from this repo: `fix/preview-escaping`, `feat/auto-update`,
`docs/teacher-download-guide`.

### Branch from `main`, not from another branch

```bash
git checkout main
git pull
git checkout -b fix/whatever-it-is
```

It's tempting, when you're mid-way through one change and think of another, to
branch off what you're already working on. Resist it. That's called *stacking*, and
while it reads beautifully in review, it goes wrong in ways that are hard to undo:

- The PRs must be merged in exact order or they conflict.
- **Deleting a branch that another open PR is based on will close that PR
  automatically** — and GitHub then refuses to reopen it until you push the deleted
  branch back. This has already happened here once.

If two branches touch the same file you'll get a merge conflict instead. Conflicts
look scarier but they're visible and fixable; a broken PR chain is neither.

Only stack when the second change genuinely cannot work without the first — and say
so in the PR description.

### Delete branches after merging

Once a PR is merged its branch has done its job. The commits live in `main`'s
history permanently, so deleting the branch loses nothing, and every merged PR page
carries a **Restore branch** button if you ever want it back.

Leaving them accumulates: this repo reached nineteen stale branches before the first
clear-out.

---

## Pull requests

**One idea per PR.** A PR that changes one thing gets read properly. A PR that
changes nine things gets waved through, which defeats the point.

**Write the description for the person reading it, not for the person who wrote it.**
What was happening, what you changed, and why it matters. If the generated documents
will read differently afterwards, say so explicitly — that's the thing Jack most
needs to know and the thing a diff hides best.

**Every PR adds a README changelog entry.** Newest first, under
`## Changes by mrdavearms`, one heading and two to four sentences. Rationale over
mechanics: *"notes containing `<` displayed incorrectly"* beats *"added escapeHtml()
to 14 interpolation sites"*. This repo is public — describe fixed security issues by
their symptom, never with reproduction steps.

**The checks must be green before merging.** Every PR runs `npm test` and a syntax
check on every script. If they fail, the change is broken — fix it rather than
merging around it.

---

## Who decides what

A two-person project works best when this is said out loud rather than assumed:

- **Jack** decides anything that changes what the generated documents *say* —
  goal wording, curriculum levels, the pedagogy. That's his professional judgement
  and it isn't a code decision. He also owns releases going out to staff.
- **Dave** decides implementation — how something is built, tested, and packaged.
- **Either** can do documentation and housekeeping.

When in doubt, ask in the PR description rather than deciding quietly. "I've assumed
X, tell me if that's wrong" costs nothing and catches a lot.

---

## Releases

Full walkthrough in [RELEASING.md](RELEASING.md). The two things worth knowing here:

**Publishing is instant and irreversible in practice.** Pushing a tag `vX.Y.Z` builds
both installers and publishes the release live. Installed apps start updating to it
within hours. There is no draft step and no approval gate — so only tag a commit
that's genuinely ready for teachers.

**Never reuse a version number.** Once a release is published, teachers' apps may
have updated to it. Deleting or replacing it breaks the update chain for everyone who
already has it. Always go forwards: 1.2.0 → 1.2.1, never sideways.

---

## Commands you'll actually use

```bash
npm install     # once, after cloning
npm start       # run the desktop app
npm test        # unit tests
```

Before opening a PR:

```bash
npm test
node --check src/main.js
```

Both of these also run automatically on the PR, so this is just a way of finding out
faster.

---

## The one genuinely dangerous command

```bash
git push --force
```

It rewrites history that other people may already have pulled, and the work it
overwrites is not recoverable through the GitHub interface. There is no situation in
this repo that needs it. If something looks like it does, stop and ask — the safe fix
is almost always a new commit that undoes the problem, which leaves a trail.

Enabling **Block force pushes** in the branch ruleset above removes the possibility
entirely, which is the better answer than remembering.

---

## If something goes wrong

Very little in git is actually unrecoverable, and nothing is unrecoverable if you
stop before "fixing" it.

- **Committed to the wrong branch?** The commit is fine. It can be moved.
- **Merged something you shouldn't have?** GitHub has a **Revert** button on every
  merged PR — it makes a new PR undoing the change, with history intact.
- **Deleted a branch you needed?** The merged PR page has **Restore branch**.
- **Published a release too early?** Don't delete it — publish a corrected version
  with a higher number. Deleting a release that teachers' apps have already seen is
  what actually breaks things.

The pattern: go *forwards* out of a mistake, don't try to erase it.
