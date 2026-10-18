#!/usr/bin/env bash
# PreToolUse hook. exit 2 = blocked. Uses node (not python) so it works on Windows, Mac and Linux.
input="$(cat)"
cmd="$(printf '%s' "$input" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).tool_input?.command??"")}catch{console.log("")}})' 2>/dev/null)"
patterns='rm +-rf +(/|~|\*)|git +push +.*(-f|--force)|git +reset +--hard|git +push +[a-z]+ +main|git +push +origin +HEAD:main|chmod +-R +777|curl .*\| *(sh|bash)'
if printf '%s' "$cmd" | grep -Eiq "$patterns"; then
  echo "ERROR  blocked command: $cmd" >&2
  echo "WHY    it can destroy work, or it pushes to main (all changes go through a PR)" >&2
  echo "FIX    use a narrower command, or push your group-<N>/<name> branch and open a PR" >&2
  exit 2
fi
exit 0
