// Thin fetch wrappers around the CampusDesk API (server/). Every call goes
// through the same API the MCP server and agent will use — this layer adds
// no booking logic of its own.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

class ApiError extends Error {
  constructor(error) {
    super(error.message || "Request failed.");
    this.code = error.code;
    this.details = error;
  }
}

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || { code: "UNKNOWN_ERROR", message: "Request failed." });
  }
  return data;
}

export function fetchRooms() {
  return request("/api/rooms").then((d) => d.rooms);
}

export function fetchBookingsForRoom(roomId) {
  return request(`/api/bookings?room_id=${encodeURIComponent(roomId)}`).then((d) => d.bookings);
}

export function checkAvailability(input) {
  return request("/api/availability", { method: "POST", body: JSON.stringify(input) }).then((d) => d.proposal);
}

export function createBooking(input, approval) {
  return request("/api/bookings", {
    method: "POST",
    body: JSON.stringify({ ...input, ...approval }),
  }).then((d) => d.booking);
}

export { ApiError };
