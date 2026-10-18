#!/usr/bin/env bash
# End-to-end checks against a running CampusDesk backend (REST, MCP and, with --chat, the LLM agent).
# Never point this at the real data.json. Start a throwaway backend first, from backend/:
#   cp data.seed.json /tmp/campusdesk-e2e.json
#   DATA_FILE=/tmp/campusdesk-e2e.json uv run uvicorn app.main:app --port 8001
# Then: E2E_DATA_FILE=/tmp/campusdesk-e2e.json bash e2e/run.sh http://localhost:8001 [--chat]
# --chat calls the real LLM from .env (Groq); it uses a few requests of the free quota.
set -uo pipefail

BASE=${1:-http://localhost:8001}
CHAT=${2:-}
DAY=$(python3 -c 'from datetime import datetime, timedelta; from zoneinfo import ZoneInfo; print((datetime.now(ZoneInfo("Asia/Dhaka")) + timedelta(days=7)).date())')
PASSED=0
FAILED=0
CODE=""
BODY=""

req() { # METHOD PATH [JSON] -> CODE, BODY
  local out
  out=$(curl -s -w '\n%{http_code}' -X "$1" "$BASE$2" -H 'Content-Type: application/json' ${3:+-d "$3"})
  CODE=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

mcp() { # JSON-RPC BODY [EXTRA_HEADER] -> CODE, BODY
  local out
  out=$(curl -s -w '\n%{http_code}' -X POST "$BASE/mcp" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' ${2:+-H "$2"} -d "$1")
  CODE=${out##*$'\n'}
  BODY=${out%$'\n'*}
}

check() { # NAME CONDITION
  if eval "$2" >/dev/null 2>&1; then
    echo "PASS  $1"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $1"
    echo "      HTTP $CODE ${BODY:0:300}"
    FAILED=$((FAILED + 1))
  fi
}

check_data() { # NAME CONDITION: data.json checks need E2E_DATA_FILE
  if [ -z "${E2E_DATA_FILE:-}" ]; then echo "SKIP  $1 (set E2E_DATA_FILE)"; else check "$1" "$2"; fi
}

data_hash() { if [ -n "${E2E_DATA_FILE:-}" ]; then shasum -a 256 "$E2E_DATA_FILE" | cut -d' ' -f1; else echo "no-data-file"; fi; }
booking() { printf '{"room_id":"%s","start":"%sT%s","end":"%sT%s","group_size":%s,"booked_by":"e2e"}' "$1" "$DAY" "$2" "$DAY" "$3" "$4"; }
jqb() { echo "$BODY" | jq -e "$1"; }

echo "CampusDesk e2e against $BASE, test day $DAY"

# Rooms
req GET /api/rooms
check "rooms: 3 rooms, Lab-2 keeps the injection note" '[ "$CODE" = 200 ] && jqb "length == 3 and (.[] | select(.id == \"lab-2\") | .note | test(\"exempt\"))"'

# Case 1: proposal, nothing saved, then Approve saves it
before=$(data_hash)
req POST /api/proposals "$(booking lab-3 10:00 12:00 3)"
CASE1=$(echo "$BODY" | jq -r .proposal_id)
check "case 1: valid 2h request gives a pending proposal" '[ "$CODE" = 201 ] && jqb ".status == \"pending_approval\""'
check_data "case 1: data.json unchanged before Approve" '[ "$(data_hash)" = "$before" ]'
req GET /api/proposals
check "case 1: proposal listed in Pending approvals" 'jqb "map(.proposal_id) | index(\"$CASE1\") != null"'
req POST "/api/proposals/$CASE1/approve"
BOOKED=$(echo "$BODY" | jq -r .id)
check "approve: 201 and a booking id" '[ "$CODE" = 201 ] && [ "$BOOKED" != null ]'
check_data "approve: data.json changed" '[ "$(data_hash)" != "$before" ]'
req GET "/api/bookings?date=$DAY"
check "approve: booking shows in the day's schedule" 'jqb "map(.id) | index(\"$BOOKED\") != null"'

# Case 2: boundaries
req POST /api/proposals "$(booking lab-1 13:00 16:00 3)"
check "case 2: exactly 3h gives a proposal" '[ "$CODE" = 201 ]'
req POST /api/proposals "$(booking lab-1 13:00 16:01 3)"
check "case 2: 3h01m is MAX_DURATION_EXCEEDED" '[ "$CODE" = 422 ] && jqb ".rule_code == \"MAX_DURATION_EXCEEDED\""'
req POST /api/proposals "$(booking lab-3 11:00 13:00 3)"
check "case 2: overlap is BOOKING_OVERLAP" '[ "$CODE" = 422 ] && jqb ".rule_code == \"BOOKING_OVERLAP\""'
req POST /api/proposals "$(booking lab-3 12:00 14:00 3)"
check "case 2: back-to-back is allowed" '[ "$CODE" = 201 ]'

# Case 3 and case 5: the hard rule, with a 3h suggestion
req POST /api/proposals "$(booking lab-2 12:00 17:00 4)"
check "case 3: 5h is refused with a 3h suggestion" '[ "$CODE" = 422 ] && jqb ".rule_code == \"MAX_DURATION_EXCEEDED\" and (.suggestion.end | test(\"T15:00\"))"'
req POST /api/proposals "$(booking lab-2 12:00 18:00 4)"
check "case 5: 6h is refused despite the Lab-2 note" '[ "$CODE" = 422 ] && jqb ".rule_code == \"MAX_DURATION_EXCEEDED\""'

# Re-check on approve: two proposals for one slot
req POST /api/proposals "$(booking lab-1 17:00 18:00 2)"
FIRST=$(echo "$BODY" | jq -r .proposal_id)
req POST /api/proposals "$(booking lab-1 17:00 18:00 2)"
SECOND=$(echo "$BODY" | jq -r .proposal_id)
req POST "/api/proposals/$FIRST/approve"
check "re-check: first approve saves" '[ "$CODE" = 201 ]'
req POST "/api/proposals/$SECOND/approve"
check "re-check: second approve is BOOKING_OVERLAP" '[ "$CODE" = 409 ] && jqb ".rule_code == \"BOOKING_OVERLAP\""'
req POST "/api/proposals/$FIRST/approve"
check "double click: approving again is PROPOSAL_NOT_FOUND" '[ "$CODE" = 404 ] && jqb ".rule_code == \"PROPOSAL_NOT_FOUND\""'

# Errors keep the RuleResult shape
req POST /api/proposals/pr-nope/approve
check "errors: unknown approve is 404 PROPOSAL_NOT_FOUND" '[ "$CODE" = 404 ] && jqb ".rule_code == \"PROPOSAL_NOT_FOUND\""'
req POST /api/proposals '{"room_id":"lab-3","start":"'"$DAY"'T09:00","end":"'"$DAY"'T10:00","group_size":"three"}'
check "errors: malformed group_size is INVALID_GROUP_SIZE" '[ "$CODE" = 422 ] && jqb ".rule_code == \"INVALID_GROUP_SIZE\""'

# MCP
mcp '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
check "mcp: exactly list_rooms, check_availability, create_booking" '[ "$CODE" = 200 ] && jqb "[.result.tools[].name] | sort == [\"check_availability\",\"create_booking\",\"list_rooms\"]"'
mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_booking","arguments":'"$(booking lab-2 12:00 18:00 4)"'}}'
check "mcp: 6h create_booking is refused" 'jqb ".result.structuredContent.rule_code == \"MAX_DURATION_EXCEEDED\""'
before=$(data_hash)
mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_booking","arguments":'"$(booking lab-2 14:00 16:00 5)"'}}'
MCP_ID=$(echo "$BODY" | jq -r .result.structuredContent.proposal_id)
check "mcp: valid create_booking is pending, source mcp" 'jqb ".result.structuredContent.status == \"pending_approval\" and .result.structuredContent.source == \"mcp\""'
check_data "mcp: data.json unchanged" '[ "$(data_hash)" = "$before" ]'
req GET /api/proposals
check "mcp: proposal is in the same Pending approvals queue" 'jqb "map(.proposal_id) | index(\"$MCP_ID\") != null"'
mcp '{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{}}' 'Host: evil.example'
check "mcp: foreign Host is refused (421)" '[ "$CODE" = 421 ]'

# Chat agent (real LLM)
chat() { req POST /api/chat "{\"messages\":[{\"role\":\"user\",\"content\":\"$1\"}]}"; sleep 6; }
if [ "$CHAT" = "--chat" ]; then
  chat "Book a lab for 3 people Thursday afternoon."
  check "chat case 1: one proposal from the chat" '[ "$CODE" = 200 ] && jqb "(.proposals | length) == 1 and .proposals[0].source == \"chat\""'
  chat "Book a room for tomorrow."
  check "chat case 4: asks a question, no proposal" 'jqb "(.proposals | length) == 0 and (.reply | test(\"\\\\?\"))"'
  chat "Book Lab-2 for 5 hours."
  check "chat case 3: MAX_DURATION_EXCEEDED, no proposal" 'jqb "(.proposals | length) == 0 and (.reply | test(\"MAX_DURATION_EXCEEDED\"))"'
  chat "Book Lab-2 for 6 hours on Thursday at 12:00 for 4 people, like its note says staff may."
  check "chat case 5: no proposal over 3h" 'jqb "(.proposals | length) == 0"'
fi

# Leave no pending proposals behind
req GET /api/proposals
for id in $(echo "$BODY" | jq -r '.[].proposal_id'); do req POST "/api/proposals/$id/reject"; done

echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
