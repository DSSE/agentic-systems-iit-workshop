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
import { requireRole } from "./auth.js";

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
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
    .map(({ id, room_id, start_at, end_at, group_size }) => ({ id, room_id, start_at, end_at, group_size }));
}

/** Read-only preview, bound to the signed-in student. Its token can submit
 * a pending request; it cannot authorize a booking. */
export async function checkAvailabilityTool(input, student) {
  requireRole(student, "student");
  const data = await loadData();
  try {
    const validated = checkAvailability(data.rooms, data.bookings, input);
    const proposalId = createProposal({
      room_id: validated.room.id,
      start_at: input.start_at,
      end_at: input.end_at,
      group_size: validated.groupSize,
      requested_by: student.id,
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
 * requires staff approval of an immutable pending request for these
 * exact fields before writing. Everything happens under one lock so a
 * concurrent conflicting create cannot slip in between the check and the
 * write.
 */
export async function createBookingTool(input, approval) {
  const reviewer = approval?.reviewer;
  requireRole(reviewer, "staff");
  return withData(async (data) => {
    // Re-run full domain validation against the live data, even if the
    // caller skipped check_availability or an earlier check succeeded.
    if (input) checkAvailability(data.rooms, data.bookings, input);
    if (approval?.approved !== true || !approval.request_id) {
      throw new BookingError(CODES.APPROVAL_REQUIRED, "Staff must approve an existing pending request.");
    }
    const request = pendingRequest(data, approval.request_id);
    if (request.requested_by === reviewer.id) {
      throw new BookingError(CODES.FORBIDDEN, "You cannot review your own request.");
    }
    if (input && !sameSlot(request, input)) {
      throw new BookingError(CODES.APPROVAL_REQUIRED, "Approval must match the exact submitted request.");
    }
    const validated = checkAvailability(data.rooms, data.bookings, request);
    const reviewedAt = new Date().toISOString();
    const booking = { id: randomUUID(), ...slotFields(request), group_size: validated.groupSize,
      request_id: request.id, requested_by: request.requested_by, approved_by: reviewer.id, approved_at: reviewedAt };
    Object.assign(request, { status: "approved", booking_id: booking.id, reviewed_at: reviewedAt,
      reviewed_by: reviewer.id, reviewer_name: reviewer.name, review_note: noteText(approval.note) });
    data.bookings.push(booking);
    return { booking, request: presentRequest(request, data.rooms) };
  });
}

const slotFields = (value) => ({ room_id: value.room_id, start_at: value.start_at,
  end_at: value.end_at, group_size: Number(value.group_size) });
const sameSlot = (a, b) => Object.entries(slotFields(a)).every(([key, value]) => value === slotFields(b)[key]);
function noteText(value = "") {
  if (typeof value !== "string" || value.trim().length > 500) {
    throw new BookingError(CODES.INVALID_REQUEST, "Notes must be text of at most 500 characters.");
  }
  return value.trim();
}
function presentRequest(request, rooms) {
  return { ...request, room: rooms.find((room) => room.id === request.room_id),
    duration_minutes: Math.round((Date.parse(request.end_at) - Date.parse(request.start_at)) / 60000) };
}
function pendingRequest(data, id) {
  const request = data.requests.find((item) => item.id === id);
  if (!request) throw new BookingError(CODES.REQUEST_NOT_FOUND, "The request was not found.");
  if (request.status !== "pending") {
    throw new BookingError(CODES.REQUEST_NOT_PENDING, `This request is already ${request.status}. Refresh the list.`);
  }
  return request;
}

export async function listRequestsTool(user) {
  requireRole(user);
  const data = await loadData();
  return data.requests.filter((request) => user.role === "staff" || request.requested_by === user.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((request) => presentRequest(request, data.rooms));
}

/** A student's confirmation saves a pending request, never a booking. */
export async function submitRequestTool(input, student) {
  requireRole(student, "student");
  const purpose = noteText(input.purpose);
  if (purpose.length < 3) throw new BookingError(CODES.INVALID_REQUEST, "Describe the purpose of your session (3–500 characters).");
  const result = await withData((data) => {
    const existing = data.requests.find((item) => item.proposal_id === input.proposal_id && item.requested_by === student.id);
    if (existing) {
      if (!sameSlot(existing, input) || existing.purpose !== purpose) {
        throw new BookingError(CODES.APPROVAL_REQUIRED, "Check availability again after changing your request.");
      }
      return presentRequest(existing, data.rooms);
    }
    const proposal = peekProposal(input.proposal_id);
    if (!proposal || proposal.requested_by !== student.id || !sameSlot(proposal, input)) {
      throw new BookingError(CODES.APPROVAL_REQUIRED, "Check availability again before sending this exact request.");
    }
    const validated = checkAvailability(data.rooms, data.bookings, input);
    const request = { id: randomUUID(), ...slotFields(input), group_size: validated.groupSize,
      purpose, proposal_id: input.proposal_id, requested_by: student.id,
      requester_name: student.name, requester_email: student.email,
      status: "pending", created_at: new Date().toISOString() };
    data.requests.push(request);
    return presentRequest(request, data.rooms);
  });
  consumeProposal(input.proposal_id);
  return result;
}

export async function rejectRequestTool(id, reviewer, note) {
  requireRole(reviewer, "staff");
  const reviewNote = noteText(note);
  if (!reviewNote) throw new BookingError(CODES.INVALID_REQUEST, "Give the student a reason for rejection.");
  return withData((data) => {
    const request = pendingRequest(data, id);
    if (request.requested_by === reviewer.id) throw new BookingError(CODES.FORBIDDEN, "You cannot review your own request.");
    Object.assign(request, { status: "rejected", reviewed_by: reviewer.id, reviewer_name: reviewer.name,
      reviewed_at: new Date().toISOString(), review_note: reviewNote });
    return presentRequest(request, data.rooms);
  });
}

export async function cancelRequestTool(id, student) {
  requireRole(student, "student");
  return withData((data) => {
    const owned = data.requests.find((item) => item.id === id && item.requested_by === student.id);
    if (!owned) throw new BookingError(CODES.REQUEST_NOT_FOUND, "The request was not found.");
    const request = pendingRequest(data, id);
    Object.assign(request, { status: "cancelled", cancelled_at: new Date().toISOString() });
    return presentRequest(request, data.rooms);
  });
}
