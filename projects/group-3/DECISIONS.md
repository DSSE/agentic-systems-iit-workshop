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
| Two chat roles share the MCP connection; reviewer only reads the budget | Planner can propose, reviewer independently checks position, and neither can approve | A second writer agent or an approval tool |
| Offline mock is the default only when no model settings exist | Chat remains usable in a clean local setup while configured real providers take precedence | Fail chat until a model is configured |
| Scenario evals include an AI judge and keep deterministic hard-rule gates | Model review catches scenario mismatches; the hard rule cannot be waived by the judge | Let an AI verdict override budget checks |
