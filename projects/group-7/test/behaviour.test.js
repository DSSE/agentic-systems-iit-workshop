import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { issueApprovalToken } from '../src/approval.js';
import { BUDGET_CAP_EXCEEDED, NOT_APPROVED } from '../src/domain.js';
import { approveProposal, createProposal, rejectProposal } from '../src/proposals.js';
import { addExpense, budgetSummary, checkBudget } from '../src/tools.js';
import { read, useFixture, useSeedData } from './helpers.js';

const rejectsWith = (code) => (err) => err.code === code;

describe('case 1: normal request', () => {
  test('snacks and a speaker are proposed within budget and saved only after approve', () => {
    const file = useSeedData();
    const before = read(file);

    const snacks = createProposal({ vendorId: 'v1', quantity: 50 }); // 3,000
    const speaker = createProposal({ vendorId: 'v2', quantity: 1 }); // 8,000
    assert.equal(snacks.status, 'pending');
    assert.equal(speaker.status, 'pending');
    assert.equal(read(file), before, 'proposals must not write data.json');

    approveProposal(snacks.id);
    approveProposal(speaker.id);
    const summary = budgetSummary();
    assert.equal(summary.spent, 3000 + 3000 + 8000);
    assert.ok(summary.spent <= summary.cap);
    assert.equal(summary.expenses.length, 3);
  });
});

describe('case 2: boundary', () => {
  test('an expense that brings the total exactly to the cap is accepted', () => {
    useFixture({ cap: 1000, expenses: [{ id: 'e1', amount: 400 }] });
    const proposal = createProposal({ vendorId: 'x', quantity: 600 });
    approveProposal(proposal.id);
    const summary = budgetSummary();
    assert.equal(summary.spent, summary.cap);
    assert.equal(summary.remaining, 0);
  });

  test('one BDT over the cap fails with the rule code', () => {
    useFixture({ cap: 1000, expenses: [{ id: 'e1', amount: 1000 }] });
    assert.throws(() => createProposal({ vendorId: 'x', quantity: 1 }), rejectsWith(BUDGET_CAP_EXCEEDED));
  });

  test('pending proposals count towards the cap', () => {
    useFixture({ cap: 1000 });
    createProposal({ vendorId: 'x', quantity: 1000 });
    assert.throws(() => createProposal({ vendorId: 'x', quantity: 1 }), rejectsWith(BUDGET_CAP_EXCEEDED));
  });

  test('rejecting a proposal frees its amount', () => {
    useFixture({ cap: 1000 });
    const big = createProposal({ vendorId: 'x', quantity: 1000 });
    rejectProposal(big.id);
    assert.doesNotThrow(() => createProposal({ vendorId: 'x', quantity: 1000 }));
  });
});

describe('case 3: breaks the rule', () => {
  test('catering for 200 people is refused with the rule code', () => {
    const file = useSeedData();
    const before = read(file);
    assert.throws(() => createProposal({ vendorId: 'v3', quantity: 200 }), rejectsWith(BUDGET_CAP_EXCEEDED));
    assert.equal(read(file), before);
  });

  test('check_budget reports the refusal and a smaller order that fits', () => {
    useSeedData();
    const result = checkBudget({ vendorId: 'v3', quantity: 200 });
    assert.equal(result.fits, false);
    assert.equal(result.code, BUDGET_CAP_EXCEEDED);
    assert.ok(result.maxQuantity > 0 && result.maxQuantity < 200);
    assert.equal(checkBudget({ vendorId: 'v3', quantity: result.maxQuantity }).fits, true);
  });
});

describe('add_expense is the last line of defence', () => {
  beforeEach(() => useSeedData());

  test('refuses without an approval token and writes nothing', () => {
    const file = useSeedData();
    const before = read(file);
    assert.throws(() => addExpense({ vendorId: 'v1', quantity: 1 }), rejectsWith(NOT_APPROVED));
    assert.throws(
      () => addExpense({ vendorId: 'v1', quantity: 1, approvalToken: 'made-up' }),
      rejectsWith(NOT_APPROVED),
    );
    assert.equal(read(file), before);
  });

  test('an approval token works only once', () => {
    useSeedData();
    const token = issueApprovalToken();
    addExpense({ vendorId: 'v1', quantity: 1, approvalToken: token });
    assert.throws(() => addExpense({ vendorId: 'v1', quantity: 1, approvalToken: token }), rejectsWith(NOT_APPROVED));
  });

  test('refuses an over-cap expense even when check_budget was never called', () => {
    const file = useSeedData();
    const before = read(file);
    assert.throws(
      () => addExpense({ vendorId: 'v3', quantity: 200, approvalToken: issueApprovalToken() }),
      rejectsWith(BUDGET_CAP_EXCEEDED),
    );
    assert.equal(read(file), before);
  });

  test('re-checks the cap at approve time against the saved total', () => {
    useFixture({ cap: 1000 });
    const proposal = createProposal({ vendorId: 'x', quantity: 600 });
    // spending saved by another route after the proposal was made
    addExpense({ vendorId: 'x', quantity: 600, approvalToken: issueApprovalToken() });
    assert.throws(() => approveProposal(proposal.id), rejectsWith(BUDGET_CAP_EXCEEDED));
    assert.equal(budgetSummary().spent, 600);
  });
});

describe('case 5: injection in vendor terms', () => {
  test('text in data.json cannot raise the cap or authorise spending', () => {
    useSeedData();
    const catering = JSON.parse(read(process.env.CLUBOPS_DATA)).vendors.find((v) => v.id === 'v3');
    assert.match(catering.terms, /raised the cap/i);

    assert.equal(budgetSummary().cap, 20000);
    // 50,000 BDT worth of catering (143 x 350) stays refused
    assert.throws(() => createProposal({ vendorId: 'v3', quantity: 143 }), rejectsWith(BUDGET_CAP_EXCEEDED));
    assert.equal(budgetSummary().cap, 20000);
  });
});
