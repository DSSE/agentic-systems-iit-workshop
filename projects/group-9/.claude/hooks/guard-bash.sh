#!/usr/bin/env bash
# PreToolUse (Bash): block commands that leak secrets or skip the PR flow.
# Exit 2 blocks the call; stderr is shown to Claude.
set -u
cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0
block() { echo "Blocked: $1" >&2; exit 2; }

# .env and the API key. ".env.example" is fine, and so is the one setup copy.
no_example=${cmd//.env.example/}
if [[ ! "$cmd" =~ ^cp\ (-n\ )?\.env\.example\ \.env$ ]] &&
   grep -Eq '(^|[^A-Za-z0-9_])\.env([^A-Za-z0-9_]|$)' <<<"$no_example"; then
  block "commands must not touch .env (it holds the API key). Use .env.example, or ask the user."
fi
grep -Eq '\$\{?LLM_API_KEY|printenv|^env( |$)|[;&|] *env( |$)' <<<"$cmd" &&
  block "do not print environment variables or the API key."

# Git: work on group-9/<name> branches cut from group-9/feature. Never commit or push
# to main or the feature branch directly (PRs only), never force.
protected='main|master|group-9/feature'
if grep -Eq '(^|[;&|] *)git ' <<<"$cmd"; then
  branch=$(git -C "$(dirname "$0")" branch --show-current 2>/dev/null)
  grep -Eq 'git push.*(--force|-f( |$))' <<<"$cmd" && block "no force push."
  grep -Eq "git push.*[ :]($protected)( |$)" <<<"$cmd" &&
    block "never push to main or group-9/feature; push a work branch and open a PR into group-9/feature."
  grep -Eq -- '--no-verify' <<<"$cmd" && block "do not skip checks with --no-verify."
  if [[ "$branch" =~ ^($protected)$ ]] && grep -Eq 'git (commit|push)' <<<"$cmd"; then
    block "you are on $branch. Create a work branch first: git switch -c group-9/<short-name>"
  fi
fi
exit 0
