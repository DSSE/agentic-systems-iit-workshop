#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): block writes that break the repo rules.
# Exit 2 blocks the call; stderr is shown to Claude.
set -u
input=$(cat)
path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
[ -z "$path" ] && exit 0

group_dir=$(cd "$(dirname "$0")/../.." && pwd)
repo_root=$(git -C "$group_dir" rev-parse --show-toplevel 2>/dev/null || echo "$group_dir")
case "$path" in
  /*) abs=$path ;;
  *) abs="$(jq -r '.cwd // empty' <<<"$input")/$path" ;;
esac
abs=$(realpath -m "$abs")

# Only this group's folder may change inside the shared repo.
if [[ "$abs" == "$repo_root"/* && "$abs" != "$group_dir"/* ]]; then
  echo "Blocked: $abs is outside projects/$(basename "$group_dir")/. Only edit files in your group folder." >&2
  exit 2
fi

# Secrets: .env files are written by a person, never by the agent.
name=$(basename "$abs")
if [[ "$name" == ".env" || ( "$name" == .env.* && "$name" != ".env.example" ) ]]; then
  echo "Blocked: never write $name. Ask the user to edit it; only .env.example is tracked." >&2
  exit 2
fi
exit 0
