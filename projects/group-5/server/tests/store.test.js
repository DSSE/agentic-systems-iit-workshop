// Unit tests for the proposal-token store itself: single-use and lookup,
// independent of the availability recheck that also guards create_booking.
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
