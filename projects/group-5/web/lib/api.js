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
    credentials: "include",
    cache: "no-store",
    headers: options?.body ? { "Content-Type": "application/json" } : {},
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.error?.code === "UNAUTHENTICATED") {
      window.dispatchEvent(new Event("campusdesk:session-expired"));
    }
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

const post = (path, input = {}) => request(path, { method: "POST", body: JSON.stringify(input) });
export const getSession = () => request("/api/auth/session").then((data) => data.user);
export const login = (email, password) => post("/api/auth/login", { email, password }).then((data) => data.user);
export const logout = () => post("/api/auth/logout");
export const fetchRequests = () => request("/api/requests").then((data) => data.requests);
export const submitRequest = (input) => post("/api/requests", input).then((data) => data.request);
export const approveRequest = (id, note) => post(`/api/requests/${encodeURIComponent(id)}/approve`, { note });
export const rejectRequest = (id, note) => post(`/api/requests/${encodeURIComponent(id)}/reject`, { note });
export const cancelRequest = (id) => post(`/api/requests/${encodeURIComponent(id)}/cancel`);

export { ApiError };
