// Checks the harness hooks in .claude/: they must block what CLAUDE.md forbids, and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { check } from '../.claude/hooks/guard.js';

const groupDir = fileURLToPath(new URL('../', import.meta.url));
const at = (p) => join(groupDir, p);
const edit = (file_path) => check({ tool_name: 'Edit', tool_input: { file_path } });
const bash = (command) => check({ tool_name: 'Bash', tool_input: { command } });

test('guard: file tools stay inside the group folder and never write data.json or .env', () => {
  for (const ok of ['src/tools.js', 'tests/fixtures/seed.json', 'data.seed.json', '.env.example']) assert.equal(edit(at(ok)), null, ok);
  assert.equal(edit(join(tmpdir(), 'scratch.md')), null, 'temp scratchpad is allowed');
  assert.match(edit(at('data.json')), /approve\(\)/);
  assert.match(edit(at('DATA.JSON')), /approve\(\)/, 'case-insensitive on Windows');
  assert.match(edit(at('.env')), /API key/);
  assert.match(edit(at('../group-1/app.js')), /projects\/group-2/);
  assert.match(edit(at('../../groups.json')), /projects\/group-2/);
  assert.match(check({ tool_name: 'Write', tool_input: { file_path: at('../../.github/x.yml') } }), /projects\/group-2/);
});

test('guard: Bash cannot write data.json or read .env', () => {
  for (const cmd of [
    "sed -i 's/null/\"rafi\"/' data.json",
    'echo {} > data.json',
    'cp tests/fixtures/seed.json data.json',
    'python -c "open(\'data.json\',\'w\').write(\'{}\')"',
    'node -e "require(\'fs\').writeFileSync(\'data.json\',\'{}\')"',
    'git checkout -- data.json',
    'cat data.json | tee data.json',
  ]) assert.match(bash(cmd) ?? '', /approve\(\)/, cmd);
  for (const cmd of ['cat .env', 'grep KEY .env', 'type .env', 'cat ./.env.local', 'node -e "console.log(1)" < .env']) {
    assert.match(bash(cmd) ?? '', /API key/, cmd);
  }
});

test('guard: ordinary commands still run', () => {
  for (const cmd of [
    'npm test',
    'npm run reset',
    'npm run eval -- --cases C5',
    'node --env-file-if-exists=.env src/agent/cli.js',
    'cat data.json',
    'grep -n rafi data.json',
    'git diff data.json',
    'cat .env.example',
    'git status --short 2>&1',
  ]) assert.equal(bash(cmd), null, cmd);
});

test('guard: runs as a hook and exits 2 to block', () => {
  const hook = (event) => spawnSync(process.execPath, [at('.claude/hooks/guard.js')], { input: JSON.stringify(event), encoding: 'utf8' });
  const blocked = hook({ tool_name: 'Edit', tool_input: { file_path: at('data.json') } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /^Blocked:/);
  assert.equal(hook({ tool_name: 'Bash', tool_input: { command: 'npm test' } }).status, 0);
});

test('settings register the guard for file tools and Bash, and the test gate on Stop', () => {
  const { hooks } = JSON.parse(readFileSync(at('.claude/settings.json'), 'utf8'));
  const pre = hooks.PreToolUse.find((h) => h.hooks.some((x) => x.command.includes('guard.js')));
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'Bash']) assert.ok(pre.matcher.split('|').includes(tool), tool);
  assert.ok(hooks.Stop.some((h) => h.hooks.some((x) => x.command.includes('require-tests.js'))));
});

test('require-tests: a repeated stop is let through, so the hook never loops', () => {
  const run = spawnSync(process.execPath, [at('.claude/hooks/require-tests.js')], { input: JSON.stringify({ stop_hook_active: true }), encoding: 'utf8' });
  assert.equal(run.status, 0);
});
