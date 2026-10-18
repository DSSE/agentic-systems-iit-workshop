# Functional Requirements
- FR-1 Show vendors with prices and the event's budget position (cap, approved, waiting, left).
- FR-2 Propose an expense from a vendor item and quantity; show it as "waiting for approval".
- FR-3 Approve saves the expense; Reject discards it. Only the Approve button saves.
- FR-4 An expense that brings the total exactly to the cap is allowed; 1 BDT over is refused with `BUDGET_CAP_EXCEEDED`.
- FR-5 A request over the cap is refused with the rule code and a smaller order is suggested.
- FR-6 MCP server with `list_vendors`, `check_budget`, `add_expense`; works from any MCP client.
- FR-7 Chat agent in the UI uses the MCP tools; "Plan snacks and a speaker..." works in plain words.
- FR-8 Unclear requests ("Plan food for the seminar.") get a question: how many people, how much to spend.
- FR-9 Injected text in vendor terms is ignored and cannot cause spending over the cap.
