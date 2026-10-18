import { connectRemote } from "./connect.js";
import { createCompletion } from "../src/agent/model.js";
import { runAgent } from "../src/agent/run.js";

const connections = [];
try {
  const complete = createCompletion();
  for (const name of ["campusdesk-concierge", "campusdesk-planner"]) connections.push(await connectRemote({ name }));
  const prompts = ["Find a lab for 3 people on 2030-01-22 from 14:00 to 16:00 Asia/Dhaka. Check the exact availability.", "Book a room for tomorrow."];
  for (const [index, connection] of connections.entries()) {
    const name = index ? "campusdesk-planner" : "campusdesk-concierge";
    const tools = await connection.client.listTools();
    const answer = await runAgent({ client: connection.client, complete, message: prompts[index], agentName: name });
    console.log(JSON.stringify({ agent: name, connectedTools: tools.tools.map((tool) => tool.name), message: prompts[index], text: answer.text, trace: answer.trace, proposal: answer.proposal }, null, 2));
  }
} catch (error) { console.error(error.code || "AGENT_ERROR", error.message); process.exitCode = 1; }
finally { await Promise.all(connections.map((connection) => connection.close())); }
