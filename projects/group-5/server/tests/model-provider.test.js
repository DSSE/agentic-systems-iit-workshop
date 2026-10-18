import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompletion } from "../src/agent/model.js";

const privateKey = "test-provider-key-not-a-real-credential";

test("the compatible client sends Groq chat and tool configuration without exposing its key", async () => {
  const tools = [{ type: "function", function: { name: "list_rooms", parameters: { type: "object", properties: {} } } }];
  const complete = createCompletion({ apiKey: privateKey, baseUrl: "https://api.groq.com/openai/v1/",
    model: "openai/gpt-oss-120b", fetchImpl: async (url, options) => {
      assert.equal(url.href, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(options.headers.Authorization, `Bearer ${privateKey}`);
      const body = JSON.parse(options.body);
      assert.equal(body.model, "openai/gpt-oss-120b");
      assert.deepEqual(body.tools, tools);
      assert.equal(body.tool_choice, "auto");
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json({ choices: [{ message: { role: "assistant", content: "Ready" } }] });
    } });
  const answer = await complete({ messages: [{ role: "user", content: "Show the rooms" }], tools });
  assert.equal(answer.content, "Ready");
  assert.equal(JSON.stringify(answer).includes(privateKey), false);
});

test("client timeout and abort errors produce a safe, distinct timeout response", async () => {
  for (const name of ["TimeoutError", "AbortError"]) {
    const complete = createCompletion({ apiKey: privateKey, fetchImpl: async () => { throw new DOMException(privateKey, name); } });
    await assert.rejects(() => complete({ messages: [] }), (error) =>
      error.code === "MODEL_TIMEOUT" && error.status === 504 && !error.message.includes(privateKey));
  }
});

test("provider timeout statuses do not leak provider response bodies", async () => {
  for (const status of [408, 504]) {
    const complete = createCompletion({ apiKey: privateKey, fetchImpl: async () => new Response(privateKey, { status }) });
    await assert.rejects(() => complete({ messages: [] }), (error) =>
      error.code === "MODEL_TIMEOUT" && error.status === 504 && !error.message.includes(privateKey));
  }
});
