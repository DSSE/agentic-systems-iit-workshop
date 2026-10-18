---
description: Check for new repo members, update groups.json and CODEOWNERS from the group PDFs, commit to main
argument-hint: <folder containing the group PDFs>
allowed-tools: Bash, Read, Edit, Glob, Grep
---

Instructor-only. Sync newly added repo members into `groups.json` and `.github/CODEOWNERS`.

PDF folder: `$ARGUMENTS` (if empty, look for a `*.pdf` set in `./pdfs/`; if none, stop and ask for the path).

Steps:

1. Make sure you are on `main` with a clean tree and up to date: `git checkout main && git pull --ff-only`. If the tree is dirty, stop and report.
2. List current repo members (collaborators): `gh api --paginate repos/{owner}/{repo}/collaborators --jq '.[].login'`. Also include pending invitations: `gh api repos/{owner}/{repo}/invitations --jq '.[].invitee.login'`.
3. Compare, case-insensitively, against `instructors` and every group's `members` in `groups.json`. The difference is the set of **new members**. If empty, report "No new members" and stop. Do not touch any file.
4. Read the PDFs in the folder (use the `anthropic-skills:pdf` skill or `pdftotext`). There are two:
   - **Form responses PDF** (`Untitled form (Responses) - Form Responses 1.pdf`): columns Timestamp, Full Name, Registered Email, GitHub Username. Gives username -> email/name. The username may be a full URL (`https://github.com/<user>`, `www.github.com/<user>`) or have trailing spaces or a glued email; take the last path segment and trim.
   - **Team list PDF** (`Team list.pdf`): team name -> members (name, phone, email). Map the team name to a group number using `groups-list.md` (e.g. Data Dynamos = group 1).
   Resolve each new member: username -> email/name (form) -> team (team list) -> group number. Match by email first, then by name (fuzzy, ignoring punctuation and word order). Emails and names sometimes differ slightly between the two PDFs (typos, a different email for the same person), so a name match with a differing email is a *probable* match: flag it.
   - If a new member cannot be matched to exactly one group, or only has a probable match, do not guess. List them with the evidence and ask the user before editing.
   - Do not remove or reorder existing members, and do not change `project` names.
5. Add each matched username to the right group's `members` array in `groups.json`, keeping the existing formatting (one line per group). Replace a `student-*` placeholder in that group if one exists, otherwise append.
6. Run `node scripts/gen-codeowners.mjs` to regenerate `.github/CODEOWNERS`. Never edit CODEOWNERS by hand.
7. Show `git diff --stat` and the diff of `groups.json`. Only those two files may be changed.
8. Commit directly to `main`: `git add groups.json .github/CODEOWNERS && git commit -m "Add <user> (group <N>), ..."`.
9. Try `git push origin main`. If the `main` ruleset rejects the push, say so plainly and leave the commit local; do not force or bypass.
10. Report: new members found, group assigned to each, anything unmatched, and whether the push succeeded.
