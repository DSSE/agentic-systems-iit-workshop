// The REST API (what the UI uses). The rule must hold here too.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempData, CAP, REMAINING } from "./helpers.js";

const db = useTempData();
const { createApp } = await import("../src/server.js");
const app = createApp({ agentFactory: async () => { throw new Error("no LLM in tests"); } });
let base;
before(() => new Promise((r) => app.listen(0, "127.0.0.1", () => ((base = `http://127.0.0.1:${app.address().port}`), r()))));
after(() => app.closeAll());
beforeEach(() => db.reset());

const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body = {}) => {
  const res = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test("UI page and state load", async () => {
  const html = await (await fetch(base + "/")).text();
  assert.match(html, /ClubOps/);
  const s = await get("/api/state");
  assert.equal(s.status.budget_cap, CAP);
  assert.equal(s.status.remaining, REMAINING);
  assert.equal(s.vendors.length, 9);
});

test("propose -> nothing saved -> Approve saves (case 1 through the API)", async () => {
  const p = await post("/api/proposals", { vendor_id: "V-SNK", quantity: 60 });
  assert.equal(p.status, 201);
  assert.equal(db.read().expenses.length, 2, "not saved by propose");
  const a = await post(`/api/proposals/${p.body.proposal.id}/approve`);
  assert.equal(a.status, 200);
  assert.equal(db.read().expenses.length, 3);
  assert.equal(a.body.expense.amount, 9000);
});

test("boundary through the API: at cap 201, cap + 1 is 422 with the rule code (case 2)", async () => {
  assert.equal((await post("/api/proposals", { vendor_id: "V-MSC", amount: REMAINING })).status, 201);
  const over = await post("/api/proposals", { vendor_id: "V-MSC", amount: 1 });
  assert.equal(over.status, 422);
  assert.equal(over.body.code, "BUDGET_CAP_EXCEEDED");
});

test("catering for 200 is 422 with the rule code (case 3)", async () => {
  const c = await post("/api/check", { vendor_id: "V-CAT", quantity: 200 });
  assert.equal(c.status, 422);
  assert.equal(c.body.code, "BUDGET_CAP_EXCEEDED");
  assert.equal(c.body.max_affordable_quantity, 45);
  assert.equal((await post("/api/proposals", { vendor_id: "V-CAT", quantity: 200 })).status, 422);
});

test("reject, double approve, unknown proposal", async () => {
  const p = await post("/api/proposals", { vendor_id: "V-TEA", quantity: 60 });
  assert.equal((await post(`/api/proposals/${p.body.proposal.id}/reject`)).status, 200);
  assert.equal((await post(`/api/proposals/${p.body.proposal.id}/approve`)).status, 409);
  assert.equal((await post(`/api/proposals/P-999/approve`)).status, 404);
});

test("no route can change the cap; vendor terms come back sanitised (case 5)", async () => {
  for (const method of ["PUT", "PATCH", "POST"]) {
    const res = await fetch(base + "/api/budget", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ budget_cap: 100000 }) });
    assert.equal(res.status, 404);
  }
  const v = await get("/api/vendors?category=food");
  const royal = v.vendors.find((x) => x.id === "V-CAT");
  assert.equal(royal.injection_flagged, true);
  assert.doesNotMatch(royal.terms, /50,000|raised the cap/);
  assert.equal((await get("/api/state")).status.budget_cap, CAP);
});

test("chat without an LLM returns 503 but the planner keeps working", async () => {
  const r = await post("/api/chat", { session: "s1", text: "hi" });
  assert.equal(r.status, 503);
  assert.equal((await get("/api/agent")).ready, false);
});

test("demo reset restores the seed", async () => {
  await post("/api/proposals", { vendor_id: "V-TEA", quantity: 10 });
  await post("/api/demo/reset");
  assert.equal(db.read().proposals.length, 0);
});
