import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runAgent } from '../src/agent.js';
import { RULE_ERROR_CODE, MAX_POINTS_PER_MEMBER } from '../src/domain/rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const dataJsonPath = join(projectRoot, 'data.json');
const backupJsonPath = join(projectRoot, 'data.agent-backup.json');

describe('Agent Core & Scenario Evaluation (AIDLC Phase 3 / Unit 5)', () => {

  test('Case 1 (Normal): "Assign the login and payment tasks for this sprint" stages proposal', async () => {
    const res = await runAgent('Assign the login and payment tasks for this sprint.');

    assert.equal(res.isClarification, false);
    assert.ok(res.proposal, 'Must formulate a proposal');
    assert.equal(res.proposal.addedPoints, 8, 'Login (3pts) + Payment (5pts) = 8pts');
    assert.ok(res.proposal.projectedTotal <= MAX_POINTS_PER_MEMBER, 'Must not exceed 8 points');
    assert.ok(res.reply.includes('Human approval required') || res.reply.includes('prepared an assignment proposal'));
  });

  test('Case 4 (Unclear): "Assign the remaining tasks" triggers clarifying question', async () => {
    const res = await runAgent('Assign the remaining tasks.');

    assert.equal(res.isClarification, true, 'Must identify ambiguous request');
    assert.equal(res.proposal, null, 'Must NOT guess or stage a proposal');
    assert.ok(res.reply.includes('Which specific tasks') || res.reply.includes('clarification'));
    assert.ok(res.reply.includes('To which team member'));
  });

  test('Case 3 (Rule break): "Assign all 6 tasks to Rafi" refused with ERR_MAX_POINTS_EXCEEDED', async () => {
    const res = await runAgent('Assign all 6 tasks to Rafi.');

    assert.equal(res.isError, true);
    assert.equal(res.code, RULE_ERROR_CODE);
    assert.equal(res.proposal, null);
    assert.ok(res.reply.includes('ERR_MAX_POINTS_EXCEEDED'));
    assert.ok(res.reply.includes('Suggestion'), 'Must suggest alternative distribution');
  });

  test('Ambiguous prompts: "Assign tasks" without details prompts clarification', async () => {
    const res = await runAgent('Assign tasks');

    assert.equal(res.isClarification, true);
    assert.equal(res.proposal, null);
  });
});
