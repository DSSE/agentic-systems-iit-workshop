import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fixture, request, context, checkedApproval, CLOCK } from './helpers.js';
import { createTools } from '../src/tools.js';

test('listing, checks, cancellation, and direct create attempts leave data unchanged', async (t) => {
  const f = await fixture(t);
  const before = await f.raw();
  assert.equal((await f.tools.list_equipment()).equipment.length, 3);
  const result = await f.tools.check_stock(request(), context());
  assert.equal(result.ok, true);
  assert.equal(await f.raw(), before);
  for (const input of [{}, { approved: true }, { proposal_id: result.proposal_id }, { proposal_id: result.proposal_id, approval_token: 'forged' }]) {
    assert.equal((await f.tools.create_loan(input, context())).violations[0].code, 'APPROVAL_REQUIRED');
  }
  assert.equal(f.tools.cancelProposal(result.proposal_id, context()).ok, true);
  assert.equal(f.tools.approveProposal(result.proposal_id, context()).ok, false);
  assert.equal(await f.raw(), before);
});
test('approval persists exactly one loan and rejects replay', async (t) => {
  const f = await fixture(t);
  const input = await checkedApproval(f.tools);
  const result = await f.tools.create_loan(input, context());
  assert.equal(result.ok, true);
  assert.equal(result.loan.due_date, '2026-10-26');
  assert.equal((await f.stored()).loans.length, 1);
  assert.equal((await f.tools.create_loan(input, context())).violations[0].code, 'APPROVAL_REQUIRED');
  assert.equal((await f.stored()).loans.length, 1);
});
test('invalid cases produce no proposals or writes', async (t) => {
  const f = await fixture(t);
  const before = await f.raw();
  for (const input of [request({ due_date: '2026-10-27' }), request({ items: [{ equipment_id: 'arduino-uno-kit', quantity: 4 }], due_date: '2026-11-02' }), request({ items: [] })]) {
    const result = await f.tools.check_stock(input, context());
    assert.equal(result.ok, false);
    assert.equal(result.proposal_id, undefined);
    assert.equal(await f.raw(), before);
  }
});
test('approval binds student, session, and proposal; returned proposals cannot be mutated', async (t) => {
  const f = await fixture(t);
  const result = await f.tools.check_stock(request(), context());
  result.proposal.items[0].quantity = 100;
  assert.equal(f.tools.approveProposal(result.proposal_id, context('student-8', 'other-session')).ok, false);
  const approval = f.tools.approveProposal(result.proposal_id, context());
  const input = { proposal_id: result.proposal_id, approval_token: approval.approval_token };
  assert.equal((await f.tools.create_loan({ ...input, proposal_id: 'other' }, context())).ok, false);
  assert.equal((await f.tools.create_loan(input, context('other-student', 'student-8'))).ok, false);
  assert.equal((await f.tools.create_loan(input, context())).loan.items[0].quantity, 2);
});
test('stock and capacity are rechecked after check, including concurrent creates', async (t) => {
  const f = await fixture(t, (data) => { data.equipment[0].total_quantity = 2; });
  const secondContext = context('student-9');
  const first = await checkedApproval(f.tools);
  const second = await checkedApproval(f.tools, request({ student_id: 'student-9' }), secondContext);
  const results = await Promise.all([f.tools.create_loan(first, context()), f.tools.create_loan(second, secondContext)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).violations[0].code, 'INSUFFICIENT_STOCK');
  assert.equal((await f.stored()).loans.length, 1);
});
test('separate service instances cannot exceed student capacity with simultaneous approvals', async (t) => {
  const f = await fixture(t);
  const otherTools = createTools({ dataPath: f.dataPath, now: () => CLOCK });
  const first = await checkedApproval(f.tools);
  const second = await checkedApproval(otherTools);
  const results = await Promise.all([f.tools.create_loan(first, context()), otherTools.create_loan(second, context())]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).violations[0].code, 'ITEM_LIMIT_EXCEEDED');
});
test('expired proposals and restarted service require a fresh check', async (t) => {
  const f = await fixture(t);
  let time = new Date(CLOCK);
  const tools = createTools({ dataPath: f.dataPath, now: () => time });
  const checked = await tools.check_stock(request(), context());
  time = new Date(CLOCK.getTime() + 10 * 60 * 1000);
  assert.equal(tools.approveProposal(checked.proposal_id, context()).violations[0].code, 'PROPOSAL_EXPIRED');
  assert.equal(f.tools.approveProposal(checked.proposal_id, context()).ok, false);
  assert.equal((await f.stored()).loans.length, 0);
});
test('malformed storage cannot be overwritten by an approved create', async (t) => {
  const f = await fixture(t);
  const input = await checkedApproval(f.tools);
  await writeFile(f.dataPath, '{broken');
  assert.equal((await f.tools.create_loan(input, context())).violations[0].code, 'STORAGE_ERROR');
  assert.equal(await f.raw(), '{broken');
});
test('write-lock conflicts fail without modifying inventory or retaining approval', async (t) => {
  const f = await fixture(t);
  const input = await checkedApproval(f.tools);
  const before = await f.raw();
  await writeFile(`${f.dataPath}.lock`, 'another process');
  assert.equal((await f.tools.create_loan(input, context())).violations[0].code, 'STORAGE_ERROR');
  assert.equal(await f.raw(), before);
  assert.equal((await f.tools.create_loan(input, context())).violations[0].code, 'APPROVAL_REQUIRED');
});
