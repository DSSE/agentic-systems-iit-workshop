// Terminal chat with the agent: npm run agent
import { createInterface } from 'node:readline/promises';
import { createLlm } from './llm.js';
import { connectMcp } from './mcp-client.js';
import { runAgent } from './agent.js';

const llm = createLlm();
const mcp = await connectMcp({ clientName: 'sprintboard-cli' });
const rl = createInterface({ input: process.stdin, output: process.stdout });
const history = [];

console.log(`SprintBoard agent (${process.env.LLM_MODEL}). Proposals need Approve in the UI. Ctrl+C to quit.`);
rl.on('close', () => {
  mcp.close();
  process.exit(0);
});

for (;;) {
  const text = (await rl.question('\nyou> ')).trim();
  if (!text) continue;
  history.push({ role: 'user', content: text });
  try {
    const { reply, toolCalls } = await runAgent({ history, llm, mcp });
    for (const c of toolCalls) console.log(`  [${c.name}] ${c.result.ok === false ? c.result.code : 'ok'}`);
    console.log(`agent> ${reply}`);
    history.push({ role: 'assistant', content: reply });
  } catch (err) {
    console.log(`error> ${err.message}`);
  }
}
