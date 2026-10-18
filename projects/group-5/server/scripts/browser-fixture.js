// Isolated, deterministic browser QA only. Never loaded by npm start.
process.env.LLM_API_KEY = "browser-test-provider-not-a-real-key";
const { fixture, slot, scriptedCompletion } = await import("../tests/helpers.js");
const f = await fixture();
const { createApp } = await import("../src/app.js");
const { createChat } = await import("../src/agent/chat.js");
const { AgentError } = await import("../src/agent/model.js");
const complete = async (request) => {
  const lastUser = request.messages.findLastIndex((message) => message.role === "user");
  const recent = { ...request, messages: request.messages.slice(lastUser) };
  const text = recent.messages[0].content;
  if (/simulate unavailable/i.test(text)) throw new AgentError("MODEL_ACCESS_DENIED", "Gemini denied this project's access. You can still use the request form.", 503);
  if (/tomorrow/i.test(text)) return { role: "assistant", content: "What exact start time, duration, and group size do you need?" };
  const duration = /181/.test(text) ? 181 : /6 hours/.test(text) ? 360 : /5 hours/.test(text) ? 300 : 60;
  return scriptedCompletion(slot(duration))(recent);
};
const app = createApp({ auth: f.auth, chat: createChat({ complete }) });
const server = app.listen(4105, "127.0.0.1", () => console.log("Isolated browser fixture listening on 4105"));
async function stop() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await f.clean(); process.exit(0); }
process.on("SIGTERM", stop); process.on("SIGINT", stop);
