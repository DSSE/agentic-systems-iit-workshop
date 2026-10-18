import 'dotenv/config';
// Model-independent LLM client. Any OpenAI-compatible chat API works; set it in .env:
//   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL      (or LLM_PROVIDER=mock for the offline test model)
import { createMockLLM } from './mock-llm.js';

export function createLLM(env = process.env) {
  if ((env.LLM_PROVIDER || '').toLowerCase() === 'mock') return createMockLLM();
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = env;
  if (!LLM_BASE_URL || !LLM_MODEL) {
    throw new Error('LLM is not configured. Set LLM_BASE_URL, LLM_MODEL (and LLM_API_KEY) in .env, or LLM_PROVIDER=mock.');
  }
  return {
    name: LLM_MODEL,
    async chat({ messages, tools }) {
      const res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(LLM_API_KEY ? { authorization: `Bearer ${LLM_API_KEY}` } : {}) },
        body: JSON.stringify({ model: LLM_MODEL, messages, tools, tool_choice: 'auto', temperature: 0 }),
      });
      if (!res.ok) throw new Error(`LLM error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      return { content: msg.content ?? '', tool_calls: msg.tool_calls ?? [] };
    },
  };
}
