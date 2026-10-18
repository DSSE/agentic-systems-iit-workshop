"use client";

import { useEffect, useState } from "react";
import { fetchRooms, fetchBookingsForRoom, checkAvailability, createBooking, ApiError } from "@/lib/api";
import { buildIso, formatIso } from "@/lib/campusTime";

function describeError(error) {
  let message = `${error.code}: ${error.message}`;
  if (error.suggestedSlot) {
    message += ` Try ${formatIso(error.suggestedSlot.start_at)} - ${formatIso(error.suggestedSlot.end_at)}.`;
  }
  if (error.suggestedRooms && error.suggestedRooms.length) {
    message += ` Consider: ${error.suggestedRooms.join(", ")}.`;
  }
  return message;
}

export default function Home() {
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [groupSize, setGroupSize] = useState(1);

  const [requestError, setRequestError] = useState("");
  const [proposal, setProposal] = useState(null);
  const [proposalError, setProposalError] = useState("");
  const [proposalSuccess, setProposalSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    fetchRooms()
      .then((list) => {
        setRooms(list);
        if (list.length) setRoomId(list[0].id);
      })
      .catch((err) => setRequestError(err instanceof ApiError ? describeError(err) : "Could not load rooms."));
  }, []);

  useEffect(() => {
    if (!roomId) return;
    fetchBookingsForRoom(roomId)
      .then(setBookings)
      .catch(() => setBookings([]));
  }, [roomId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setRequestError("");
    setProposal(null);
    setProposalError("");
    setProposalSuccess("");

    const input = {
      room_id: roomId,
      start_at: buildIso(date, startTime, 0),
      end_at: buildIso(date, startTime, Number(duration)),
      group_size: Number(groupSize),
    };

    try {
      const result = await checkAvailability(input);
      setProposal(result);
    } catch (err) {
      setRequestError(err instanceof ApiError ? describeError(err) : "Something went wrong.");
    }
  }

  async function handleApprove() {
    if (!proposal) return;
    setSaving(true);
    setProposalError("");
    try {
      const booking = await createBooking(
        {
          room_id: proposal.room.id,
          start_at: proposal.start_at,
          end_at: proposal.end_at,
          group_size: proposal.group_size,
        },
        { proposal_id: proposal.proposal_id, approved: true }
      );
      setProposalSuccess(`Booked! Confirmation ID: ${booking.id}`);
      setProposal(null);
      fetchBookingsForRoom(roomId).then(setBookings).catch(() => {});
    } catch (err) {
      setProposalError(err instanceof ApiError ? describeError(err) : "Could not save the booking.");
    } finally {
      setSaving(false);
    }
  }

  function handleReject() {
    setProposal(null);
    setProposalError("");
    setProposalSuccess("");
  }

  return (
    <main className="shell">
      <header>
        <h1>CampusDesk</h1>
        <p>Find a department lab room and request a booking. Timezone: Asia/Dhaka (UTC+06:00). Max duration: 3 hours.</p>
      </header>

      <section className="card">
        <h2>1. Request a slot</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Room
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — capacity {r.capacity}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Start time
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </label>
          <label>
            Duration (minutes, max 180)
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
            />
          </label>
          <label>
            Group size
            <input
              type="number"
              min="1"
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value)}
              required
            />
          </label>
          <button type="submit">Check availability</button>
        </form>
        {requestError && <p className="error">{requestError}</p>}
      </section>

      {proposal && (
        <section className="card">
          <h2>2. Review and approve</h2>
          <dl>
            <dt>Room</dt>
            <dd>{proposal.room.name}</dd>
            <dt>Start</dt>
            <dd>{formatIso(proposal.start_at)}</dd>
            <dt>End</dt>
            <dd>{formatIso(proposal.end_at)}</dd>
            <dt>Duration</dt>
            <dd>{proposal.duration_minutes} minutes</dd>
            <dt>Group size</dt>
            <dd>{proposal.group_size}</dd>
          </dl>
          <div className="actions">
            <button className="primary" onClick={handleApprove} disabled={saving}>
              {saving ? "Saving…" : "Approve & save"}
            </button>
            <button onClick={handleReject} disabled={saving}>
              Reject
            </button>
          </div>
          {proposalError && <p className="error">{proposalError}</p>}
        </section>
      )}

      {proposalSuccess && (
        <section className="card">
          <p className="success">{proposalSuccess}</p>
        </section>
      )}

      <section className="card">
        <h2>Existing bookings for this room</h2>
        {bookings.length === 0 ? (
          <p className="muted">No existing bookings for this room.</p>
        ) : (
          <ul>
            {bookings.map((b) => (
              <li key={b.id}>
                {formatIso(b.start_at)} – {formatIso(b.end_at)} (group of {b.group_size})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
