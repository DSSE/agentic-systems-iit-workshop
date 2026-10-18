import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { connectRemote } from "./connect.js";
import { createCompletion } from "../src/agent/model.js";
import { runAgent } from "../src/agent/run.js";

let connection;
const terminal = createInterface({ input: stdin, output: stdout });
try {
  connection = await connectRemote({ name: process.argv[2] || "campusdesk-concierge" });
  const complete = createCompletion();
  console.log("CampusDesk MCP agent. Type /quit to exit. Requests and approvals happen in the web workspace.");
  let history = [];
  while (true) {
    const message = await terminal.question("You: ");
    if (message.trim() === "/quit") break;
    if (!message.trim()) continue;
    const answer = await runAgent({ client: connection.client, complete, history, message });
    history = answer.history;
    console.log(`CampusDesk: ${answer.text}`);
    if (answer.proposal) console.log("Preview:", JSON.stringify(answer.proposal, null, 2));
  }
} catch (error) { console.error(error.code || "AGENT_ERROR", error.message); process.exitCode = 1; }
finally { terminal.close(); await connection?.close(); }
