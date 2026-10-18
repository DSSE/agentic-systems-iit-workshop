// Student preview tokens are single-use and expire. They authorize request
// submission only; they never authorize staff approval or a confirmed booking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "campusdesk-store-test-"));
process.env.CAMPUSDESK_DATA_FILE = path.join(tmpDir, "data.json");
await writeFile(process.env.CAMPUSDESK_DATA_FILE, JSON.stringify({ rooms: [], bookings: [] }));

const { createProposal, peekProposal, consumeProposal } = await import("../src/data/store.js");

test("a proposal can be peeked without consuming it", () => {
  const id = createProposal({ room_id: "lab-1" });
  assert.deepEqual(peekProposal(id), { room_id: "lab-1" });
  assert.deepEqual(peekProposal(id), { room_id: "lab-1" }); // still there
});

test("consumeProposal returns the fields once, then nothing", () => {
  const id = createProposal({ room_id: "lab-2" });
  assert.deepEqual(consumeProposal(id), { room_id: "lab-2" });
  assert.equal(consumeProposal(id), null);
  assert.equal(peekProposal(id), null);
});

test("an unknown proposal id yields nothing", () => {
  assert.equal(peekProposal("does-not-exist"), null);
  assert.equal(consumeProposal("does-not-exist"), null);
});

test("a preview expires at its deadline and cannot be consumed", async (context) => {
  const { PROPOSAL_TTL_MS } = await import("../src/config.js");
  let clock = Date.now();
  context.mock.method(Date, "now", () => clock);
  const id = createProposal({ room_id: "lab-1" });
  assert.ok(peekProposal(id));
  clock += PROPOSAL_TTL_MS;
  assert.equal(peekProposal(id), null);
  assert.equal(consumeProposal(id), null);
});
