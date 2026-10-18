# Workshop repo: shared by all groups

This repo is shared by several groups. Each group works only in its own folder.

- Start your session from inside your group folder: `cd projects/group-<N> && claude`
- Only create or edit files inside `projects/group-<N>/`.
- Never edit `.github/`, `groups.json`, `scripts/`, or another group's folder.
- Never push to `main` or your group's feature branch (e.g. `group-<N>/feature`).
  Work on a branch named `group-<N>/<short-name>`, created from the feature
  branch, and open a PR into it (`gh pr create --base group-<N>/<feature-branch>`).
  Only the feature branch opens a PR into `main`.

These lines are guidance for the agent. The real enforcement is the pr-guard
check, CODEOWNERS and the rulesets on `main` and `group-*/feature`.
