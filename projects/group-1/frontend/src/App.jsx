import { useCallback, useEffect, useState } from "react";
import { checkAvailability, createBooking, listRooms } from "./api.js";
import RoomsView from "./components/RoomsView.jsx";
import BookingForm from "./components/BookingForm.jsx";
import ProposalCard from "./components/ProposalCard.jsx";
import RefusalBanner from "./components/RefusalBanner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

const REQUEST_LEVEL_CODES = new Set(["MAX_DURATION_EXCEEDED", "INVALID_TIME_RANGE", "INVALID_REQUEST"]);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function App() {
  const [data, setData] = useState({ rooms: [], bookings: [] });
  const [loadError, setLoadError] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [results, setResults] = useState(null); // [{ room, result }] after "Find rooms"
  const [refusal, setRefusal] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await listRooms());
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleFind(form) {
    setBusy(true);
    setResults(null);
    setRefusal(null);
    setProposal(null);
    setSaved(null);
    setDate(form.date);

    const request = {
      start: `${form.date}T${form.start}`,
      end: `${form.date}T${form.end}`,
      group_size: form.group_size,
    };
    const toProposal = (room) => ({ ...request, room_id: room.id, requester: form.requester, purpose: form.purpose });

    try {
      if (form.room_id) {
        const room = data.rooms.find((r) => r.id === form.room_id);
        const result = await checkAvailability({ ...request, room_id: form.room_id });
        if (result.ok) setProposal(toProposal(room));
        else setRefusal(result);
        return;
      }

      const checked = await Promise.all(
        data.rooms.map(async (room) => ({ room, result: await checkAvailability({ ...request, room_id: room.id }) })),
      );
      // Too long or a bad time range is the request's fault, not any room's: show it once.
      const requestLevel = checked.find((c) => REQUEST_LEVEL_CODES.has(c.result.code));
      if (requestLevel) {
        setRefusal(requestLevel.result);
        return;
      }
      setResults(checked.map((c) => ({ ...c, propose: () => setProposal(toProposal(c.room)) })));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const result = await createBooking(proposal);
      if (result.ok) {
        setSaved(result.booking);
        setProposal(null);
        setResults(null);
        await refresh();
      } else {
        setRefusal(result);
        setProposal(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    setProposal(null);
  }

  return (
    <div className="app">
      <header>
        <ThemeToggle />
        <h1>CampusDesk</h1>
        <p>Book a lab room for group work. A booking is at most 3 hours, and nothing is saved until you approve it.</p>
      </header>

      {loadError && <RefusalBanner refusal={{ code: "BACKEND_UNAVAILABLE", reason: loadError }} />}

      <main className="layout">
        <section className="panel">
          <h2>Request a booking</h2>
          <BookingForm rooms={data.rooms} defaultDate={date} onSubmit={handleFind} busy={busy} />

          {refusal && <RefusalBanner refusal={refusal} />}

          {results && (
            <ul className="results" aria-label="Room availability">
              {results.map(({ room, result, propose }) => (
                <li key={room.id} className={result.ok ? "available" : "unavailable"}>
                  <div>
                    <strong>{room.id}</strong> · {room.name} · seats {room.capacity}
                    {!result.ok && (
                      <div className="reason">
                        <code>{result.code}</code> {result.reason}
                      </div>
                    )}
                  </div>
                  {result.ok && (
                    <button type="button" onClick={propose} disabled={busy}>
                      Propose {room.id}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {proposal && (
            <ProposalCard proposal={proposal} onApprove={handleApprove} onCancel={handleCancel} busy={busy} />
          )}

          {saved && (
            <div className="saved" role="status">
              Booked {saved.room_id} on {saved.start.replace("T", " ")}–{saved.end.slice(11, 16)} ({saved.id}).
            </div>
          )}
        </section>

        <section className="panel">
          <RoomsView rooms={data.rooms} bookings={data.bookings} date={date} onDateChange={setDate} />
        </section>
      </main>
    </div>
  );
}
