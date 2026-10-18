import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = (name) => join(projectDir, '.claude', 'hooks', name);

// Feeds a hook the same JSON event Claude Code would send, and returns its exit code.
function fire(script, event) {
  const run = spawnSync(process.execPath, [hook(script)], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: run.status, stderr: run.stderr };
}

describe('protect-data hook', () => {
  test('blocks Edit and Write on data.json', () => {
    for (const tool_name of ['Edit', 'Write', 'MultiEdit']) {
      const { code, stderr } = fire('protect-data.mjs', { tool_name, tool_input: { file_path: join(projectDir, 'data.json') } });
      assert.equal(code, 2);
      assert.match(stderr, /add_expense/);
    }
  });

  test('blocks shell commands that write to data.json', () => {
    for (const command of ['echo {} > data.json', 'sed -i s/20000/99999/ data.json', 'rm data.json', 'cp x.json data.json']) {
      assert.equal(fire('protect-data.mjs', { tool_name: 'Bash', tool_input: { command } }).code, 2, command);
    }
  });

  test('allows reading data.json and editing normal files and the test fixture', () => {
    assert.equal(fire('protect-data.mjs', { tool_name: 'Bash', tool_input: { command: 'cat data.json' } }).code, 0);
    assert.equal(fire('protect-data.mjs', { tool_name: 'Edit', tool_input: { file_path: 'src/tools.js' } }).code, 0);
    assert.equal(fire('protect-data.mjs', { tool_name: 'Write', tool_input: { file_path: 'test/fixtures/data.json' } }).code, 0);
  });
});

describe('test-after-edit hook', () => {
  test('ignores files outside src/ and test/', () => {
    assert.equal(fire('test-after-edit.mjs', { tool_input: { file_path: 'README.md' } }).code, 0);
    assert.equal(fire('test-after-edit.mjs', { tool_input: { file_path: 'public/app.js' } }).code, 0);
  });
});
