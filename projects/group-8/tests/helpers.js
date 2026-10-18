import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createTools } from '../src/tools.js';

export const CLOCK = new Date('2026-10-18T06:00:00Z');
export const request = (changes = {}) => ({
  student_id: 'student-8', items: [{ equipment_id: 'arduino-uno-kit', quantity: 2 }],
  start_date: '2026-10-19', due_date: '2026-10-26', ...changes,
});
export const context = (id = 'student-8', session = id) => ({ student_id: id, session_id: session });
export const loan = (changes = {}) => ({
  id: 'existing-1', student_id: 'student-8', items: [{ equipment_id: 'arduino-uno-kit', quantity: 1 }],
  start_date: '2026-10-19', due_date: '2026-10-26', status: 'active',
  approved_at: CLOCK.toISOString(), created_at: CLOCK.toISOString(), ...changes,
});

export async function fixture(t, mutate = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'lablend-test-'));
  const dataPath = join(directory, 'data.json');
  const data = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'));
  data.loans = [];
  mutate(data);
  await writeFile(dataPath, JSON.stringify(data));
  const cleanup = async () => {
    // Keep recursive cleanup confined to this fixture's own temporary directory.
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('lablend-test-')) {
      throw new Error('Unsafe fixture cleanup path');
    }
    await rm(directory, { recursive: true, force: true });
  };
  if (t) t.after(cleanup);
  return {
    directory, dataPath, data, cleanup,
    tools: createTools({ dataPath, now: () => CLOCK }),
    raw: () => readFile(dataPath, 'utf8'),
    stored: async () => JSON.parse(await readFile(dataPath, 'utf8')),
  };
}

export async function checkedApproval(tools, input = request(), actor = context()) {
  const checked = await tools.check_stock(input, actor);
  if (!checked.ok) throw new Error(JSON.stringify(checked));
  const approval = tools.approveProposal(checked.proposal_id, actor);
  return { proposal_id: checked.proposal_id, approval_token: approval.approval_token };
}
