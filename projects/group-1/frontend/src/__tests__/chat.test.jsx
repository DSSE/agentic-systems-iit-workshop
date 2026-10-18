import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ChatPanel from "../components/ChatPanel.jsx";

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

const PROPOSAL = {
  room_id: "Lab-3",
  start: "2026-10-22T13:00",
  end: "2026-10-22T15:00",
  group_size: 3,
  purpose: "",
  requester: "Team A",
};

let fetchMock;
let chatReply;

beforeEach(() => {
  chatReply = { reply: "I've proposed Lab-3. Press Approve to save it.", proposal: PROPOSAL };
  fetchMock = vi.fn(async (url, options = {}) => {
    const body = JSON.parse(options.body);
    if (url === "/api/chat") return json(200, chatReply);
    if (url === "/api/bookings") return json(201, { ok: true, booking: { id: "b-005", ...body } });
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posts = (path) => fetchMock.mock.calls.filter(([url]) => url === path);

function sendMessage(text) {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("Chat", () => {
  it("case 1: plain words give a proposal, saved only after Approve", async () => {
    const onBooked = vi.fn();
    render(<ChatPanel onBooked={onBooked} />);
    fireEvent.change(screen.getByLabelText("Booking name"), { target: { value: "Team A" } });
    sendMessage("Book a lab for 3 people Thursday afternoon.");

    await screen.findByRole("region", { name: "Booking proposal" });
    expect(posts("/api/bookings")).toHaveLength(0);
    const sent = JSON.parse(posts("/api/chat")[0][1].body);
    expect(sent).toEqual({ messages: [{ role: "user", content: "Book a lab for 3 people Thursday afternoon." }], requester: "Team A" });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText(/Booked Lab-3/);
    expect(posts("/api/bookings")).toHaveLength(1);
    expect(JSON.parse(posts("/api/bookings")[0][1].body)).toMatchObject({ ...PROPOSAL, approved: true });
    expect(onBooked).toHaveBeenCalled();
  });

  it("case 4: an unclear request gets a question back and no proposal", async () => {
    chatReply = { reply: "What time, and how many people?", proposal: null };
    render(<ChatPanel />);
    sendMessage("Book a room for tomorrow.");

    await screen.findByText("What time, and how many people?");
    expect(screen.queryByRole("region", { name: "Booking proposal" })).toBeNull();
    expect(posts("/api/bookings")).toHaveLength(0);
  });

  it("Cancel discards the proposal without saving", async () => {
    render(<ChatPanel />);
    sendMessage("Book a lab for 3 people Thursday afternoon.");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Booking proposal" })).toBeNull();
    expect(posts("/api/bookings")).toHaveLength(0);
  });

  it("sends the whole conversation so follow-ups have context", async () => {
    chatReply = { reply: "What time, and how many people?", proposal: null };
    render(<ChatPanel />);
    sendMessage("Book a room for tomorrow.");
    await screen.findByText("What time, and how many people?");
    sendMessage("2pm, 4 people");
    await vi.waitFor(() => expect(posts("/api/chat")).toHaveLength(2));
    expect(JSON.parse(posts("/api/chat")[1][1].body).messages).toHaveLength(3);
  });

  it("shows a clear error when the model is not configured", async () => {
    fetchMock.mockImplementation(async () =>
      json(503, { ok: false, code: "LLM_NOT_CONFIGURED", reason: "Set LLM_BASE_URL and LLM_MODEL in .env." }),
    );
    render(<ChatPanel />);
    sendMessage("hello");
    expect((await screen.findByRole("alert")).textContent).toContain("LLM_NOT_CONFIGURED");
  });
});
