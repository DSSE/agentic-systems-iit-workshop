// PostToolUse hook: after the agent edits src/ or test/, run the tests.
// If they fail, exit 2 so the failure goes straight back to the agent.
import { spawnSync } from 'node:child_process';

const input = JSON.parse(await new Promise((done) => {
  let text = '';
  process.stdin.on('data', (chunk) => (text += chunk));
  process.stdin.on('end', () => done(text || '{}'));
}));

const file = String(input.tool_input?.file_path ?? '').replaceAll('\\', '/');
if (!/\/(src|test)\//.test(file) || !file.endsWith('.js')) process.exit(0);

const run = spawnSync('npm', ['test'], {
  cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  encoding: 'utf8',
  shell: true,
});

if (run.status !== 0) {
  const failures = (run.stdout + run.stderr).split('\n').filter((l) => /not ok|# fail|Error/.test(l)).slice(0, 15);
  console.error(`npm test failed after editing ${file}:\n${failures.join('\n')}`);
  process.exit(2);
}
