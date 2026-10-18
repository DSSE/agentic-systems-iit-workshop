// Used by POST /api/chat: one MCP connection per message, then close.
import { createLLM } from './llm.js';
import { connectMcp } from './mcp-client.js';
import { runAgent } from './agent.js';

export async function runTwoAgents({ llm, reviewerLlm = llm, mcp, message, history = [] }) {
  const clean = history.filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string');
  const planner = await runAgent({ llm, mcp, history: clean, message });
  // The reviewer gets a fresh MCP budget snapshot and can only inspect. It
  // never receives add_expense, so only the planner can create proposals.
  const budgetSnapshot = await mcp.call('check_budget', { amount: 0 });
  let review = 'Budget review complete. Proposals remain subject to your approval.';
  try {
    const reviewer = await reviewerLlm.chat({ messages: [
      { role: 'system', content: 'You are the ClubOps budget reviewer. Independently review the planner result and MCP budget snapshot. Confirm only facts supported by the tool output, flag refusals by their exact rule code, and remind the treasurer that proposals need human approval. Do not suggest bypasses or claim anything was approved. Keep the review to one short sentence.' },
      { role: 'user', content: JSON.stringify({ request: message, planner_reply: planner.reply, planner_tool_events: planner.events, current_budget: budgetSnapshot }) },
    ] });
    review = reviewer.content || review;
  } catch {
    review = 'Budget reviewer is unavailable right now. Please review the proposal amounts carefully before approving.';
  }
  return { ...planner, review, agents: ['Expense planner', 'Budget reviewer'], model: llm.name };
}

export async function chatOnce(message, history = []) {
  const llm = createLLM();
  const reviewerKey = process.env.GEMINI_API_KEY_REVIEWER;
  const reviewerLlm = reviewerKey ? createLLM({ ...process.env, LLM_API_KEY: reviewerKey }) : llm;
  const mcp = await connectMcp();
  try {
    return await runTwoAgents({ llm, reviewerLlm, mcp, message, history });
  } finally {
    await mcp.close();
  }
}
