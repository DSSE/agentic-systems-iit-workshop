---
name: phase
description: Run one CampusDesk development phase end to end - plan, implement, test, review, log in progress.html, commit. Use when the user says "start phase N", "next phase", or asks to build a part of the spec.
argument-hint: <phase number 2-8>
---

# Run phase $ARGUMENTS

Work through these steps in order. Do not skip the plan or the checks.

## 1. Plan (get the user's OK first)
- Read `specs/agent.md` (the sections for this phase, below) and the "Next" list of the last entry in `progress.html`.
- Enter plan mode. The plan lists: files to create or change, the tests you will write, the e2e checks from the `e2e` skill for this phase, and any new dependency (each one needs the user's OK).
- Wait for approval. If the spec is unclear or wrong, say so and propose a spec change; do not quietly diverge.

## 2. Implement
- Small steps. Domain and store first, then the API, then the UI.
- Write the pytest for a rule together with the code for it.
- Follow `CLAUDE.md`: rules only in `booking_rules.py`, `now` passed in, `RuleResult` for every refusal, `data.json` written only by approve.

## 3. Test
- Run `cd backend && uv run pytest` and, if the frontend changed, `cd frontend && npm run lint && npm run build`.
- Run the e2e checks for this phase (the `e2e` skill). Use the `e2e-tester` agent so the logs stay out of the main context.
- Fix failures in the code. Never weaken or delete a test to make it pass.

## 4. Review
- Run the `rule-guardian` agent on `git diff` and fix what it confirms.

## 5. Log and commit
- Add an `<article>` to `progress.html` (copy the Phase 1 one: Done, Decisions, Next, with today's date) and mark the phase `class="done"` in the list at the top.
- Commit on a `group-9/<short-name>` work branch cut from `group-9/feature` (never on the feature branch or `main`). Do not push; `/ship` does that after the user reviews.

## Phases

| # | Scope (spec sections) | Done when |
|---|---|---|
| 2 | Data model, Domain module, Tools, REST API, Frontend panels 1-3 | Backend and UI run; form can check, propose, approve |
| 3 | Test matrix cases 1-3 in pytest; `backend/e2e/run.sh` for REST | Cases 1-3 work in the UI and all tests pass (Milestone 1) |
| 4 | MCP server; connect two agents (Claude Code + one more) | Both agents list the 3 tools and create a proposal that shows in the UI |
| 5 | Agent, prompt `v1`, `/api/chat`, Chat panel | Case 1 works from chat; case 4 gets a question back (Milestone 2) |
| 6 | Evals, prompt `v2`, `backend/evals/results.md` (optional) | All 5 cases run against v1 and v2 with a pass/fail table |
| 7 | Guardrails table (optional) | Case 5 is blocked from UI, curl, chat and an external MCP client |
| 8 | Demo script in README, final progress entry | The 5 demo cases run cleanly from a fresh `data.json` |
