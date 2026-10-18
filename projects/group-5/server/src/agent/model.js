import { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_TIMEOUT_MS } from "../config.js";

export class AgentError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function createCompletion({ baseUrl = LLM_BASE_URL, apiKey = LLM_API_KEY, model = LLM_MODEL,
  fetchImpl = fetch, timeoutMs = LLM_TIMEOUT_MS } = {}) {
  return async ({ messages, tools }) => {
    if (!apiKey || !model || !baseUrl) {
      throw new AgentError("MODEL_NOT_CONFIGURED", "Chat is not configured yet. Ask the project owner to set the server's model API key. You can still use the request form.", 503);
    }
    let response;
    try {
      response = await fetchImpl(new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify({ model, messages,
          ...(tools?.length ? { tools, tool_choice: "auto" } : {}), temperature: 0.2 }),
      });
    } catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw new AgentError("MODEL_TIMEOUT", "The assistant took too long to respond. Please try again or use the request form.", 504);
      }
      throw new AgentError("MODEL_UNAVAILABLE", "The assistant could not reach the model. Please try again or use the request form.");
    }
    // Provider response bodies can include sensitive details; never echo them.
    if (!response.ok) {
      const failures = {
        401: ["MODEL_AUTHENTICATION_FAILED", "The model rejected the API key. Ask the project owner to check the server configuration."],
        403: ["MODEL_ACCESS_DENIED", "The model provider denied access. Ask the project owner to check the key's permissions."],
        404: ["MODEL_NOT_FOUND", "The configured model is unavailable for this key. Ask the project owner to select an accessible model."],
        429: ["MODEL_RATE_LIMIT", "The model is busy or out of quota. Please retry later; the request form still works."],
        408: ["MODEL_TIMEOUT", "The assistant took too long to respond. Please try again or use the request form."],
        504: ["MODEL_TIMEOUT", "The assistant took too long to respond. Please try again or use the request form."],
      };
      const [code, message] = failures[response.status] || ["MODEL_UNAVAILABLE", "The model request failed. Check the server's model configuration, or use the request form."];
      throw new AgentError(code, message, [408, 504].includes(response.status) ? 504 : response.status === 429 ? 429 : response.status === 403 ? 503 : 502);
    }
    let data;
    try { data = await response.json(); } catch { throw new AgentError("MODEL_INVALID_RESPONSE", "The model returned an unreadable response. Please try again."); }
    const message = data.choices?.[0]?.message;
    if (!message || message.role !== "assistant" || (!message.content && !message.tool_calls?.length)) {
      throw new AgentError("MODEL_INVALID_RESPONSE", "The model returned no usable answer. Please try again.");
    }
    // Preserve provider metadata and function-call signatures
    // on assistant tool calls when sending the next round of messages.
    return message;
  };
}
