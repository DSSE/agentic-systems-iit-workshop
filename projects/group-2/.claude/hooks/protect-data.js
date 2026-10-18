// PreToolUse hook: blocks Claude from editing data.json directly.
// data.json may only change through approve() in src/tools.js.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataFile = resolve(dirname(fileURLToPath(import.meta.url)), '../../data.json');

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let target;
  try {
    target = JSON.parse(input).tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (target && resolve(target).toLowerCase() === dataFile.toLowerCase()) {
    console.error('Blocked: data.json is written only through approve() (see CLAUDE.md). Use tests/fixtures/ for test data.');
    process.exit(2);
  }
  process.exit(0);
});
