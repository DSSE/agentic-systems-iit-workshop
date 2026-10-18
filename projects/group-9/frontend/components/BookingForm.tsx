"use client";

import { useState } from "react";

import RuleBox from "@/components/RuleBox";
import { api } from "@/lib/api";
import { fmtDay, fmtTime, localParts, minutesBetween } from "@/lib/time";
import type { Proposal, Room, RuleResult, Slot } from "@/lib/types";

// A convenience warning only. The server decides and always shows its rule code.
const WARN_OVER_MINUTES = 180;

type Props = { rooms: Room[]; day: string; onProposed: () => void };
type Feedback = { result: RuleResult } | { proposal: Proposal } | null;

export default function BookingForm({ rooms, day, onProposed }: Props) {
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState(day);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("15:00");
  const [groupSize, setGroupSize] = useState(3);
  const [bookedBy, setBookedBy] = useState("");
  const [purpose, setPurpose] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  const room = roomId || rooms[0]?.id || "";
  const minutes = minutesBetween(start, end);
  const request = () => ({ room_id: room, start: `${date}T${start}`, end: `${date}T${end}`, group_size: groupSize });

  async function check() {
    setBusy(true);
    const outcome = await api.availability(request());
    setBusy(false);
    setFeedback({ result: outcome.ok ? outcome.data.result : outcome.refusal });
  }

  async function propose() {
    setBusy(true);
    const outcome = await api.propose({ ...request(), booked_by: bookedBy.trim() || "student", purpose });
    setBusy(false);
    if (outcome.ok) {
      setFeedback({ proposal: outcome.data });
      onProposed();
    } else {
      setFeedback({ result: outcome.refusal });
    }
  }

  function applySuggestion(slot: Slot) {
    const from = localParts(slot.start);
    setRoomId(slot.room_id);
    setDate(from.date);
    setStart(from.time);
    setEnd(localParts(slot.end).time);
    setFeedback(null);
  }

  return (
    <section className="panel">
      <h2>Book a lab</h2>
      <form className="form" onSubmit={(event) => { event.preventDefault(); void propose(); }}>
        <label>
          Room
          <select value={room} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name} (up to {r.capacity})</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="row">
          <label>
            Start
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <label>
            Group size
            <input type="number" min={1} value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} required />
          </label>
        </div>
        <label>
          Your name
          <input value={bookedBy} onChange={(e) => setBookedBy(e.target.value)} placeholder="student" />
        </label>
        <label>
          Purpose
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Group work" />
        </label>
        {minutes > WARN_OVER_MINUTES && (
          <p className="warning">This is over 3 hours. The server will refuse it.</p>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => void check()} disabled={busy || !room}>
            Check
          </button>
          <button type="submit" disabled={busy || !room}>Propose</button>
        </div>
      </form>
      {feedback && "result" in feedback && <RuleBox result={feedback.result} onUseSuggestion={applySuggestion} />}
      {feedback && "proposal" in feedback && (
        <div className="rule-box ok" role="status">
          <p>
            Proposal for {feedback.proposal.room_name}, {fmtDay(feedback.proposal.start)}{" "}
            {fmtTime(feedback.proposal.start)}–{fmtTime(feedback.proposal.end)}. Nothing is saved until
            someone clicks Approve.
          </p>
        </div>
      )}
    </section>
  );
}
