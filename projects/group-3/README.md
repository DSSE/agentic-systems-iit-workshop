# ClubOps (Group 3)

Plans a club event's expenses. **Hard rule: total spending never goes over the budget cap.**
Nothing is saved until a person presses Approve.

Group: 3

## Team members and contact numbers
- Md. Mostafizur Rahaman — `+8801517809545`
- Salsabila Zaman — `1673841610`
- A. M. ZAYED ABDULLAH — `+8801671050992`
- Mrinmoy Poit — `01751285949`

## Run the app and chat agent

Use Node.js 20 or newer. The mock model runs locally and needs no API key.

### Windows PowerShell

Run these commands from this folder (the one containing `package.json`):

```powershell
npm install
Copy-Item .env.example .env
npm run reset
npm run verify
npm start
```

Open http://localhost:3000. The chat panel is already connected to the agent. In a second terminal, from this same folder, try the terminal agent:

```powershell
npm run agent -- "Plan snacks and a speaker for Friday's seminar. Budget 30000 BDT, capacity 40 people."
```

If you omit either value, the assistant asks for it before planning. You can give both in your first message or answer its question. The agent loads the vendor catalog first, then uses the budget and capacity you provide. The app saves those event settings, and the domain rule checks every proposal against that budget. Its proposals appear in the app; only clicking **Approve** saves an expense.

### macOS / Linux

```bash
npm install
cp .env.example .env
npm run reset
npm run verify
npm start
```

### Use OpenRouter Grok in the app

To use Grok through OpenRouter, create an API key at [OpenRouter](https://openrouter.ai/settings/keys), then put the key in `.env` and use these settings:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=paste_your_openrouter_key_here
LLM_MODEL=x-ai/grok-4.7
LLM_MAX_TOKENS=2048
```

`LLM_MAX_TOKENS` caps the size of each generated reply; 2048 keeps requests within modest OpenRouter credit limits. Increase it only if needed and your key has enough credits. Restart `npm start` after changing `.env`. Keep the key in `.env`; do not paste it into chat or commit it. OpenRouter API usage may be billed separately from any Gemini subscription.

### Use OpenCode with OpenRouter Grok and ClubOps MCP

The included `opencode.json` selects Grok 4.7 through OpenRouter and starts this project's local `clubops` MCP server. From this project folder, run `opencode`, enter `/connect`, choose OpenRouter, and enter your OpenRouter API key. OpenCode stores its own credential separately from the app's `.env`. Then run `/models` if you need to choose the configured model. The MCP server exposes the three ClubOps planning tools; it cannot approve proposals.

To run the evals, use a real model if you want to compare prompt behavior; the mock run checks the tool flow and safety cases only:

```powershell
npm run evals
npm run evals:compare
```

## Connect a coding-agent MCP client

The MCP server is local stdio and needs no separate API key. Run each client from this project folder so it finds the project configuration. It exposes exactly `list_vendors`, `check_budget`, and `add_expense`; there is no approval tool.

- **Claude Code:** `.mcp.json` is already included. Run `claude` in this folder and approve the project MCP server if prompted; enter `/mcp` to check the connection.
- **Gemini CLI:** `.gemini/settings.json` is already included. Run `gemini` in this folder, then `/mcp` to inspect the tools.
- **Cursor:** `.cursor/mcp.json` is already included. Open this folder in Cursor and enable the `clubops` server in MCP settings.
- **Codex CLI:** register it once with the full server path (quotes are needed because this workspace path contains spaces):

  ```powershell
  codex mcp add clubops -- node "E:\Agentic Workshop\agentic-systems-iit-workshop\projects\group-3\src\mcp\server.js"
  codex mcp list
  ```

  Then start Codex in this project folder. If Codex already has a `clubops` entry, list it first and remove the old entry with `codex mcp remove clubops` before adding it again.

For any client, set the event budget and capacity in the app chat first, then try: “Using the clubops tools, plan snacks and a speaker for Friday's seminar.” Refresh the app and review the proposals. A coding agent also needs its own sign-in or subscription; that is separate from the `LLM_API_KEY` used by this app's chat agent.

## What is in here
| Part | Where |
|---|---|
| The hard rule (one home) | `src/domain/budget.js` |
| Injection guardrail | `src/domain/guardrails.js` |
| Data access, proposals, approve | `src/domain/store.js` |
| API and UI | `src/api/`, `public/` |
| MCP server (3 tools, no approve tool) | `src/mcp/server.js` |
| Agent (any OpenAI-compatible model) | `src/agent/` |
| Spec | `specs/agent.md` |
| Tests and evals | `tests/`, `evals/` |
| Harness for coding agents | `CLAUDE.md`, `AGENTS.md`, `.claude/`, `feature_list.json` |
| Progress log | `progress.html` |
