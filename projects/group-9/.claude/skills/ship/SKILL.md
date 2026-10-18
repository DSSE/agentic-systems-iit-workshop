---
name: ship
description: Review the group branch and push it as a pull request. Use only when the user asks to push, ship, or open a PR.
disable-model-invocation: true
---

# Ship the branch

Flow: work branch `group-9/<short-name>` → PR into `group-9/feature` → (the group, when ready) one PR from `group-9/feature` into `main`. This skill does the first PR only.

1. **Branch:** `git branch --show-current` must match `group-9/<short-name>` and must not be `group-9/feature`. If not, stop.
2. **Up to date:** `git fetch origin` and check the branch contains `origin/group-9/feature` (`git merge-base --is-ancestor origin/group-9/feature HEAD`). If not, ask the user before rebasing or merging.
3. **Scope:** `git diff --name-only origin/group-9/feature...HEAD` and `git status --short`. Every path must start with `projects/group-9/`. No `.env`, keys, `node_modules`, `.venv` or `miss/`.
4. **Checks:** run the `e2e-tester` agent (pytest, e2e script, frontend lint and build). Everything must pass.
5. **Review:** run the `rule-guardian` agent on `git diff origin/group-9/feature...HEAD`. Fix confirmed findings first.
6. **Show the user** the changed files, test results and review result, and ask: push and open the PR? Stop here until they say yes.
7. **Push:** `git push -u origin <branch>`, then `gh pr create --base group-9/feature` with `.github/pull_request_template.md` filled in: what it does (link the spec section), the checklist, the tier (Milestone 1/2/3), and AI use. End the body with the attribution line.
8. Give the user the PR link. A teammate approves it; pr-guard must pass.
