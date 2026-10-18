// A model-independent LLM client: any OpenAI-compatible chat completions API
// (Ollama, Gemini, Groq, OpenRouter, ...), set in .env. It uses fetch, so it
// adds no dependency.

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LlmTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmReply {
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface Llm {
  complete(messages: ChatMessage[], tools: LlmTool[]): Promise<LlmReply>;
}

export const LLM = Symbol('LLM');

// The chat agent cannot answer right now; the message says why and is shown to the user.
export class ChatUnavailable extends Error {}

export class LlmNotConfigured extends ChatUnavailable {}

export class OpenAiCompatibleLlm implements Llm {
  constructor(
    private readonly baseUrl = process.env.LLM_BASE_URL,
    private readonly apiKey = process.env.LLM_API_KEY,
    private readonly model = process.env.LLM_MODEL,
  ) {}

  async complete(messages: ChatMessage[], tools: LlmTool[]): Promise<LlmReply> {
    if (!this.baseUrl || !this.model) {
      throw new LlmNotConfigured('The chat agent is not configured. Set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY) in .env.');
    }
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, messages, tools, temperature: 0 }),
    });
    if (!res.ok) throw new Error(`The model API returned ${res.status}.`);
    const body = (await res.json()) as { choices?: { message?: LlmReply }[] };
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error('The model API returned no message.');
    return { content: message.content ?? null, tool_calls: message.tool_calls };
  }
}
