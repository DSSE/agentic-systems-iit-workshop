// Thin client for the FastAPI backend. All rule decisions are made by the backend.

async function readError(res) {
  const body = await res.json().catch(() => ({}));
  if (body.code) return { ok: false, code: body.code, reason: body.reason };
  // FastAPI validation errors come back as { detail: [...] }.
  const detail = Array.isArray(body.detail) ? body.detail.map((d) => d.msg).join("; ") : body.detail;
  return { ok: false, code: "INVALID_REQUEST", reason: detail || `Request failed (${res.status}).` };
}

export async function listRooms() {
  const res = await fetch("/api/rooms");
  if (!res.ok) throw new Error(`Could not load rooms (${res.status}).`);
  return res.json();
}

export async function checkAvailability({ room_id, start, end, group_size }) {
  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_id, start, end, group_size }),
  });
  if (!res.ok) return readError(res);
  return res.json();
}

// Only the Approve button calls this.
export async function createBooking(proposal) {
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...proposal, approved: true }),
  });
  if (!res.ok) return readError(res);
  return res.json();
}
