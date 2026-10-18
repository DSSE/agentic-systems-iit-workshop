// PreToolUse hook: enforces CLAUDE.md rules in code instead of trusting the agent.
//   - File tools: edits stay inside projects/group-2/; data.json and .env are never written.
//   - Bash: no command may write data.json or read .env (the Read deny rule can't see Bash).
// Exit 2 blocks the tool call; stderr goes back to the agent as the reason.
import { resolve, dirname, sep, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const groupDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataFile = resolve(groupDir, 'data.json');
// Outside the folder, only the agent's own temp scratchpad and memory are writable.
const writableOutside = [tmpdir(), resolve(homedir(), '.claude', 'projects')];

const norm = (p) => resolve(p).toLowerCase();
const isInside = (p, dir) => norm(p) === norm(dir) || norm(p).startsWith(norm(dir) + sep);
const isEnvFile = (p) => /^\.env(\..+)?$/.test(basename(p)) && basename(p) !== '.env.example';

// A command that mentions data.json is allowed only if it just reads it.
const READ_ONLY = /^\s*(cat|head|tail|less|more|grep|rg|wc|jq|diff|git\s+(diff|status|log|show|blame))\b/;
const WRITES = /(^|[^<>&0-9])>|\btee\b|\bsed\b[^|]*\s-i|\b(cp|mv|rm|truncate|dd|touch)\b|writeFile|\bopen\([^)]*['"][wa]/;
// .env anywhere in a command, except .env.example and node's --env-file flags (which load, not print).
const ENV_REF = /(^|[^\w.-])\.env(?!\.example)(\.[\w-]+)?\b/;
const ENV_FLAG = /--env-file(-if-exists)?=\.env\b/g;

export function check({ tool_name: tool, tool_input: input = {} }) {
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '');
    if (/\bdata\.json\b/.test(cmd) && (!READ_ONLY.test(cmd) || WRITES.test(cmd))) {
      return 'data.json is written only through approve(). Use tests/fixtures/ for test data, or `npm run reset` for a clean board.';
    }
    if (ENV_REF.test(cmd.replace(ENV_FLAG, ''))) {
      return '.env holds the API key and is never read by the agent. Use .env.example for variable names.';
    }
    return null;
  }

  const target = input.file_path ?? input.notebook_path;
  if (!target) return null;
  if (norm(target) === norm(dataFile)) {
    return 'data.json is written only through approve() (see CLAUDE.md). Use tests/fixtures/ for test data.';
  }
  if (isEnvFile(target)) return '.env holds the API key; the agent never writes it.';
  if (!isInside(target, groupDir) && !writableOutside.some((dir) => isInside(target, dir))) {
    return `Only files inside projects/group-2/ may change (blocked: ${target}).`;
  }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let raw = '';
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      process.exit(0);
    }
    const reason = check(event);
    if (reason) {
      console.error(`Blocked: ${reason}`);
      process.exit(2);
    }
    process.exit(0);
  });
}
