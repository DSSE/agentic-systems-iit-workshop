// Shared booking domain logic (specs/agent.md). The API routes, and later
// the MCP server and agent, must all call through this module so the
// 3-hour cap and the approval requirement cannot be bypassed by any client.
//
// This module is pure with respect to time: callers pass in the current
// `rooms`/`bookings` arrays and get back a result or throws a BookingError.
// It does not read or write data.json itself (see src/data/store.js).

import { BookingError, CODES } from "./errors.js";
import { MAX_DURATION_MINUTES, CAMPUS_TZ_OFFSET } from "../config.js";

const ISO_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parse an ISO 8601 timestamp that carries an explicit offset (or Z). */
function parseExplicitIso(value) {
  if (typeof value !== "string" || !ISO_OFFSET_RE.test(value)) return null;
  const [year, month, day, hour, minute, second] = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/).slice(1).map((part) => Number(part || 0));
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// All of the below works in "wall-clock space": an absolute instant shifted
// by the fixed campus offset so that calling the UTC getters/setters reads
// and writes the campus's own wall-clock fields, independent of whatever
// timezone the server process itself happens to run in.
function offsetMs(offset) {
  const sign = offset[0] === "-" ? -1 : 1;
  const [oh, om] = offset.slice(1).split(":").map(Number);
  return sign * (oh * 60 + om) * 60000;
}
const CAMPUS_OFFSET_MS = offsetMs(CAMPUS_TZ_OFFSET);
const toWallClock = (date) => new Date(date.getTime() + CAMPUS_OFFSET_MS);

function formatWallClock(wall, offset) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}${offset}`
  );
}

export function findRoom(rooms, roomId) {
  return rooms.find((r) => r.id === roomId) || null;
}

/** list_rooms: optionally filter by capacity. Read-only. */
export function listRooms(rooms, groupSize) {
  if (groupSize === undefined || groupSize === null || groupSize === "") {
    return rooms;
  }
  const n = Number(groupSize);
  if (!isPositiveInteger(n)) {
    throw new BookingError(
      CODES.INVALID_REQUEST,
      "group_size must be a positive integer."
    );
  }
  return rooms.filter((r) => r.capacity >= n);
}

/**
 * Validate a booking request (fields, room existence, duration cap,
 * capacity) against the current room list. Does not check availability.
 * Shared by check_availability and create_booking so neither can skip it.
 */
export function validateRequestShape(rooms, input) {
  const { room_id, start_at, end_at, group_size } = input || {};

  if (!room_id || typeof room_id !== "string") {
    throw new BookingError(CODES.INVALID_REQUEST, "room_id is required.");
  }

  const startDate = parseExplicitIso(start_at);
  const endDate = parseExplicitIso(end_at);
  if (!startDate || !endDate) {
    throw new BookingError(
      CODES.INVALID_REQUEST,
      "start_at and end_at must be ISO 8601 timestamps with an explicit UTC offset (e.g. 2026-10-20T14:00:00+06:00)."
    );
  }
  if (endDate <= startDate) {
    throw new BookingError(
      CODES.INVALID_REQUEST,
      "end_at must be after start_at."
    );
  }

  const groupSize = Number(group_size);
  if (!isPositiveInteger(groupSize)) {
    throw new BookingError(
      CODES.INVALID_REQUEST,
      "group_size must be a positive integer."
    );
  }

  const room = findRoom(rooms, room_id);
  if (!room) {
    throw new BookingError(CODES.ROOM_NOT_FOUND, `Unknown room "${room_id}".`);
  }

  const durationMinutes = (endDate - startDate) / 60000;
  if (durationMinutes > MAX_DURATION_MINUTES) {
    throw new BookingError(
      CODES.DURATION_LIMIT_EXCEEDED,
      `Requested duration is ${durationMinutes} minutes; the maximum is ${MAX_DURATION_MINUTES} minutes.`,
      { durationMinutes, maxDurationMinutes: MAX_DURATION_MINUTES }
    );
  }

  if (groupSize > room.capacity) {
    throw new BookingError(
      CODES.CAPACITY_EXCEEDED,
      `Group size ${groupSize} exceeds ${room.name}'s capacity of ${room.capacity}.`,
      { capacity: room.capacity, groupSize }
    );
  }

  return { room, startDate, endDate, durationMinutes, groupSize };
}

/** Half-open interval overlap: [start, end). Adjacent slots do not conflict. */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/** Find a booking that conflicts with the given room/slot, if any. */
export function findConflict(bookings, roomId, startDate, endDate, excludeBookingId) {
  return (
    bookings.find((b) => {
      if (b.room_id !== roomId) return false;
      if (excludeBookingId && b.id === excludeBookingId) return false;
      const bStart = new Date(b.start_at);
      const bEnd = new Date(b.end_at);
      return intervalsOverlap(startDate, endDate, bStart, bEnd);
    }) || null
  );
}

/**
 * check_availability: full shape validation plus a conflict check. Read-only
 * — it does not reserve the room or grant approval on its own.
 */
export function checkAvailability(rooms, bookings, input) {
  const validated = validateRequestShape(rooms, input);
  const conflict = findConflict(
    bookings,
    validated.room.id,
    validated.startDate,
    validated.endDate
  );
  if (conflict) {
    throw new BookingError(
      CODES.ROOM_UNAVAILABLE,
      `${validated.room.name} is already booked from ${conflict.start_at} to ${conflict.end_at}.`,
      { conflictingBookingId: conflict.id }
    );
  }
  return validated;
}

/** Suggest a same-day slot of at most maxMinutes that does not conflict.
 * All arithmetic happens in campus wall-clock space (see toWallClock above)
 * so "the campus day" means 08:00-20:00 in CAMPUS_TZ_OFFSET, not in
 * whatever timezone the server process happens to run in. */
export function suggestAvailableSlot(bookings, room, startDate, maxMinutes = MAX_DURATION_MINUTES) {
  const dayBookings = bookings
    .filter((b) => b.room_id === room.id)
    .map((b) => ({ start: toWallClock(new Date(b.start_at)), end: toWallClock(new Date(b.end_at)) }))
    .sort((a, b) => a.start - b.start);

  const startWall = toWallClock(startDate);
  const dayStart = new Date(startWall);
  dayStart.setUTCHours(8, 0, 0, 0); // campus day starts 08:00
  const dayEnd = new Date(startWall);
  dayEnd.setUTCHours(20, 0, 0, 0); // campus day ends 20:00

  let cursor = startWall > dayStart ? new Date(startWall) : dayStart;
  for (const b of dayBookings) {
    if (b.start >= cursor) {
      const slotEnd = new Date(Math.min(b.start.getTime(), cursor.getTime() + maxMinutes * 60000));
      if (slotEnd - cursor >= 15 * 60000) {
        return {
          start_at: formatWallClock(cursor, CAMPUS_TZ_OFFSET),
          end_at: formatWallClock(slotEnd, CAMPUS_TZ_OFFSET),
        };
      }
    }
    if (b.end > cursor) cursor = new Date(b.end);
  }
  if (dayEnd - cursor >= 15 * 60000) {
    const slotEnd = new Date(Math.min(dayEnd.getTime(), cursor.getTime() + maxMinutes * 60000));
    return {
      start_at: formatWallClock(cursor, CAMPUS_TZ_OFFSET),
      end_at: formatWallClock(slotEnd, CAMPUS_TZ_OFFSET),
    };
  }
  return null;
}

/** Suggest other rooms with enough capacity for the group. */
export function suggestRoomsWithCapacity(rooms, groupSize, excludeRoomId) {
  return rooms.filter((r) => r.id !== excludeRoomId && r.capacity >= groupSize);
}
