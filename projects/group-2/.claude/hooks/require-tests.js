// Stop hook: the agent can't finish a turn with failing tests (CLAUDE.md workflow step 3).
// Runs `npm test` only when code in this folder has uncommitted changes. Exit 2 keeps the
// agent working and sends it the failures.
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const groupDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CODE = /^(src|tests|evals|public)\/|^package\.json$|^data\.seed\.json$/;

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let event = {};
  try {
    event = JSON.parse(raw);
  } catch {}
  // Already blocked once this turn: let the agent stop and report, instead of looping.
  if (event.stop_hook_active) process.exit(0);

  let changed;
  try {
    changed = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: groupDir, encoding: 'utf8' })
      .split('\n')
      .map((line) => line.slice(3).trim().replace(/^projects\/group-2\//, ''))
      .filter((path) => CODE.test(path));
  } catch {
    process.exit(0); // not a git checkout: nothing to compare against
  }
  if (!changed.length) process.exit(0);

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = spawnSync(npm, ['test'], { cwd: groupDir, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240_000 });
  if (run.status === 0) process.exit(0);

  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const failures = out.split('\n').filter((l) => /^not ok|^# (pass|fail)|error:|Error \[|expected|actual/.test(l)).slice(0, 40);
  console.error(`npm test fails with uncommitted changes in ${changed.length} code file(s). Fix it before finishing:\n${failures.join('\n')}`);
  process.exit(2);
});
