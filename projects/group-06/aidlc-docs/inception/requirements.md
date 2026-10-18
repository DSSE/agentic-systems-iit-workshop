# AIDLC Inception: Requirements Specification

**Project:** SprintBoard (Group 06)  
**Phase:** Phase 2 (Inception)  
**Status:** Defined  

---

## 1. Functional Requirements (FR)

### FR-1: Domain Model & Capacity Rule
- **FR-1.1:** Team members have a unique identifier, name, and maximum capacity limit of 8 story points.
- **FR-1.2:** Tasks have an ID, title, points, status (`backlog`, `proposed`, `assigned`), and assignee (`null` or member name).
- **FR-1.3:** The hard rule validator `validateCapacity(member, currentAssignedPoints, newPoints)` returns:
  - `{ allowed: true, newTotal: N }` if `currentAssignedPoints + newPoints <= 8`.
  - `{ allowed: false, code: "ERR_MAX_POINTS_EXCEEDED", message: "Cannot exceed 8 points. Current: X, Attempted: Y, Result: Z" }` if greater than 8.
- **FR-1.4:** Single source of truth: Validator must be imported by API, MCP server, UI, and Agent.

### FR-2: Core Tools & Tool Interface
- **FR-2.1 (`list_tasks`):** Returns all tasks and member capacities from data store.
- **FR-2.2 (`check_capacity`):** Evaluates if assigning a task (or set of tasks) to a member violates the 8-point limit without mutating state.
- **FR-2.3 (`assign_task`):** Takes member name and task ID(s).
  - Pre-requisite: Explicit approval must be present (`approved: true`).
  - Self-verification: Tool must re-execute `validateCapacity` immediately prior to writing to storage.
  - Returns updated assignment proposal or persistent state.

### FR-3: User Interface (Frontend)
- **FR-3.1:** Visual board displaying Backlog, Team Members (with current point progress bars out of 8 points), and Sprint Proposals.
- **FR-3.2:** Direct assignment controls with capacity warning indicators.
- **FR-3.3:** Clear visual distinction between "Proposed" assignments and "Committed" assignments.
- **FR-3.4:** Explicit **[Approve Proposal]** button required to persist state to `data.json`.
- **FR-3.5:** Built-in interactive AI Assistant chat drawer.

### FR-4: Model Context Protocol (MCP) Server
- **FR-4.1:** Expose standard JSON-RPC MCP server via stdio or SSE.
- **FR-4.2:** Expose tools: `list_tasks`, `check_capacity`, `assign_task`.
- **FR-4.3:** Compatible with standard coding agents: Claude Code, Gemini CLI, Antigravity, Cursor.

### FR-5: Conversational Agent & Reasoning
- **FR-5.1:** Model-agnostic LLM interface (Ollama, Gemini, Groq, OpenRouter, Claude) configured via `.env`.
- **FR-5.2:** Case 1 handling: Understand natural language task assignment requests, formulate proposals respecting <= 8 points, and prompt human for approval before saving.
- **FR-5.3:** Case 3 handling: When an assignment exceeds 8 points, refuse with `ERR_MAX_POINTS_EXCEEDED` and suggest alternative member allocations.
- **FR-5.4:** Case 4 handling: When a request is ambiguous or underspecified, ask clarifying questions instead of hallucinating or making assumptions.

### FR-6: Security & Defensive Guardrails
- **FR-6.1:** Case 5 handling: Defense against prompt injection in task titles/descriptions. Untrusted backlog strings must never override system prompts or bypass capacity rules.
- **FR-6.2:** Structural guardrails: Strict JSON schema output validation for tool calls and agent responses.

---

## 2. Non-Functional Requirements (NFR)
- **NFR-1 (Portability):** Runs cleanly on Node.js 18+ with standard ES Modules (`type: "module"`).
- **NFR-2 (Maintainability):** Zero unnecessary external libraries; modular domain layer.
- **NFR-3 (Performance):** In-memory domain validation executes in under 2ms.
- **NFR-4 (Traceability):** Every phase concludes with an updated entry in `progress.html` and audit logs in `aidlc-docs/audit.md`.
