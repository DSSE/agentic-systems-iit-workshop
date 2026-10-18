// Try the agent in a terminal:  npm run agent -- "Plan snacks and a speaker for Friday's seminar."
import 'dotenv/config';
import { chatOnce } from './chat.js';
const message = process.argv.slice(2).join(' ');
if (!message) { console.error('Usage: npm run agent -- "your request"'); process.exit(1); }
const out = await chatOnce(message);
for (const e of out.events) console.log(`tool ${e.tool}(${JSON.stringify(e.args)})`);
console.log(`\n[${out.model}, prompt ${out.promptVersion}]\n${out.reply}`);
