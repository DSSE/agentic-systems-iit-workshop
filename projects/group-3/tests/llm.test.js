import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLLM } from '../src/agent/llm.js';

test('LLM reviewer requests without MCP tools omit tool_choice', async () => {
  const llm = createLLM({ LLM_BASE_URL: 'https://example.test/v1', LLM_MODEL: 'gemini-test', LLM_API_KEY: 'not-a-real-key' });
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const reply = await llm.chat({ messages: [{ role: 'user', content: 'Review this budget.' }] });
    assert.equal(reply.content, 'OK');
    assert.equal('tools' in requestBody, false);
    assert.equal('tool_choice' in requestBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LLM explains when Gemini denies the configured project', async () => {
  const llm = createLLM({ LLM_BASE_URL: 'https://example.test/v1', LLM_MODEL: 'gemini-test', LLM_API_KEY: 'not-a-real-key' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Your project has been denied access.' } }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(
      llm.chat({ messages: [{ role: 'user', content: 'Review this budget.' }] }),
      /Gemini rejected this API key’s Google project \(HTTP 403\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
