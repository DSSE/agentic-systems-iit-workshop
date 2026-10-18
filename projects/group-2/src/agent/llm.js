// OpenAI-compatible chat completions client. Works with NVIDIA NIM, Groq, Gemini, OpenRouter, Ollama.
// Model and endpoint come from .env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.

export function createLlm({
  baseUrl = process.env.LLM_BASE_URL,
  apiKey = process.env.LLM_API_KEY,
  model = process.env.LLM_MODEL,
} = {}) {
  if (!baseUrl || !model) throw new Error('Set LLM_BASE_URL and LLM_MODEL in .env');
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  // Returns the assistant message: { role, content, tool_calls? }.
  return async function chat(messages, tools) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    return body.choices[0].message;
  };
}
