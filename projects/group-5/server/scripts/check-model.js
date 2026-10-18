import { createCompletion } from "../src/agent/model.js";
import { LLM_MODEL } from "../src/config.js";
try {
  const message = await createCompletion()({ messages: [{ role: "user", content: "Reply with OK." }] });
  console.log(JSON.stringify({ ok: true, model: LLM_MODEL, text: message.content }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code, message: error.message }));
  process.exitCode = 1;
}
