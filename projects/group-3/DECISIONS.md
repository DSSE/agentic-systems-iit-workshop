# Decisions
| Decision | Why | Rejected |
|---|---|---|
| Node + vanilla JS UI, no build step | Fewest moving parts for a workshop; `node --test` needs no test library | React/Vite (slower setup) |
| One domain module holds the rule | API, MCP and agent all obey it whichever model runs | Rule in each client |
| `add_expense` creates a proposal; approval is a UI/API action, not an MCP tool | "Nothing is saved until a person approves" | Agent-side approval flag |
| Price computed from vendor data, not passed by the caller | A model cannot invent a cheaper price | Accept `amount` from caller |
| Pending proposals count toward the cap; approval re-checks | Two proposals that fit alone must not exceed the cap together | Count only approved spend |
| Vendor terms screened in the store | Blocks injection for every client at once | Only in the agent prompt |
| Mock model for tests | Plumbing is testable offline; real models are for prompt comparison | Always call a real LLM in tests |
