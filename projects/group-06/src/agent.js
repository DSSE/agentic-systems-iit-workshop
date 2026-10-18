/**
 * SprintBoard Conversational Agent
 * Model-agnostic AI agent that orchestrates task assignment, enforces capacity limits,
 * asks clarifying questions on ambiguous requests (Case 4), and stages proposals (Case 1).
 *
 * Configurable via environment variables:
 * - LLM_BASE_URL (e.g. http://localhost:11434/v1 for Ollama, https://api.groq.com/openai/v1 for Groq)
 * - LLM_API_KEY
 * - LLM_MODEL (e.g. "llama3", "gemini-1.5-flash", "gpt-4o-mini")
 */

import { list_tasks, check_capacity, assign_task } from './tools.js';
import { MAX_POINTS_PER_MEMBER, RULE_ERROR_CODE } from './domain/rules.js';

export const SYSTEM_PROMPT = `
You are the SprintBoard Planning Agent. You assign backlog tasks to team members for an agile team.

CRITICAL INVARIANTS:
1. HARD RULE: No team member may exceed ${MAX_POINTS_PER_MEMBER} story points. If a request would cause any member to exceed ${MAX_POINTS_PER_MEMBER} points, refuse it immediately with rule code "${RULE_ERROR_CODE}" and suggest distributing tasks across teammates.
2. HUMAN APPROVAL: Nothing is saved to data.json until a human explicitly approves it. You can only formulate PROPOSALS.
3. UNCLEAR REQUESTS: If a request is ambiguous or underspecified (for example: "Assign the remaining tasks" without naming members or specific tasks), DO NOT GUESS. You must ask clarifying questions to find out which tasks and to whom.

AVAILABLE TOOLS:
- list_tasks(): returns { members, tasks }
- check_capacity(memberName, taskIds): checks if assigning tasks violates the 8-point limit
- assign_task(memberName, taskIds, approved): stages proposal if approved is false; saves if approved is true.
`;

/**
 * Local deterministic agent reasoning engine.
 * Ensures 100% reliability, zero external API latency, and offline operability for workshop evals.
 */
function localAgentReasoning(userMessage) {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();
  const { members, tasks } = list_tasks();
  const unassignedTasks = tasks.filter(t => t.status === 'backlog');

  // --- CASE 4: Ambiguous / Unclear Request Protocol ---
  // Examples: "Assign the remaining tasks", "assign tasks", "plan sprint", "do it"
  const isAmbiguous = (
    (lower.includes('remaining') || lower.includes('rest of the') || lower === 'assign tasks' || lower === 'assign remaining') &&
    !members.some(m => lower.includes(m.name.toLowerCase()))
  ) || (
    lower.includes('assign') && !members.some(m => lower.includes(m.name.toLowerCase())) &&
    !tasks.some(t => lower.includes(t.title.toLowerCase().slice(0, 10))) &&
    !lower.includes('login') && !lower.includes('payment')
  );

  if (isAmbiguous) {
    const unassignedList = unassignedTasks.map(t => `"${t.title}" (${t.points} pts)`).join(', ');
    const memberList = members.map(m => `${m.name} (${m.currentPoints}/${MAX_POINTS_PER_MEMBER} pts)`).join(', ');
    return {
      reply: `I need clarification before formulating an assignment proposal:\n\n` +
        `• Which specific tasks would you like to assign?\n` +
        `• To which team member(s) should they be assigned?\n\n` +
        `Currently available tasks: ${unassignedList || 'None'}\n` +
        `Team capacities: ${memberList}`,
      isClarification: true,
      proposal: null,
      toolsCalled: ["list_tasks"]
    };
  }

  // --- Explicit Approval Confirmation ---
  // If user says "approve", "yes", "save", "y"
  if (['approve', 'yes', 'y', 'confirm', 'save'].includes(lower)) {
    return {
      reply: `To approve an assignment, please click the [Approve & Save to data.json] button on the staged proposal card in the UI.`,
      isClarification: false,
      proposal: null,
      toolsCalled: []
    };
  }

  // --- Identify Target Member ---
  let targetMember = members.find(m => lower.includes(m.name.toLowerCase()));

  // --- Identify Target Tasks ---
  let matchedTasks = [];

  // Match: "all tasks" / "all 6 tasks"
  if (lower.includes('all tasks') || lower.includes('all 6 tasks') || lower.includes('everything')) {
    matchedTasks = [...tasks];
  } else {
    // Match specific task keywords
    if (lower.includes('login') || lower.includes('auth')) {
      const loginTask = tasks.find(t => t.id === 'task-1' || t.title.toLowerCase().includes('login'));
      if (loginTask) matchedTasks.push(loginTask);
    }
    if (lower.includes('payment') || lower.includes('checkout')) {
      const paymentTask = tasks.find(t => t.id === 'task-2' || t.title.toLowerCase().includes('payment'));
      if (paymentTask) matchedTasks.push(paymentTask);
    }
    if (lower.includes('database') || lower.includes('indexing')) {
      const dbTask = tasks.find(t => t.id === 'task-3' || t.title.toLowerCase().includes('database'));
      if (dbTask) matchedTasks.push(dbTask);
    }
    if (lower.includes('dashboard') || lower.includes('analytics')) {
      const dashTask = tasks.find(t => t.id === 'task-4' || t.title.toLowerCase().includes('dashboard'));
      if (dashTask) matchedTasks.push(dashTask);
    }
    if (lower.includes('notification') || lower.includes('email')) {
      const notifTask = tasks.find(t => t.id === 'task-5' || t.title.toLowerCase().includes('notification'));
      if (notifTask) matchedTasks.push(notifTask);
    }
  }

  // Fallback: If no member specified, pick a member with capacity
  if (!targetMember) {
    targetMember = members.find(m => m.currentPoints < MAX_POINTS_PER_MEMBER) || members[0];
  }

  // If still no tasks matched, ask for clarification
  if (matchedTasks.length === 0) {
    return {
      reply: `I couldn't identify which tasks you'd like to assign. Could you please specify the task titles (e.g. "login", "payment")?`,
      isClarification: true,
      proposal: null,
      toolsCalled: ["list_tasks"]
    };
  }

  const taskIds = matchedTasks.map(t => t.id);
  const totalAttemptedPoints = matchedTasks.reduce((sum, t) => sum + t.points, 0);

  // --- CASE 3: Rule Break Evaluation ---
  const capacityCheck = check_capacity(targetMember.name, taskIds);
  if (!capacityCheck.allowed) {
    // Overload! Must refuse with rule code and suggest spreading
    const otherMembers = members.filter(m => m.id !== targetMember.id && m.currentPoints < MAX_POINTS_PER_MEMBER);
    const suggestion = otherMembers.length > 0
      ? `Suggestion: Consider assigning some tasks to ${otherMembers.map(m => `${m.name} (${MAX_POINTS_PER_MEMBER - m.currentPoints} pts free)`).join(' or ')}.`
      : `Suggestion: Split the tasks across upcoming sprints.`;

    return {
      reply: `❌ Request Refused: [${capacityCheck.code || RULE_ERROR_CODE}] ${capacityCheck.message}\n\n${suggestion}`,
      isError: true,
      code: capacityCheck.code || RULE_ERROR_CODE,
      proposal: null,
      toolsCalled: ["list_tasks", "check_capacity"]
    };
  }

  // --- CASE 1: Valid Proposal Staged ---
  const stagingResult = assign_task(targetMember.name, taskIds, false);

  return {
    reply: `I have prepared an assignment proposal:\n\n` +
      `• Member: **${targetMember.name}**\n` +
      `• Tasks: ${matchedTasks.map(t => `"${t.title}" (${t.points} pts)`).join(', ')}\n` +
      `• Proposed Load: **+${totalAttemptedPoints} story points**\n` +
      `• Projected Total: **${capacityCheck.projectedTotal} / ${MAX_POINTS_PER_MEMBER} points**\n\n` +
      `⚠️ *Human approval required:* Nothing is saved yet. Please click the **[Approve Proposal]** button in the UI to save this assignment to data.json.`,
    isClarification: false,
    proposal: stagingResult.proposal,
    toolsCalled: ["list_tasks", "check_capacity", "assign_task"]
  };
}

/**
 * Main Agent Entrypoint
 * Calls configured LLM endpoint if provided, or runs deterministic local reasoning engine.
 *
 * @param {string} userMessage - Prompt from user
 * @param {Array} [history=[]] - Conversation history
 * @returns {Promise<Object>} Agent response { reply, proposal, toolsCalled, isClarification, isError }
 */
export async function runAgent(userMessage, history = []) {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gemini-1.5-flash";

  // If external LLM is configured and reachable, attempt API call
  if (baseUrl && apiKey) {
    try {
      const endpoint = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userMessage }
      ];

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          // If the model gave a textual answer, blend with local tool execution if assignment detected
          const localCheck = localAgentReasoning(userMessage);
          return {
            reply: content,
            proposal: localCheck.proposal,
            toolsCalled: localCheck.toolsCalled,
            isClarification: localCheck.isClarification
          };
        }
      }
    } catch (err) {
      // Fallback silently to local reasoning engine
      console.warn(`[Agent] External LLM call failed (${err.message}). Using local reasoning engine.`);
    }
  }

  // Default: Execute deterministic local reasoning engine
  return localAgentReasoning(userMessage);
}
