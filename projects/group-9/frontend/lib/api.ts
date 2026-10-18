import type { Availability, Booking, BookingInput, Proposal, Room, RuleResult } from "@/lib/types";

export type Outcome<T> = { ok: true; data: T } | { ok: false; refusal: RuleResult };

function failure(message: string): Outcome<never> {
  return { ok: false, refusal: { ok: false, rule_code: null, message, suggestion: null } };
}

async function call<T>(path: string, init?: RequestInit): Promise<Outcome<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch {
    return failure("Cannot reach the CampusDesk API. Is the backend running on port 8000?");
  }
  if (response.status === 204) return { ok: true, data: undefined as T };
  const body = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: body as T };
  if (body && typeof body === "object" && "rule_code" in body) return { ok: false, refusal: body as RuleResult };
  return failure(`The request failed (HTTP ${response.status}).`);
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  rooms: () => call<Room[]>("/rooms"),
  bookings: (day: string) => call<Booking[]>(`/bookings?date=${encodeURIComponent(day)}`),
  availability: (body: Omit<BookingInput, "room_id"> & { room_id?: string }) =>
    call<Availability>("/availability", post(body)),
  propose: (body: BookingInput & { booked_by: string; purpose: string }) => call<Proposal>("/proposals", post(body)),
  pending: () => call<Proposal[]>("/proposals"),
  approve: (id: string) => call<Booking>(`/proposals/${encodeURIComponent(id)}/approve`, post()),
  reject: (id: string) => call<void>(`/proposals/${encodeURIComponent(id)}/reject`, post()),
};
