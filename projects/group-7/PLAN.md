# ClubOps implementation plan

| Phase | Status | Notes |
|---|---|---|
| 1. Harness/specification | complete | Existing `specs/agent.md`, fixtures, tests, and docs retained; Python contract added. |
| 2. Backend/frontend | in progress | Added FastAPI/SQLite backend and React/TypeScript scaffold alongside the verified Node app. |
| 3. Behavior tests | in progress | Node suite passes; Python dependency installation and API tests remain to run. |
| 4. MCP integrations | in progress | Python stdio adapter added; external second-client connection is not verified here. |
| 5. Chat agent | complete (existing path) | Existing UI agent uses Ollama `qwen2.5:7b` through MCP. |
| 6. Evaluations | complete (existing path) | Existing deterministic harness and five-case live evaluator retained. |
| 7. Guardrails | complete (existing path) | Existing domain, harness, sanitiser, cap, and approval guardrails retained. |
| 8. Demo | in progress | Node demo is runnable now; Python/React demo requires dependency install. |

## Decisions

- Preserve the tested zero-dependency Node workshop path.
- Add the requested Python/FastAPI/SQLite and React/TypeScript path without silently
  replacing or migrating the existing `data.json`.
- Pin dependencies in `requirements.txt` and `frontend/package.json`.
