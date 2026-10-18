#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): flag edits that drift from the spec's invariants,
# then format Python with ruff if the backend has it. Exit 2 sends the notes to Claude.
set -u
path=$(jq -r '.tool_input.file_path // empty')
[[ -z "$path" || ! -f "$path" ]] && exit 0
group_dir=$(cd "$(dirname "$0")/../.." && pwd)
rel=${path#"$group_dir"/}
notes=()

case "$rel" in
  backend/app/domain/booking_rules.py) ;;
  backend/app/*.py|backend/app/**/*.py)
    # The cap and the rule logic live only in the domain module.
    if grep -nE '\b180\b|hours *= *3\b|minutes *= *180|MAX_DURATION_MINUTES *=' "$path" >/dev/null; then
      notes+=("$rel looks like it re-implements the 3-hour cap. Import it from app.domain.booking_rules instead.")
    fi
    # Only store.py writes data.json.
    if [[ "$rel" != backend/app/store.py ]] &&
       grep -nE 'json\.dump\(|write_text\(|open\([^)]*["'\''](w|a)' "$path" >/dev/null; then
      notes+=("$rel writes a file. Only app/store.py may write data.json, and only from the approve endpoint.")
    fi
    ;;
esac

# Prompts get the cap injected from the domain, so the number is never typed in.
case "$rel" in
  backend/app/prompts/*.md)
    if grep -niE '\b180\b|\b(3|three)[ -]hours?\b' "$path" >/dev/null; then
      notes+=("$rel hard-codes the cap. Use the injected MAX_DURATION_MINUTES placeholder instead.")
    fi
    ;;
esac

# No approve tool for agents.
case "$rel" in
  backend/app/mcp_server.py|backend/app/agent.py)
    if grep -niE 'def [a-z_]*approve|["'\'']approve[a-z_]*["'\'']' "$path" >/dev/null; then
      notes+=("$rel exposes something named approve. Approve is a REST endpoint for the UI button only.")
    fi
    ;;
esac

# Format Python once ruff is a dev dependency of the backend.
if [[ "$rel" == backend/*.py ]] && grep -q 'ruff' "$group_dir/backend/pyproject.toml" 2>/dev/null; then
  (cd "$group_dir/backend" && uv run --quiet ruff format "$path" >/dev/null 2>&1 &&
    uv run --quiet ruff check --fix --quiet "$path" >&2) ||
    notes+=("ruff found problems in $rel (see above).")
fi

if ((${#notes[@]})); then
  printf 'Spec check: %s\n' "${notes[@]}" >&2
  exit 2
fi
exit 0
