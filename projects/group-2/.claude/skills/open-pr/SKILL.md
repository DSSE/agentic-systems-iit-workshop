---
name: open-pr
description: Open a GitHub pull request for Group 2. Use when the user asks to open, create or raise a PR, or to ship/submit a feature. Creates or uses a group-2/<feature> branch, makes sure only files under projects/group-2/ change, pushes, and opens the PR against group-2/dev.
---

# Open a PR (Group 2)

Group 2 rules:

- **Base branch is `group-2/dev`**, never `main`. A collaborator reviews and merges into dev.
- **Head branch must be `group-2/<feature>`**: lowercase, kebab-case, short (e.g. `group-2/create-tool`).
  `group-2/dev` itself is never a head branch.
- **Only paths under `projects/group-2/` may change.** Never touch `.github/`, `groups.json`,
  `scripts/`, the root `CLAUDE.md`, or another group's folder.
- Never force-push, never push to `main` or directly to `group-2/dev`.

Run git from the repo root via `git -C "$(git rev-parse --show-toplevel)"` or with paths
relative to it; the session usually starts inside `projects/group-2`.

## Steps

### 1. Pick the feature branch

```bash
git branch --show-current
git status --short
```

- Already on `group-2/<feature>` (not `dev`)? Use it.
- On `group-2/dev` or anything else? Ask the user for a short feature name if it isn't obvious
  from the request, then:
  ```bash
  git fetch origin
  git switch -c group-2/<feature>
  ```
  Uncommitted changes carry over to the new branch. If `group-2/<feature>` already exists, ask
  before reusing it.

### 2. Make sure `group-2/dev` exists on the remote

```bash
git ls-remote --exit-code --heads origin group-2/dev
```

If it's missing, tell the user and ask before pushing it
(`git push -u origin group-2/dev`). Don't open a PR against a base that doesn't exist.

### 3. Commit only Group 2 files

Stage by path, never `git add -A` or `git add .` from the repo root:

```bash
git add -- projects/group-2/
git status --short
```

If anything outside `projects/group-2/` is modified or staged, unstage it
(`git restore --staged -- <path>`) and tell the user; don't commit it. Write a short commit
message in the imperative mood, ending with the attribution trailer the session specifies.

Run `npm test` inside `projects/group-2` first if a `package.json` exists. If tests fail,
report the output and stop unless the user says to proceed. Never weaken a test to pass.

### 4. Verify the whole branch diff is scoped

This is the hard check. Compare against the base, not just the last commit:

```bash
git fetch origin group-2/dev
git diff --name-only origin/group-2/dev...HEAD | grep -v '^projects/group-2/'
```

If that prints **anything**, stop. Show the offending files and ask how to fix them
(usually `git restore --source=origin/group-2/dev -- <path>` and a new commit). Don't open the PR.

Also confirm the diff isn't empty: `git diff --stat origin/group-2/dev...HEAD`.

### 5. Push

```bash
git push -u origin group-2/<feature>
```

No `--force`. If the push is rejected, pull/rebase onto `origin/group-2/<feature>` and explain.

### 6. Open the PR

With the GitHub CLI (`gh`):

```bash
gh pr create --base group-2/dev --head group-2/<feature> \
  --title "Group 2: <summary>" \
  --body-file <scratchpad>/pr-body.md
```

PR body template:

```markdown
## What
<1–3 bullets on what changed>

## Why
<one line>

## Testing
<npm test result, or how it was checked>

Scope: only `projects/group-2/` changed.
```

End the body with the PR attribution line the session specifies.

If `gh` is missing or not logged in, don't try other tools to call the API. Give the user the
compare URL to open the PR in the browser, with base and head already filled in:

```
https://github.com/<owner>/<repo>/compare/group-2/dev...group-2/<feature>?expand=1
```

Get `<owner>/<repo>` from `git remote get-url origin`, and give the user the title and body
to paste. Mention they can install `gh` (`winget install GitHub.cli`, then `gh auth login`).

### 7. Report

Tell the user the PR URL (or compare URL), the branch, the base (`group-2/dev`), and the
list of changed files.
