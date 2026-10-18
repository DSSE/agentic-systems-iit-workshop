#!/usr/bin/env bash
# Stop hook: the agent cannot finish while verification fails.
input="$(cat)"
active="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("stop_hook_active", False))' 2>/dev/null)"
[ "$active" = "True" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package.json ] && [ -d node_modules ] || exit 0
out="$(npm run -s verify 2>&1)"; rc=$?
if [ "$rc" -ne 0 ]; then
  echo "ERROR  npm run verify failed, so the work is not done" >&2
  echo "WHY    the stop-gate hook requires green verification" >&2
  echo "FIX    fix the failures below (do not weaken tests), then finish" >&2
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi
exit 0
