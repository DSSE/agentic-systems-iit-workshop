# AIDLC Inception: Application Architecture & Technical Design

**Project:** SprintBoard (Group 06)  
**Phase:** Phase 2 (Inception)  
**Status:** Defined  

---

## 1. System Architecture Overview

```
                                +---------------------------+
                                |      Human Operator       |
                                +-------------+-------------+
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
       +------------------------------+               +-------------------------------+
       |      Frontend Web App        |               |    External Coding Agents     |
       | (Vanilla CSS, Modern UI,     |               | (Claude Code, Gemini, Cursor) |
       |  Approval Button, Chat Panel)|               +---------------+---------------+
       +--------------+---------------+                               │
                      │                                               ▼
                      │ REST API                      +-------------------------------+
                      ▼                               |       MCP Server (Stdio)      |
       +------------------------------+               |  `src/mcp/server.js`          |
       |         HTTP Server          |               +---------------+---------------+
       |       `src/server.js`        |                               │
       +--------------+---------------+                               │
                      │                                               │
                      ▼                                               │
       +------------------------------+                               │
       |      In-App AI Agent         |                               │
       |       `src/agent.js`         |                               │
       |   (Any LLM via OpenAI API)   |                               │
       +--------------+---------------+                               │
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                              +-------------------------------+
                              |    Core Tools Layer           |
                              |    `src/tools.js`             |
                              |    - `list_tasks`             |
                              |    - `check_capacity`         |
                              |    - `assign_task`            |
                              +---------------+---------------+
                                              │
                                              ▼
                              +-------------------------------+
                              |    Shared Domain Logic        |
                              |    `src/domain/rules.js`      |
                              |    - 8 Story Points Hard Rule |
                              |    - `ERR_MAX_POINTS_EXCEEDED`|
                              +---------------+---------------+
                                              │
                                              ▼
                              +-------------------------------+
                              |     Persistence Layer         |
                              |     `src/domain/storage.js`   |
                              |     - Atomic save to          |
                              |       `data.json` on Approve  |
                              +-------------------------------+
```

---

## 2. Shared Domain Module: `src/domain/rules.js`
The central invariant is enforced here:
```javascript
export const MAX_POINTS_PER_MEMBER = 8;
export const RULE_ERROR_CODE = "ERR_MAX_POINTS_EXCEEDED";

export function checkMemberCapacity(member, currentAssignedPoints, newPoints) {
  const projectedTotal = currentAssignedPoints + newPoints;
  if (projectedTotal > MAX_POINTS_PER_MEMBER) {
    return {
      allowed: false,
      code: RULE_ERROR_CODE,
      currentPoints: currentAssignedPoints,
      attemptedPoints: newPoints,
      projectedTotal,
      maxAllowed: MAX_POINTS_PER_MEMBER,
      message: `Hard rule violation: Member "${member.name}" would have ${projectedTotal} points (max: ${MAX_POINTS_PER_MEMBER}).`
    };
  }
  return {
    allowed: true,
    currentPoints: currentAssignedPoints,
    attemptedPoints: newPoints,
    projectedTotal,
    maxAllowed: MAX_POINTS_PER_MEMBER
  };
}
```

---

## 3. Storage Layer: `src/domain/storage.js`
- Reads from `data.json`.
- Writes only happen when an explicit approval payload (`{ approved: true }`) is passed to `assignTask()`.
- Re-verifies `checkMemberCapacity` right before writing to disk.

---

## 4. MCP Server: `src/mcp/server.js`
Implements standard Model Context Protocol:
- Tool 1: `list_tasks`
- Tool 2: `check_capacity`
- Tool 3: `assign_task` (returns proposal requiring user confirmation, or executes write if confirmed)

---

## 5. Model-Agnostic Agent: `src/agent.js`
Uses standard OpenAI-compatible completions/chat endpoint:
- Configured via `.env`:
  - `LLM_BASE_URL` (Ollama, Gemini, Groq, OpenRouter)
  - `LLM_API_KEY`
  - `LLM_MODEL`
- Implements system prompt with:
  1. Capacity rule awareness.
  2. Clarification trigger on ambiguous prompts (Case 4).
  3. Rejection + suggestion pattern when rule is violated (Case 3).
  4. Isolation of untrusted task inputs (Case 5).
