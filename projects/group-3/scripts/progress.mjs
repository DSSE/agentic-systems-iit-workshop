// Adds or updates a phase entry in progress.html.
//   npm run progress -- 1 done "Harness set up: CLAUDE.md, hooks, verify"
//   npm run progress -- --show
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'progress.html');
const html = fs.readFileSync(file, 'utf8');
const re = /(<script id="progress-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const data = JSON.parse(html.match(re)[2]);
const args = process.argv.slice(2);
if (args[0] === '--show' || args.length === 0) {
  for (const p of data) console.log(`${p.phase}. [${p.status}] ${p.title}${p.note ? ' : ' + p.note : ''}`);
  process.exit(0);
}
const [phase, status, ...note] = args;
const entry = data.find((p) => String(p.phase) === phase);
if (!entry || !['todo', 'doing', 'done'].includes(status)) {
  console.error('Usage: npm run progress -- <phase 1-8> <todo|doing|done> "what you did"'); process.exit(1);
}
entry.status = status; entry.note = note.join(' '); entry.date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(file, html.replace(re, `$1\n${JSON.stringify(data, null, 2)}\n$3`));
console.log(`Phase ${phase} -> ${status}`);
