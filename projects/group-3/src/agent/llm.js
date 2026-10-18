import 'dotenv/config';
// Model-independent LLM client. Any OpenAI-compatible chat API works; set it in .env:
//   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL      (or LLM_PROVIDER=mock for the offline test model)
import { createMockLLM } from './mock-llm.js';

export function createLLM(env = process.env) {
  const provider = (env.LLM_PROVIDER || '').toLowerCase();
  if (provider === 'mock' || (!provider && !env.LLM_BASE_URL && !env.LLM_MODEL)) return createMockLLM();
  const { LLM_BASE_URL, LLM_MODEL } = env;
  const LLM_API_KEY = env.LLM_API_KEY || env.GEMINI_API_KEY_PLANNER;
  if (!LLM_BASE_URL || !LLM_MODEL) {
    throw new Error('LLM is not configured. Set LLM_BASE_URL, LLM_MODEL (and LLM_API_KEY) in .env, or LLM_PROVIDER=mock.');
  }
  return {
    name: LLM_MODEL,
    async chat({ messages, tools }) {
      let res;
      try {
        res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(LLM_API_KEY ? { authorization: `Bearer ${LLM_API_KEY}` } : {}) },
          body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}) }),
        });
      } catch (err) {
        const reason = err.cause?.message || err.message || 'network error';
        throw new Error(`Could not reach the configured AI service (${reason}). Check the internet connection and LLM_BASE_URL.`);
      }
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        if (res.status === 403 && /project has been denied access/i.test(detail)) {
          throw new Error('Gemini rejected this API key’s Google project (HTTP 403). Use a key from an AI Studio project with Gemini API access enabled, or contact Google support.');
        }
        throw new Error(`LLM error ${res.status}: ${detail}`);
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      return { content: msg.content ?? '', tool_calls: msg.tool_calls ?? [] };
    },
  };
}
