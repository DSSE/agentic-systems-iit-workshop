// The three tools from specs/agent.md (list_rooms, check_availability,
// create_booking), each delegating to src/domain/booking.js for validation
// so the API, and later the MCP server and agent, share one rule set.
import { randomUUID } from "node:crypto";
import { BookingError, CODES } from "./domain/errors.js";
import {
  listRooms,
  checkAvailability,
  suggestAvailableSlot,
  suggestRoomsWithCapacity,
} from "./domain/booking.js";
import { loadData, withData, createProposal, peekProposal, consumeProposal } from "./data/store.js";

export async function listRoomsTool({ group_size } = {}) {
  const data = await loadData();
  return listRooms(data.rooms, group_size);
}

/** Not one of the spec's three tools, but a small read-only convenience for
 * the UI: show existing bookings for a room so a person can avoid proposing
 * an overlapping slot. */
export async function listBookingsForRoomTool(roomId) {
  const data = await loadData();
  return data.bookings
    .filter((b) => b.room_id === roomId)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
}

/** Read-only: validates and conflict-checks, then issues an approval token
 * bound to these exact fields. Does not reserve the room. */
export async function checkAvailabilityTool(input) {
  const data = await loadData();
  try {
    const validated = checkAvailability(data.rooms, data.bookings, input);
    const proposalId = createProposal({
      room_id: validated.room.id,
      start_at: input.start_at,
      end_at: input.end_at,
      group_size: validated.groupSize,
    });
    return {
      proposal_id: proposalId,
      room: validated.room,
      start_at: input.start_at,
      end_at: input.end_at,
      duration_minutes: validated.durationMinutes,
      group_size: validated.groupSize,
    };
  } catch (err) {
    if (err instanceof BookingError) attachSuggestion(err, data, input);
    throw err;
  }
}

function attachSuggestion(err, data, input) {
  if (err.code === CODES.DURATION_LIMIT_EXCEEDED) {
    err.details.suggestion = "Request at most 180 minutes, e.g. shorten end_at to within 180 minutes of start_at.";
    return;
  }
  if (err.code !== CODES.ROOM_UNAVAILABLE && err.code !== CODES.CAPACITY_EXCEEDED) return;

  const room = data.rooms.find((r) => r.id === input.room_id);
  if (!room) return;

  const startDate = new Date(input.start_at);
  if (!Number.isNaN(startDate.getTime())) {
    const slot = suggestAvailableSlot(data.bookings, room, startDate);
    if (slot) err.details.suggestedSlot = slot;
  }
  if (err.code === CODES.CAPACITY_EXCEEDED) {
    const alternatives = suggestRoomsWithCapacity(data.rooms, Number(input.group_size), room.id);
    if (alternatives.length) err.details.suggestedRooms = alternatives.map((r) => r.id);
  }
}

/**
 * create_booking: fully revalidates (duration, capacity, room existence,
 * availability) regardless of whether check_availability ran, then
 * requires a matching, unexpired, single-use approval token for these
 * exact fields before writing. Everything happens under one lock so a
 * concurrent conflicting create cannot slip in between the check and the
 * write.
 */
export async function createBookingTool(input, approval) {
  return withData(async (data) => {
    // Re-run full domain validation against the live data, even if the
    // caller skipped check_availability or an earlier check succeeded.
    const validated = checkAvailability(data.rooms, data.bookings, input);

    const proposalId = approval && approval.proposal_id;
    const proposalFields = proposalId ? peekProposal(proposalId) : null;
    const approved = Boolean(approval && approval.approved === true);

    const matches =
      proposalFields &&
      proposalFields.room_id === validated.room.id &&
      proposalFields.start_at === input.start_at &&
      proposalFields.end_at === input.end_at &&
      proposalFields.group_size === validated.groupSize;

    if (!approved || !matches) {
      throw new BookingError(
        CODES.APPROVAL_REQUIRED,
        "A matching, unexpired approval for this exact proposal is required before saving."
      );
    }

    // Single-use: this exact proposal cannot be replayed to create a second booking.
    consumeProposal(proposalId);

    const booking = {
      id: randomUUID(),
      room_id: validated.room.id,
      start_at: input.start_at,
      end_at: input.end_at,
      group_size: validated.groupSize,
    };
    data.bookings.push(booking);
    return booking;
  });
}
