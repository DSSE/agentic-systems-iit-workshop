// Pure domain tests: no file I/O, exercised directly against in-memory
// rooms/bookings arrays. Covers specs/agent.md's acceptance criteria for
// shape validation, the 180-minute cap, and overlap vs. adjacency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAvailability, validateRequestShape, intervalsOverlap } from "../src/domain/booking.js";
import { BookingError, CODES } from "../src/domain/errors.js";

const rooms = [
  { id: "lab-1", name: "Lab-1", capacity: 4 },
  { id: "lab-2", name: "Lab-2", capacity: 8 },
];

const existingBooking = {
  id: "b1",
  room_id: "lab-2",
  start_at: "2026-11-02T10:00:00+06:00",
  end_at: "2026-11-02T12:00:00+06:00",
  group_size: 3,
};

function assertCode(fn, code) {
  assert.throws(fn, (err) => err instanceof BookingError && err.code === code);
}

test("exactly 180 minutes is allowed", () => {
  const result = checkAvailability(rooms, [], {
    room_id: "lab-1",
    start_at: "2026-11-02T09:00:00+06:00",
    end_at: "2026-11-02T12:00:00+06:00",
    group_size: 2,
  });
  assert.equal(result.durationMinutes, 180);
});

test("181 minutes exceeds the cap", () => {
  assertCode(
    () =>
      checkAvailability(rooms, [], {
        room_id: "lab-1",
        start_at: "2026-11-02T09:00:00+06:00",
        end_at: "2026-11-02T12:01:00+06:00",
        group_size: 2,
      }),
    CODES.DURATION_LIMIT_EXCEEDED
  );
});

test("a 5-hour request is refused", () => {
  assertCode(
    () =>
      checkAvailability(rooms, [], {
        room_id: "lab-1",
        start_at: "2026-11-02T09:00:00+06:00",
        end_at: "2026-11-02T14:00:00+06:00",
        group_size: 2,
      }),
    CODES.DURATION_LIMIT_EXCEEDED
  );
});

test("overlapping bookings for the same room are unavailable", () => {
  assertCode(
    () =>
      checkAvailability(rooms, [existingBooking], {
        room_id: "lab-2",
        start_at: "2026-11-02T11:00:00+06:00",
        end_at: "2026-11-02T13:00:00+06:00",
        group_size: 2,
      }),
    CODES.ROOM_UNAVAILABLE
  );
});

test("adjacent bookings (half-open interval) are allowed", () => {
  const result = checkAvailability(rooms, [existingBooking], {
    room_id: "lab-2",
    start_at: "2026-11-02T12:00:00+06:00", // starts exactly when the existing one ends
    end_at: "2026-11-02T13:00:00+06:00",
    group_size: 2,
  });
  assert.equal(result.room.id, "lab-2");
});

test("intervalsOverlap treats a shared boundary as non-overlapping", () => {
  const a = new Date("2026-01-01T10:00:00Z");
  const b = new Date("2026-01-01T11:00:00Z");
  const c = new Date("2026-01-01T12:00:00Z");
  assert.equal(intervalsOverlap(a, b, b, c), false);
  assert.equal(intervalsOverlap(a, c, b, c), true);
});

test("unknown room is rejected", () => {
  assertCode(
    () =>
      checkAvailability(rooms, [], {
        room_id: "lab-404",
        start_at: "2026-11-02T09:00:00+06:00",
        end_at: "2026-11-02T10:00:00+06:00",
        group_size: 1,
      }),
    CODES.ROOM_NOT_FOUND
  );
});

test("a timestamp without an explicit offset is invalid", () => {
  assertCode(
    () =>
      validateRequestShape(rooms, {
        room_id: "lab-1",
        start_at: "2026-11-02T09:00:00",
        end_at: "2026-11-02T10:00:00+06:00",
        group_size: 1,
      }),
    CODES.INVALID_REQUEST
  );
});

test("end_at not after start_at is invalid", () => {
  assertCode(
    () =>
      validateRequestShape(rooms, {
        room_id: "lab-1",
        start_at: "2026-11-02T10:00:00+06:00",
        end_at: "2026-11-02T09:00:00+06:00",
        group_size: 1,
      }),
    CODES.INVALID_REQUEST
  );
});

test("a non-positive group size is invalid", () => {
  assertCode(
    () =>
      validateRequestShape(rooms, {
        room_id: "lab-1",
        start_at: "2026-11-02T09:00:00+06:00",
        end_at: "2026-11-02T10:00:00+06:00",
        group_size: 0,
      }),
    CODES.INVALID_REQUEST
  );
});

test("a group larger than capacity is rejected", () => {
  assertCode(
    () =>
      validateRequestShape(rooms, {
        room_id: "lab-1",
        start_at: "2026-11-02T09:00:00+06:00",
        end_at: "2026-11-02T10:00:00+06:00",
        group_size: 5,
      }),
    CODES.CAPACITY_EXCEEDED
  );
});
