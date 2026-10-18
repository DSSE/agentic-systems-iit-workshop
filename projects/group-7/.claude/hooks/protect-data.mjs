// PreToolUse hook: data.json may only change through the add_expense tool
// (after a person approves). Blocks edits and shell writes to it.
// Exit code 2 blocks the call and sends stderr back to the agent.
import { basename, resolve } from 'node:path';

const input = JSON.parse(await new Promise((done) => {
  let text = '';
  process.stdin.on('data', (chunk) => (text += chunk));
  process.stdin.on('end', () => done(text || '{}'));
}));

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const liveData = resolve(projectDir, 'data.json');
const { tool_name: tool, tool_input: args = {} } = input;

function block(why) {
  console.error(`Blocked: ${why} data.json only changes through the add_expense tool, after a person approves.`);
  process.exit(2);
}

if (args.file_path && resolve(projectDir, args.file_path) === liveData) {
  block(`${tool} on ${basename(liveData)}.`);
}

if (tool === 'Bash' && typeof args.command === 'string') {
  const cmd = args.command;
  const touchesLive = /(^|[\s"'/\\])data\.json/.test(cmd) && !/fixtures/.test(cmd);
  const writes = />|\btee\b|sed\s+-i|\b(mv|cp|rm)\b|Set-Content|Add-Content|Out-File|writeFile/.test(cmd);
  if (touchesLive && writes) block('shell command that writes to data.json.');
}
