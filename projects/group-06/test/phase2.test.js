import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { checkMemberCapacity, MAX_POINTS_PER_MEMBER, RULE_ERROR_CODE } from '../src/domain/rules.js';
import { setDataFilePath, readData, stageProposal, commitAssignment } from '../src/domain/storage.js';
import { list_tasks, check_capacity, assign_task } from '../src/tools.js';
import { createServer } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const originalDataPath = join(projectRoot, 'data.json');
const testDataPath = join(projectRoot, 'data.test.json');

describe('Phase 2: Domain, Storage, Tools & API Verification', () => {
  beforeEach(() => {
    // Clone clean data.json to test fixture
    copyFileSync(originalDataPath, testDataPath);
    setDataFilePath(testDataPath);
  });

  afterEach(() => {
    // Clean up fixture and restore default data path
    if (existsSync(testDataPath)) {
      unlinkSync(testDataPath);
    }
    setDataFilePath(originalDataPath);
  });

  test('Domain Rule: Enforces MAX_POINTS_PER_MEMBER = 8', () => {
    assert.equal(MAX_POINTS_PER_MEMBER, 8);
    assert.equal(RULE_ERROR_CODE, 'ERR_MAX_POINTS_EXCEEDED');

    const member = { id: 'm1', name: 'Rafi', currentPoints: 0, maxPoints: 8 };

    // Valid: 0 + 5 = 5 (allowed)
    const res5 = checkMemberCapacity(member, 0, 5);
    assert.equal(res5.allowed, true);
    assert.equal(res5.projectedTotal, 5);

    // Boundary Valid: 0 + 8 = 8 (allowed)
    const res8 = checkMemberCapacity(member, 0, 8);
    assert.equal(res8.allowed, true);
    assert.equal(res8.projectedTotal, 8);

    // Boundary Invalid: 0 + 9 = 9 (ERR_MAX_POINTS_EXCEEDED)
    const res9 = checkMemberCapacity(member, 0, 9);
    assert.equal(res9.allowed, false);
    assert.equal(res9.code, 'ERR_MAX_POINTS_EXCEEDED');
    assert.equal(res9.projectedTotal, 9);

    // Cumulative Invalid: 5 + 4 = 9 (ERR_MAX_POINTS_EXCEEDED)
    const resOver = checkMemberCapacity(member, 5, 4);
    assert.equal(resOver.allowed, false);
    assert.equal(resOver.code, 'ERR_MAX_POINTS_EXCEEDED');
  });

  test('Storage: Stage proposal does NOT mutate data.json', () => {
    const beforeRaw = readFileSync(testDataPath, 'utf8');

    // Stage proposal for Sarah: task-1 (3 pts) + task-2 (5 pts) = 8 pts
    const proposalRes = stageProposal('Sarah', ['task-1', 'task-2']);
    assert.equal(proposalRes.success, true);
    assert.equal(proposalRes.staged, true);
    assert.equal(proposalRes.saved, false);
    assert.equal(proposalRes.proposal.addedPoints, 8);

    // Verify data.json on disk was NOT touched
    const afterRaw = readFileSync(testDataPath, 'utf8');
    assert.equal(beforeRaw, afterRaw, 'data.json must not be modified during proposal staging');
  });

  test('Storage: Commit assignment saves to data.json ONLY if approved === true', () => {
    // Attempt commit with approved: false -> Rejected
    const rejected = commitAssignment('Sarah', ['task-1'], false);
    assert.equal(rejected.success, false);
    assert.equal(rejected.code, 'ERR_APPROVAL_REQUIRED');

    // Commit with approved: true -> Saved
    const approved = commitAssignment('Sarah', ['task-1'], true);
    assert.equal(approved.success, true);
    assert.equal(approved.saved, true);
    assert.equal(approved.member.currentPoints, 3);

    // Verify data on disk has updated
    const diskData = JSON.parse(readFileSync(testDataPath, 'utf8'));
    const sarahOnDisk = diskData.members.find(m => m.name === 'Sarah');
    assert.equal(sarahOnDisk.currentPoints, 3);
    const task1OnDisk = diskData.tasks.find(t => t.id === 'task-1');
    assert.equal(task1OnDisk.status, 'assigned');
    assert.equal(task1OnDisk.assignee, 'Sarah');
  });

  test('Tools: list_tasks, check_capacity, assign_task contract', () => {
    // list_tasks
    const list = list_tasks();
    assert.equal(list.members.length, 3);
    assert.ok(list.tasks.length >= 6);

    // check_capacity
    const checkValid = check_capacity('Rafi', ['task-3']); // 2 pts
    assert.equal(checkValid.allowed, true);

    const checkOver = check_capacity('Rafi', ['task-1', 'task-2', 'task-3']); // 3 + 5 + 2 = 10 pts
    assert.equal(checkOver.allowed, false);
    assert.equal(checkOver.code, 'ERR_MAX_POINTS_EXCEEDED');

    // assign_task staging
    const staged = assign_task('Tanvir', ['task-3'], false);
    assert.equal(staged.staged, true);
    assert.equal(staged.saved, false);
  });

  test('HTTP REST API: /api/data, /api/check, /api/propose, /api/approve', async () => {
    const server = createServer();
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. GET /api/data
      const resData = await fetch(`${baseUrl}/api/data`).then(r => r.json());
      assert.equal(resData.members.length, 3);

      // 2. POST /api/check (valid)
      const resCheckOk = await fetch(`${baseUrl}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: 'Rafi', taskIds: ['task-1'] })
      });
      assert.equal(resCheckOk.status, 200);
      const jsonCheckOk = await resCheckOk.json();
      assert.equal(jsonCheckOk.allowed, true);

      // 3. POST /api/check (over capacity -> 422)
      const resCheckOver = await fetch(`${baseUrl}/api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: 'Rafi', taskIds: ['task-1', 'task-2', 'task-3'] }) // 3+5+2=10
      });
      assert.equal(resCheckOver.status, 422);
      const jsonCheckOver = await resCheckOver.json();
      assert.equal(jsonCheckOver.code, 'ERR_MAX_POINTS_EXCEEDED');

      // 4. POST /api/propose (stages without saving)
      const resPropose = await fetch(`${baseUrl}/api/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: 'Rafi', taskIds: ['task-1'] })
      });
      assert.equal(resPropose.status, 200);
      const jsonPropose = await resPropose.json();
      assert.equal(jsonPropose.staged, true);
      assert.equal(jsonPropose.saved, false);

      // 5. POST /api/approve (persists to data.json)
      const resApprove = await fetch(`${baseUrl}/api/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: 'Rafi', taskIds: ['task-1'] })
      });
      assert.equal(resApprove.status, 200);
      const jsonApprove = await resApprove.json();
      assert.equal(jsonApprove.saved, true);
      assert.equal(jsonApprove.member.currentPoints, 3);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
