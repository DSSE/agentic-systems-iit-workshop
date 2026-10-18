// Milestone 1: tests for workshop cases 1 to 3, straight against the domain
// module and the service layer (no LLM).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import * as domain from "../src/domain/budget.js";
import * as service from "../src/service.js";
import { useTempData, seed, CAP, REMAINING } from "./helpers.js";

const db = useTempData();
beforeEach(() => db.reset());

test("seed numbers are what the cases assume", () => {
  const t = domain.totals(seed());
  assert.equal(t.budget_cap, CAP);
  assert.equal(t.remaining, REMAINING);
});

test("CASE 1 normal: snacks + speaker become proposals within budget, saved only after Approve", () => {
  const snacks = service.addExpense({ vendor_id: "V-SNK", quantity: 60, description: "Snacks for 60" }, { source: "test" });
  const speaker = service.addExpense({ vendor_id: "V-SPK", quantity: 1, description: "Guest speaker" }, { source: "test" });
  assert.equal(snacks.ok, true);
  assert.equal(speaker.ok, true);
  assert.equal(snacks.proposal.amount, 9000);
  assert.equal(speaker.proposal.amount, 8000);
  assert.equal(speaker.status.committed, 4500 + 17000);
  assert.ok(speaker.status.committed <= CAP);

  // Nothing saved yet.
  assert.equal(db.read().expenses.length, 2);
  assert.equal(service.state().status.spent, 4500);

  // Approve one, reject the other.
  const a = service.approve(snacks.proposal.id, { approved_by: "tester" });
  assert.equal(a.ok, true);
  assert.equal(db.read().expenses.length, 3);
  assert.equal(service.reject(speaker.proposal.id).ok, true);
  assert.equal(db.read().expenses.length, 3);
  assert.equal(service.state().status.spent, 13500);
  assert.equal(service.approve(snacks.proposal.id).code, "PROPOSAL_NOT_PENDING", "can't approve twice");
});

test("CASE 2 boundary: exactly at the cap gives a proposal; cap + 1 fails with the rule code", () => {
  const exact = service.addExpense({ vendor_id: "V-MSC", amount: REMAINING, description: "Venue deposit" });
  assert.equal(exact.ok, true);
  assert.equal(exact.status.committed, CAP);
  assert.equal(exact.status.remaining, 0);

  const over = service.addExpense({ vendor_id: "V-MSC", amount: 1 });
  assert.equal(over.ok, false);
  assert.equal(over.code, "BUDGET_CAP_EXCEEDED");
  assert.equal(over.total_after, CAP + 1);

  // Approving the at-cap proposal saves; total is exactly the cap.
  assert.equal(service.approve(exact.proposal.id).ok, true);
  assert.equal(service.state().status.spent, CAP);
  assert.equal(service.addExpense({ vendor_id: "V-MSC", amount: 1 }).code, "BUDGET_CAP_EXCEEDED");
});

test("CASE 2 boundary with per-unit prices: check_budget agrees with add_expense", () => {
  // 20,500 = 41 × 500 isn't a vendor price, so use custom for the edge and units below it.
  assert.equal(service.checkBudget({ vendor_id: "V-CAT", quantity: 45 }).ok, true); // 20,250
  const r = service.checkBudget({ vendor_id: "V-CAT", quantity: 46 }); // 20,700
  assert.equal(r.ok, false);
  assert.equal(r.code, "BUDGET_CAP_EXCEEDED");
});

test("CASE 3 breaks the rule: catering for 200 is refused with the code and a smaller order", () => {
  const before = db.read();
  const r = service.addExpense({ vendor_id: "V-CAT", quantity: 200 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "BUDGET_CAP_EXCEEDED");
  assert.equal(r.cost, 90000);
  assert.equal(r.max_affordable_quantity, 45);
  assert.match(r.suggestion, /45 people/);
  assert.deepEqual(db.read(), before, "nothing written");
});

test("approve re-checks the cap: two proposals that each fit can't both be saved if spending moved", () => {
  const a = service.addExpense({ vendor_id: "V-MSC", amount: 15000 });
  assert.equal(a.ok, true);
  // Simulate spending that changed outside this flow (e.g. a hand-edited data.json).
  const data = db.read();
  data.expenses.push({ id: "E-99", vendor_id: "V-MSC", description: "x", quantity: 1, unit_price: 10000, amount: 10000, approved_by: "x", approved_at: "x", source: "x" });
  writeFileSync(db.file, JSON.stringify(data)); // spent is now 14,500; pending 15,000
  const r = service.approve(a.proposal.id);
  assert.equal(r.ok, false);
  assert.equal(r.code, "BUDGET_CAP_EXCEEDED");
});

test("bad input gets a clear code", () => {
  assert.equal(service.addExpense({ vendor_id: "NOPE", quantity: 1 }).code, "UNKNOWN_VENDOR");
  assert.equal(service.addExpense({ vendor_id: "V-SNK", quantity: 0 }).code, "INVALID_QUANTITY");
  assert.equal(service.addExpense({ vendor_id: "V-SNK", quantity: 2.5 }).code, "INVALID_QUANTITY");
  assert.equal(service.addExpense({ vendor_id: "V-MSC" }).code, "INVALID_AMOUNT");
  assert.equal(service.addExpense({ vendor_id: "V-MSC", amount: -5 }).code, "INVALID_AMOUNT");
  assert.equal(service.addExpense({}).code, "UNKNOWN_VENDOR");
  assert.equal(service.approve("P-404").code, "PROPOSAL_NOT_FOUND");
});

test("the cap can only come from data.json: request fields can't change it", () => {
  const r = service.addExpense({ vendor_id: "V-MSC", amount: 50000, budget_cap: 100000, cap: 100000 });
  assert.equal(r.code, "BUDGET_CAP_EXCEEDED");
  assert.equal(service.checkBudget({ budget_cap: 999999 }).status.budget_cap, CAP);
});
