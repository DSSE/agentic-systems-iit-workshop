import { systemPrompt } from "./prompts.js";
import { AgentError } from "./model.js";
import { unpackToolResult } from "../mcp.js";

const ALLOWED_TOOLS = new Set(["list_rooms", "check_availability"]);
export async function runAgent({ client, complete, history = [], message, version = "v2", now, agentName }) {
  const advertised = (await client.listTools()).tools.filter((tool) => ALLOWED_TOOLS.has(tool.name));
  const tools = advertised.map((tool) => ({ type: "function", function: {
    name: tool.name, description: tool.description, parameters: tool.inputSchema,
  } }));
  const messages = [{ role: "system", content: systemPrompt(version, { now, agentName }) }, ...history,
    { role: "user", content: message }];
  const trace = [];
  let proposal = null;
  // Both rounds and total calls are bounded; a looping model cannot run forever.
  for (let round = 0; round < 6; round++) {
    const answer = await complete({ messages, tools });
    messages.push(answer);
    if (!answer.tool_calls?.length) {
      if (typeof answer.content !== "string" || !answer.content.trim()) {
        throw new AgentError("MODEL_INVALID_RESPONSE", "The assistant returned an empty answer. Please try again.");
      }
      return { text: answer.content.slice(0, 8000), proposal, trace,
        history: messages.slice(1) };
    }
    if (answer.tool_calls.length > 4 || trace.length + answer.tool_calls.length > 10) break;
    for (const call of answer.tool_calls) {
      if (!call.id || call.type !== "function" || !ALLOWED_TOOLS.has(call.function?.name)) {
        throw new AgentError("AGENT_POLICY_BLOCKED", "The assistant attempted an unauthorized action. No booking was created. Please use the request form.", 400);
      }
      let input;
      try { input = JSON.parse(call.function.arguments); }
      catch { throw new AgentError("MODEL_INVALID_RESPONSE", "The assistant supplied invalid tool input. Please rephrase your request."); }
      const response = unpackToolResult(await client.callTool({ name: call.function.name, arguments: input }));
      trace.push({ tool: call.function.name, ...(response.error ? { code: response.error.code } : { ok: true }) });
      if (call.function.name === "check_availability") proposal = response.proposal || null;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(response) });
    }
  }
  throw new AgentError("AGENT_STEP_LIMIT", "The assistant could not finish within its tool limit. Please narrow your request or use the form.");
}
