# CampusDesk harness

Start either coding agent from this project folder:

```bash
cd projects/group-5
codex
# or
claude
```

## Structure

```text
group-5/
├── AGENTS.md                         Shared instructions; Codex entry point
├── CLAUDE.md                         Claude entry point; imports AGENTS.md
├── PLANS.md                          Delivery phases and completion criteria
├── progress.html                     Dated phase evidence
├── specs/agent.md                     Booking contract and acceptance criteria
├── .codex/
│   ├── config.toml                   Project sandbox and approval defaults
│   └── skills/
│       ├── campusdesk-build/SKILL.md  Implementation workflow
│       └── campusdesk-verify/SKILL.md Behavior verification workflow
├── .agents/skills/
│   ├── campusdesk-build -> ../../.codex/skills/campusdesk-build
│   └── campusdesk-verify -> ../../.codex/skills/campusdesk-verify
├── .claude/
│   ├── settings.json                 Existing Claude tool permissions
│   └── skills/
│       ├── campusdesk-build -> ../../.codex/skills/campusdesk-build
│       └── campusdesk-verify -> ../../.codex/skills/campusdesk-verify
└── .mcp.json                         Existing Claude Context7 connection
```

The skills have one maintained source in `.codex/skills/`. Codex discovers them
through `.agents/skills/`; Claude discovers them through `.claude/skills/`.
Preserve Git symlinks when cloning. If a checkout does not support symlinks,
enable symlink support or copy each target folder to its discovery location and
keep those copies synchronized. No global installation is required.

## Usage

| Task | Codex | Claude Code |
|---|---|---|
| Implement an authorized feature | `$campusdesk-build` | `/campusdesk-build` |
| Check booking behavior | `$campusdesk-verify` | `/campusdesk-verify` |

For example: “Use campusdesk-build to implement Phase 2 of PLANS.md.” Skills
may also be selected automatically when a request matches their description.
Restart the agent from this directory if newly added skills do not appear.

Codex loads project configuration only for trusted projects. Its defaults here
use workspace writes, on-request approvals, and no sandbox network access;
machine and organization policies still apply. These are coding-agent settings:
the application's booking approval must be implemented separately. Project
instructions guide scope; they do not enforce group filesystem boundaries.

Claude retains its existing permission settings. No hooks, extra agent roles,
or automated shell actions are installed. End-of-phase verification and progress
recording are defined in shared guidance and skills. The existing `.mcp.json`
is a documentation connection, not the future CampusDesk booking MCP server;
Codex MCP servers require their own configuration when needed.

The app is not implemented yet, so `npm start` and `npm test` remain planned.
Only the harness phase is complete.

## Conventions checked

- [Codex skills and symlink discovery](https://learn.chatgpt.com/docs/build-skills)
- [Codex project configuration](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
