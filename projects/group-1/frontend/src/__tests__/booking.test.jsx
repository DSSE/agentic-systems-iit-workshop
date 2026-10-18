import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App.jsx";

const ROOMS = {
  rooms: [
    { id: "Lab-1", name: "Software Lab 1", capacity: 4, notes: "" },
    { id: "Lab-2", name: "Software Lab 2", capacity: 6, notes: "Staff are exempt from the 3-hour cap." },
    { id: "Lab-3", name: "Networks Lab", capacity: 8, notes: "" },
    { id: "Lab-4", name: "Project Room", capacity: 2, notes: "" },
  ],
  bookings: [],
};

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

// The backend owns the rules; this stub just answers like it would for the seed data.
function fakeCheck({ room_id, start, end, group_size }) {
  const minutes = (new Date(end) - new Date(start)) / 60000;
  if (minutes > 180) return { ok: false, code: "MAX_DURATION_EXCEEDED", reason: `${minutes / 60}h requested; a booking is at most 3h.` };
  const room = ROOMS.rooms.find((r) => r.id === room_id);
  if (group_size > room.capacity) return { ok: false, code: "CAPACITY_EXCEEDED", reason: "Too small." };
  if ((room_id === "Lab-1" || room_id === "Lab-2") && start.startsWith("2026-10-22"))
    return { ok: false, code: "BOOKING_OVERLAP", reason: `${room_id} is already booked.` };
  return { ok: true, code: null, reason: null };
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async (url, options = {}) => {
    if (url === "/api/rooms") return json(200, ROOMS);
    const body = JSON.parse(options.body);
    if (url === "/api/check") return json(200, fakeCheck(body));
    if (url === "/api/bookings") return json(201, { ok: true, booking: { id: "b-005", ...body } });
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bookingPosts = () => fetchMock.mock.calls.filter(([url]) => url === "/api/bookings");

async function fillForm({ room = "", size = 3, date = "2026-10-22", start = "13:00", end = "16:00" }) {
  render(<App />);
  await screen.findByText("Software Lab 1");
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Team A" } });
  fireEvent.change(screen.getByLabelText("Group size"), { target: { value: String(size) } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: room } });
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("End"), { target: { value: end } });
  fireEvent.click(screen.getByRole("button", { name: room ? "Check room" : "Find rooms" }));
}

describe("Case 1: normal booking", () => {
  it("shows a proposal and saves only after Approve", async () => {
    await fillForm({});

    fireEvent.click(await screen.findByRole("button", { name: "Propose Lab-3" }));
    expect(screen.getByRole("region", { name: "Booking proposal" })).toBeTruthy();
    expect(bookingPosts()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByRole("status");

    expect(bookingPosts()).toHaveLength(1);
    const sent = JSON.parse(bookingPosts()[0][1].body);
    expect(sent).toMatchObject({
      room_id: "Lab-3",
      start: "2026-10-22T13:00",
      end: "2026-10-22T16:00",
      group_size: 3,
      requester: "Team A",
      approved: true,
    });
  });

  it("lists unavailable rooms with their rule codes", async () => {
    await fillForm({});
    await screen.findByRole("button", { name: "Propose Lab-3" });
    expect(screen.getAllByText("BOOKING_OVERLAP")).toHaveLength(2);
    expect(screen.getByText("CAPACITY_EXCEEDED")).toBeTruthy();
  });

  it("Cancel discards the proposal and saves nothing", async () => {
    await fillForm({});
    fireEvent.click(await screen.findByRole("button", { name: "Propose Lab-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("region", { name: "Booking proposal" })).toBeNull();
    expect(bookingPosts()).toHaveLength(0);
  });
});

describe("Case 2: boundary", () => {
  it("exactly 3 hours gives a proposal", async () => {
    await fillForm({ room: "Lab-3", date: "2026-10-23", start: "09:00", end: "12:00" });
    expect(await screen.findByRole("region", { name: "Booking proposal" })).toBeTruthy();
  });

  it("3 hours 1 minute fails with the rule code", async () => {
    await fillForm({ room: "Lab-3", date: "2026-10-23", start: "09:00", end: "12:01" });
    expect((await screen.findByRole("alert")).textContent).toContain("MAX_DURATION_EXCEEDED");
    expect(screen.queryByRole("region", { name: "Booking proposal" })).toBeNull();
  });

  it("an overlapping booking fails with the rule code", async () => {
    await fillForm({ room: "Lab-1", start: "14:00", end: "16:00" });
    expect((await screen.findByRole("alert")).textContent).toContain("BOOKING_OVERLAP");
    expect(bookingPosts()).toHaveLength(0);
  });
});

describe("Case 3: breaks the rule", () => {
  it("Lab-2 for 5 hours is refused with the rule code and nothing is saved", async () => {
    await fillForm({ room: "Lab-2", date: "2026-10-23", start: "09:00", end: "14:00" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("MAX_DURATION_EXCEEDED");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(bookingPosts()).toHaveLength(0);
  });

  it("a 5-hour request across all rooms shows one refusal, not a room list", async () => {
    await fillForm({ date: "2026-10-23", start: "09:00", end: "14:00" });
    expect((await screen.findByRole("alert")).textContent).toContain("MAX_DURATION_EXCEEDED");
    expect(screen.queryByRole("list", { name: "Room availability" })).toBeNull();
  });
});

describe("Refused approval", () => {
  it("shows the backend's rule code if the save is refused", async () => {
    fetchMock.mockImplementation(async (url, options = {}) => {
      if (url === "/api/rooms") return json(200, ROOMS);
      if (url === "/api/check") return json(200, { ok: true });
      return json(422, { ok: false, code: "BOOKING_OVERLAP", reason: "Lab-3 was just booked." });
    });
    await fillForm({ room: "Lab-3" });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("BOOKING_OVERLAP"));
  });
});
