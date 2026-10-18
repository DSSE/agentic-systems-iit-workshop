// Integration tests for the approval flow, persistence, and concurrency,
// run against a throwaway data.json (never the real seed file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tmpDir = await mkdtemp(path.join(os.tmpdir(), "campusdesk-test-"));
const dataFile = path.join(tmpDir, "data.json");
await writeFile(
  dataFile,
  JSON.stringify({
    rooms: [
      { id: "lab-1", name: "Lab-1", capacity: 4 },
      { id: "lab-2", name: "Lab-2", capacity: 8 },
    ],
    bookings: [],
  })
);
process.env.CAMPUSDESK_DATA_FILE = dataFile;

const { checkAvailabilityTool: previewTool, createBookingTool: createTool, submitRequestTool,
  listRequestsTool, rejectRequestTool, cancelRequestTool } = await import("../src/service.js");
const { BookingError, CODES } = await import("../src/domain/errors.js");
const { createAuth, provisionAccount } = await import("../src/auth.js");
const { withData } = await import("../src/data/store.js");
const password = "test-password-not-a-real-secret";
const accounts = await Promise.all([
  { id: "student-a", email: "a@test.invalid", name: "Student A", role: "student" },
  { id: "student-b", email: "b@test.invalid", name: "Student B", role: "student" },
  { id: "staff-a", email: "staff@test.invalid", name: "Staff A", role: "staff" },
].map((account) => provisionAccount({ ...account, password })));
const auth = createAuth(accounts);
const student = (await auth.login("a@test.invalid", password)).user;
const other = (await auth.login("b@test.invalid", password)).user;
const staff = (await auth.login("staff@test.invalid", password)).user;
const requestByProposal = new Map();

// Preserve every original booking invariant through the new request/staff flow.
async function checkAvailabilityTool(input) {
  const proposal = await previewTool(input, student);
  const request = await submitRequestTool({ ...input, proposal_id: proposal.proposal_id, purpose: "Workshop session" }, student);
  requestByProposal.set(proposal.proposal_id, request.id);
  return proposal;
}
async function createBookingTool(input, approval) {
  const result = await createTool(input, { reviewer: staff, approved: approval?.approved,
    request_id: requestByProposal.get(approval?.proposal_id) });
  return result.booking;
}

async function readBookings() {
  const raw = await readFile(dataFile, "utf8");
  return JSON.parse(raw).bookings;
}

test("a valid proposal can be approved and is persisted", async () => {
  const proposal = await checkAvailabilityTool({
    room_id: "lab-1",
    start_at: "2026-12-01T09:00:00+06:00",
    end_at: "2026-12-01T10:00:00+06:00",
    group_size: 2,
  });

  const booking = await createBookingTool(
    { room_id: "lab-1", start_at: "2026-12-01T09:00:00+06:00", end_at: "2026-12-01T10:00:00+06:00", group_size: 2 },
    { proposal_id: proposal.proposal_id, approved: true }
  );

  assert.ok(booking.id);
  const bookings = await readBookings();
  assert.ok(bookings.some((b) => b.id === booking.id));
});

test("the same create cannot be replayed to double-book the same slot", async () => {
  const proposal = await checkAvailabilityTool({
    room_id: "lab-1",
    start_at: "2026-12-01T11:00:00+06:00",
    end_at: "2026-12-01T12:00:00+06:00",
    group_size: 2,
  });
  const input = { room_id: "lab-1", start_at: "2026-12-01T11:00:00+06:00", end_at: "2026-12-01T12:00:00+06:00", group_size: 2 };
  const approval = { proposal_id: proposal.proposal_id, approved: true };

  await createBookingTool(input, approval); // first use succeeds

  // Replaying it hits the room-availability recheck first (the slot is now
  // taken by the booking the first call just created) — see
  // tests/store.test.js for the token's own single-use guarantee in
  // isolation, independent of availability.
  await assert.rejects(
    () => createBookingTool(input, approval),
    (err) => err instanceof BookingError && err.code === CODES.ROOM_UNAVAILABLE
  );
});

test("changing a field after approval invalidates it", async () => {
  const proposal = await checkAvailabilityTool({
    room_id: "lab-1",
    start_at: "2026-12-01T13:00:00+06:00",
    end_at: "2026-12-01T14:00:00+06:00",
    group_size: 2,
  });

  await assert.rejects(
    () =>
      createBookingTool(
        // group_size changed from 2 to 3 after the proposal was shown
        { room_id: "lab-1", start_at: "2026-12-01T13:00:00+06:00", end_at: "2026-12-01T14:00:00+06:00", group_size: 3 },
        { proposal_id: proposal.proposal_id, approved: true }
      ),
    (err) => err instanceof BookingError && err.code === CODES.APPROVAL_REQUIRED
  );
});

test("create_booking rejects a request with no approval at all", async () => {
  await assert.rejects(
    () =>
      createBookingTool(
        { room_id: "lab-1", start_at: "2026-12-01T15:00:00+06:00", end_at: "2026-12-01T16:00:00+06:00", group_size: 2 },
        {}
      ),
    (err) => err instanceof BookingError && err.code === CODES.APPROVAL_REQUIRED
  );
});

test("create_booking revalidates duration even when check_availability is skipped", async () => {
  // No prior check_availability call at all, and the duration is invalid.
  // The specific domain error must win over a generic approval error.
  await assert.rejects(
    () =>
      createBookingTool(
        { room_id: "lab-1", start_at: "2026-12-01T17:00:00+06:00", end_at: "2026-12-01T21:00:00+06:00", group_size: 2 },
        { proposal_id: "not-a-real-id", approved: true }
      ),
    (err) => err instanceof BookingError && err.code === CODES.DURATION_LIMIT_EXCEEDED
  );
});

test("a stale proposal is rejected once a conflicting booking exists", async () => {
  const slot = { room_id: "lab-2", start_at: "2026-12-02T09:00:00+06:00", end_at: "2026-12-02T10:00:00+06:00", group_size: 2 };

  const proposalA = await checkAvailabilityTool(slot);
  const proposalB = await checkAvailabilityTool(slot); // both still valid; neither has booked yet

  await createBookingTool(slot, { proposal_id: proposalB.proposal_id, approved: true });

  await assert.rejects(
    () => createBookingTool(slot, { proposal_id: proposalA.proposal_id, approved: true }),
    (err) => err instanceof BookingError && err.code === CODES.ROOM_UNAVAILABLE
  );
});

test("concurrent conflicting creates: only one can win", async () => {
  const slot = { room_id: "lab-2", start_at: "2026-12-03T09:00:00+06:00", end_at: "2026-12-03T10:00:00+06:00", group_size: 2 };
  const proposalA = await checkAvailabilityTool(slot);
  const proposalB = await checkAvailabilityTool(slot);

  const results = await Promise.allSettled([
    createBookingTool(slot, { proposal_id: proposalA.proposal_id, approved: true }),
    createBookingTool(slot, { proposal_id: proposalB.proposal_id, approved: true }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, CODES.ROOM_UNAVAILABLE);

  const bookings = await readBookings();
  const forSlot = bookings.filter((b) => b.room_id === "lab-2" && b.start_at === slot.start_at);
  assert.equal(forSlot.length, 1);
});
