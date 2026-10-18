# Agentic Systems in Action: Day 2 Workshop Repo

All groups work in this one repo. Each group has its own folder, works on its own branches, and merges through pull requests.

## The rules

| Rule | Example |
|---|---|
| Your folder is `projects/group-<N>/` | `projects/group-3/` |
| Your branches start with `group-<N>/` | `group-3/add-check-tool` |
| Branch names are lowercase, no spaces | `group-3/approval-prompt` ✅ `Group3 Approval` ❌ |
| Your group picks one feature branch, any `group-<N>/<name>` | `group-3/feature`, `group-3/dev` |
| Work PRs target your feature branch; only the feature branch opens a PR into `main` | |
| A PR may only change files inside your folder | |
| Nobody pushes to `main` or your feature branch; everything goes through a PR | |
| A teammate from your group must approve your PR | You can't approve your own |
| Your teammates are requested as reviewers automatically | Done by the `Request reviewers` workflow when the PR opens (or leaves draft) |

Every PR runs a check called **pr-guard**. If it fails, open the check's details: it tells you exactly what is wrong (branch name, wrong group, or files outside your folder).

## Student workflow

**First time (one person per group, usually the lead):**

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
# 1. Create your group's integration branch from main
git switch -c group-3/feature
git push -u origin group-3/feature
# 2. Add your folder on a branch and open a PR into group-3/feature
git switch -c group-3/setup
cp -r projects/_template projects/group-3
# fill in projects/group-3/README.md and specs/agent.md
git add projects/group-3
git commit -m "Group 3: project setup and spec"
git push -u origin group-3/setup
gh pr create --base group-3/feature --fill
```

A teammate reviews and approves, then the PR is merged with **Squash and merge**.

**Every feature after that:**

```bash
git switch group-3/feature && git pull
git switch -c group-3/<short-name>
cd projects/group-3 && claude      # start the agent from inside your folder
# ...build, test, read the diff...
git add . && git commit -m "Group 3: <what you did>"
git push -u origin group-3/<short-name>
gh pr create --base group-3/feature --fill
```

**When the group is ready to ship:** open one PR from `group-3/feature` into `main` (`gh pr create --head group-3/feature --base main --fill`). A teammate approves it like any other PR.

Tip: open your PR early as a draft (`gh pr create --draft`) so pr-guard checks your branch name and files right away.

### When pr-guard fails

| Message | Fix |
|---|---|
| Branch is not named correctly | `git branch -m group-<N>/<name>`, push again, and open a new PR |
| Not a member of group N | You used the wrong group number in the branch name |
| This PR goes from ... into ... | Change the PR's base to your group's feature branch (Edit next to the PR title) |
| Files outside your folder | Move the changes into your folder, or revert them: `git checkout origin/main -- <file>` |
| PR comes from a fork | Clone this repo directly (you were invited as a collaborator) and push there |

## Instructor setup

1. Fill in `groups.json` with real GitHub usernames (instructors and each group's members).
2. Install the GitHub CLI and log in as the account that will own the repo: `gh auth login`.
3. Run `./setup.sh <owner>/<repo>`. It generates CODEOWNERS, creates the repo, sets squash-only merging, invites everyone, and protects `main`.
4. Students must **accept the email invitation** before they can push. Check pending invites under Settings → Collaborators.
5. Do a test run with one student account: a correct PR passes, and a PR with a wrong branch name or a file outside the folder fails.

### How the rules are enforced

| Rule | Enforced by |
|---|---|
| No direct pushes, force pushes or deletion of `main` | Ruleset `protect-main` |
| Same for branches named exactly `group-<N>/feature` (other feature-branch names rely on the group following the flow) | Ruleset `protect-group-feature` |
| A PR needs one approval from a code owner | Rulesets + `.github/CODEOWNERS` (each group folder is owned by its members) |
| Branch name, group membership, PR base, files only in own folder | `pr-guard` workflow (a required check) |
| The check can't be edited from a PR | It runs with `pull_request_target`, from `main`; `.github/` is owned by instructors |

Notes:
- Rulesets on a free plan work only on **public** repos. For a private repo, the owner needs GitHub Team (free for schools via GitHub Education).
- An organization owner is better than a personal account: only org repos support the admin role for instructors.
- GitHub can't stop someone from *creating* a wrongly named branch on a free plan; pr-guard stops it from being *merged*.
- If you change `groups.json` later, run `node scripts/gen-codeowners.mjs` and commit both files through a PR.
