#!/usr/bin/env bash
# One-time setup for the workshop repo. Run from this folder after filling in groups.json.
# Usage: ./setup.sh <owner>/<repo>      e.g. ./setup.sh iit-workshop/agentic-day2
# Needs: GitHub CLI (gh) logged in as the repo owner, Node, Git.
set -euo pipefail

REPO="${1:?Usage: ./setup.sh <owner>/<repo>}"
command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null || { echo "Run: gh auth login"; exit 1; }

echo "1/5 Generating CODEOWNERS from groups.json"
node scripts/gen-codeowners.mjs

echo "2/5 Creating $REPO (public, so rulesets work on a free plan) and pushing main"
[ -d .git ] || git init -q -b main
git add -A
git commit -qm "Workshop repo setup" || true
gh repo create "$REPO" --public --source=. --remote=origin --push

echo "3/5 Settings: squash merge only, delete branches after merge"
gh repo edit "$REPO" \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --delete-branch-on-merge

echo "4/5 Inviting people (they must accept the email invite)"
invite() { gh api -X PUT "repos/$REPO/collaborators/$1" -f permission="$2" >/dev/null && echo "  $1 ($2)"; }
for u in $(node -e 'const c=require("./groups.json"); console.log(c.instructors.join(" "))'); do
  invite "$u" admin
done
for u in $(node -e 'const c=require("./groups.json"); console.log(Object.values(c.groups).flatMap(g=>g.members).join(" "))'); do
  invite "$u" push
done

echo "5/5 Protecting main"
gh api -X POST "repos/$REPO/rulesets" --input .github/rulesets/protect-main.json >/dev/null

echo
echo "Done: https://github.com/$REPO"
echo "Next: open a test PR from a student account to confirm pr-guard runs (see README)."
