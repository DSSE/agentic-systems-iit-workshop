// The agent harness: the loop between an LLM (any OpenAI-compatible API,
// Ollama by default) and the ClubOps MCP tools.
//
//   user -> LLM -> tool calls -> [guardrails] -> MCP server -> domain -> results -> LLM -> ... -> reply
//
// add_expense only creates proposals. Saving happens outside the agent: the
// person clicks Approve in the UI (or answers y in the terminal). The agent
// has no tool that saves.

import { chat as llmChat, toOpenAITools } from "./llm.js";
import { systemPrompt, DEFAULT_PROMPT } from "./prompts.js";
import * as guard from "./guardrails.js";

/** Small models sometimes write a tool call as JSON text. Recover it, only for known tools. */
export function recoverToolCalls(content, toolNames) {
  if (!content) return [];
  const text = content.replace(/```(?:json)?/g, "").replace(/<\/?tool_call>/g, "").trim();
  if (!/^[[{]/.test(text)) return [];
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const calls = list
      .map((c) => ({ name: c.name || c.function?.name, args: c.arguments ?? c.parameters ?? c.function?.arguments ?? {} }))
      .filter((c) => toolNames.includes(c.name));
    if (calls.length !== list.length) return [];
    return calls.map((c, i) => ({
      id: `recovered_${Date.now()}_${i}`,
      type: "function",
      function: { name: c.name, arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args) },
    }));
  } catch {
    return [];
  }
}

export class Harness {
  /**
   * @param {object} o
   * @param {import('../mcp/client.js').McpClient} o.mcp  connected MCP client
   * @param {string} o.model
   * @param {string} [o.promptVersion]  "v1" | "v2"
   * @param {Function} [o.chat]          swap in a fake for tests/evals
   */
  constructor({ mcp, model, promptVersion = process.env.PROMPT_VERSION || DEFAULT_PROMPT, chat = llmChat }) {
    Object.assign(this, { mcp, model, promptVersion, chat });
    this.tools = mcp.tools;
    this.openaiTools = toOpenAITools(this.tools);
    this.messages = [];
  }

  reset() {
    this.messages = [];
  }

  /**
   * Handle one user message. Returns the final reply text.
   * onEvent receives: thinking, tool_call, tool_result, proposal, guardrail, assistant, error.
   */
  async run(userText, { onEvent = () => {} } = {}) {
    const status = await this.mcp.callTool("check_budget", {});
    const system = { role: "system", content: systemPrompt(this.promptVersion, status) };
    if (!this.messages.length) this.messages.push(system);
    else this.messages[0] = system; // fresh budget numbers every turn
    this.messages.push({ role: "user", content: userText });

    const names = this.tools.map((t) => t.name);
    const seen = new Map();
    let proposals = 0;

    for (let step = 1; step <= guard.MAX_STEPS; step++) {
      onEvent({ type: "thinking", step });
      let msg;
      try {
        msg = await this.chat({ model: this.model, messages: this.messages, tools: this.openaiTools });
      } catch (err) {
        this.messages.pop();
        onEvent({ type: "error", message: err.message });
        throw err;
      }

      const native = msg.tool_calls?.length ? msg.tool_calls : [];
      const calls = native.length ? native : recoverToolCalls(msg.content, names);
      calls.forEach((c, i) => (c.id ||= `call_${Date.now()}_${i}`));

      if (!calls.length) {
        const text = guard.checkReply((msg.content || "").trim() || "(no reply)");
        this.messages.push({ role: "assistant", content: text });
        onEvent({ type: "assistant", text });
        return text;
      }

      this.messages.push({
        role: "assistant",
        content: native.length ? msg.content || "" : "",
        tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.function.name, arguments: typeof c.function.arguments === "string" ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}) } })),
      });

      for (const call of calls) {
        const name = call.function?.name;
        let args = call.function?.arguments ?? {};
        if (typeof args === "string") {
          try {
            args = args.trim() ? JSON.parse(args) : {};
          } catch {
            args = {};
          }
        }
        onEvent({ type: "tool_call", name, args });

        let result;
        const key = name + JSON.stringify(args);
        seen.set(key, (seen.get(key) || 0) + 1);

        if (!names.includes(name)) {
          result = { ok: false, code: "UNKNOWN_TOOL", message: `Unknown tool "${name}". Use: ${names.join(", ")}.` };
        } else if (seen.get(key) >= 3) {
          result = { ok: false, code: "LOOP_GUARD", message: "Same call repeated 3 times. Stop and answer the user." };
          onEvent({ type: "guardrail", rule: "loop", message: result.message });
        } else if (name === "add_expense" && guard.enabled() && proposals >= guard.MAX_PROPOSALS_PER_TURN) {
          result = { ok: false, code: "PROPOSAL_LIMIT", message: `At most ${guard.MAX_PROPOSALS_PER_TURN} proposals per message. Ask the user before adding more.` };
          onEvent({ type: "guardrail", rule: "proposal_limit", message: result.message });
        } else {
          try {
            result = await this.mcp.callTool(name, args);
          } catch (err) {
            result = { ok: false, code: "TOOL_ERROR", message: err.message };
          }
          if (name === "add_expense" && result?.ok) {
            proposals++;
            onEvent({ type: "proposal", proposal: result.proposal, status: result.status });
          }
        }

        let forModel = result;
        if (guard.enabled()) {
          const found = [];
          forModel = guard.scrubToolResult(result, found);
          if (found.length) onEvent({ type: "guardrail", rule: "injection", message: `Removed instruction-like text from ${name} result`, removed: found });
        }
        onEvent({ type: "tool_result", name, result });
        this.messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(forModel) });
      }

      const looped = [...seen.values()].some((n) => n >= 3);
      if (looped) {
        const text = "I kept repeating the same step, so I stopped. Could you rephrase?";
        this.messages.push({ role: "assistant", content: text });
        onEvent({ type: "assistant", text });
        return text;
      }
    }

    const text = `I stopped after ${guard.MAX_STEPS} steps without finishing. Please give me more detail.`;
    this.messages.push({ role: "assistant", content: text });
    onEvent({ type: "assistant", text });
    return text;
  }
}
