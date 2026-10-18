import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadConfig() {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

// Only these fixed, credential-free messages may cross the provider/UI boundary.
export class ModelError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

async function providerError(response) {
  const body = await response.json().catch(() => ({}));
  const message = typeof body.error?.message === 'string' ? body.error.message : '';
  const status = response.status;
  if ([401, 403].includes(status) || (status === 400 && /api.?key.*(?:invalid|expired|blocked|not valid)|API_KEY_INVALID/i.test(message))) {
    return new ModelError('MODEL_AUTH_ERROR', 'The provider rejected API access. Check LLM_API_KEY and its API restrictions or project permissions, then restart the app.', status);
  }
  if (status === 404) return new ModelError('MODEL_NOT_FOUND', 'The model or endpoint was not found. Check LLM_MODEL availability for your key and LLM_BASE_URL; do not append /chat/completions to the base URL.', status);
  if (status === 429) return new ModelError('MODEL_RATE_LIMIT', 'The provider rate limit or quota has been reached. Wait before retrying, and check quota or billing for the selected model in your provider console.', status);
  if (status === 408 || status === 504) return new ModelError('MODEL_TIMEOUT', 'The provider timed out. Please retry after a short wait.', status);
  if (status >= 500) return new ModelError('MODEL_UNAVAILABLE', 'The model provider is temporarily unavailable. Please retry later.', status);
  if (status === 400 && /thought.?signature/i.test(message)) return new ModelError('MODEL_CONTEXT_ERROR', 'Gemini rejected the conversation signature. Restart the app to clear old conversation state, then try a new request.', status);
  if (status === 400) return new ModelError('MODEL_BAD_REQUEST', 'The provider rejected the request format or model settings. Confirm the compatible API base URL and a tool-capable model. Run npm run check:model for a connection check.', status);
  return new ModelError('MODEL_PROVIDER_ERROR', 'The model provider rejected the request. Check API access, account status, and provider configuration.', status);
}

export function createModel({ baseUrl = process.env.LLM_BASE_URL, apiKey = process.env.LLM_API_KEY,
  model = process.env.LLM_MODEL, fetchImpl = fetch, timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 60000) } = {}) {
  if (!baseUrl && !model) return null;
  if (!baseUrl || !model) throw new Error('Configure both LLM_BASE_URL and LLM_MODEL.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('LLM_TIMEOUT_MS must be between 1000 and 120000.');
  const endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/chat/completions`);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid model endpoint');
  return async ({ messages, tools }) => {
    try {
      const response = await fetchImpl(endpoint, { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, messages, tools: tools.map((tool) => ({ type: 'function', function: {
          name: tool.name, description: tool.description, parameters: tool.inputSchema,
        } })), tool_choice: 'auto' }),
      });
      if (!response.ok) throw await providerError(response);
      let data;
      try { data = await response.json(); }
      catch { throw new ModelError('MODEL_INVALID_RESPONSE', 'The provider returned an unreadable response. Check the compatible endpoint and retry.'); }
      const message = data.choices?.[0]?.message;
      if (!message || (typeof message.content !== 'string' && !message.tool_calls?.length)) {
        throw new ModelError('MODEL_INVALID_RESPONSE', 'The provider returned no usable reply or tool call. Retry with a shorter request or a tool-capable model.');
      }
      // Preserve opaque Gemini metadata on assistant messages and nested tool calls for replay.
      return { role: 'assistant', content: message.content ?? null,
        ...(message.extra_content ? { extra_content: message.extra_content } : {}),
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) };
    } catch (error) {
      if (error instanceof ModelError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ModelError('MODEL_TIMEOUT', `The model did not respond within ${timeoutMs / 1000} seconds. Retry, or adjust LLM_TIMEOUT_MS (maximum 120000) and restart the app.`);
      }
      // Never forward raw exceptions: they may contain a URL, key, or provider body.
      throw new ModelError('MODEL_NETWORK_ERROR', 'Cannot reach the model provider. Check internet access, DNS, proxy/firewall settings, and LLM_BASE_URL.');
    }
  };
}
