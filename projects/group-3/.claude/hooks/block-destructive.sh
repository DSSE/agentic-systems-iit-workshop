#!/usr/bin/env bash
# PreToolUse hook. exit 2 = blocked. Also protects main: nobody pushes to main in this repo.
input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)"
patterns='rm +-rf +(/|~|\*)|git +push +.*(-f|--force)|git +reset +--hard|git +push +[a-z]+ +main|git +push +origin +HEAD:main|chmod +-R +777|curl .*\| *(sh|bash)'
if printf '%s' "$cmd" | grep -Eiq "$patterns"; then
  echo "ERROR  blocked command: $cmd" >&2
  echo "WHY    it can destroy work, or it pushes to main (all changes go through a PR)" >&2
  echo "FIX    use a narrower command, or push your group-<N>/<name> branch and open a PR" >&2
  exit 2
fi
exit 0
