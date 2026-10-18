// Used by POST /api/chat: one MCP connection per message, then close.
import { createLLM } from './llm.js';
import { connectMcp } from './mcp-client.js';
import { runAgent } from './agent.js';
import { createStore } from '../domain/store.js';
import { extractPlanningInputs, isPlanningRequest, planningQuestion } from './planning-inputs.js';

export async function chatOnce(message, history = [], dependencies = {}) {
  // A person can set the event budget and capacity in chat. The domain store
  // applies the budget before the agent or any MCP client can propose expenses.
  const store = dependencies.store ?? createStore();
  const state = store.getState();
  const supplied = extractPlanningInputs(message, history);
  if (state.planning_inputs_set && (supplied.budget != null || supplied.capacity != null)) {
    const configured = store.setPlanningInputs({
      budget: supplied.budget ?? state['cap'],
      capacity: supplied.capacity ?? state.event.expected_attendees,
    });
    if (!configured.ok) {
      return { reply: configured.message, events: [], promptVersion: process.env.PROMPT_VERSION || 'v2', model: 'not called' };
    }
  } else if (!state.planning_inputs_set && supplied.budget != null && supplied.capacity != null) {
    const configured = store.setPlanningInputs(supplied);
    if (!configured.ok) {
      return { reply: configured.message, events: [], promptVersion: process.env.PROMPT_VERSION || 'v2', model: 'not called' };
    }
  }

  const configuredState = store.getState();
  const needsDetails = isPlanningRequest(message) && !configuredState.planning_inputs_set
    && planningQuestion(extractPlanningInputs(message, history));
  // The app can ask for missing event details without an API call or an API key.
  const llm = dependencies.llm ?? (needsDetails ? { name: 'not called' } : createLLM());
  const mcp = await (dependencies.connect ?? connectMcp)();
  try {
    const clean = history.filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string');
    return { ...(await runAgent({ llm, mcp, history: clean, message })), model: llm.name };
  } finally {
    await mcp.close();
  }
}
