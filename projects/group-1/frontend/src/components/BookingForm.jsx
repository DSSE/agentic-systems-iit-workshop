import { useEffect, useState } from "react";

export default function BookingForm({ rooms, defaultDate, onSubmit, busy }) {
  const [form, setForm] = useState({
    requester: "",
    group_size: 3,
    room_id: "",
    date: defaultDate,
    start: "13:00",
    end: "16:00",
    purpose: "",
  });

  useEffect(() => {
    setForm((f) => ({ ...f, date: defaultDate }));
  }, [defaultDate]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    onSubmit({ ...form, group_size: Number(form.group_size) });
  }

  return (
    <form className="booking-form" onSubmit={submit}>
      <label>
        Your name
        <input value={form.requester} onChange={set("requester")} required />
      </label>
      <label>
        Group size
        <input type="number" min="1" value={form.group_size} onChange={set("group_size")} required />
      </label>
      <label>
        Room
        <select value={form.room_id} onChange={set("room_id")}>
          <option value="">Any room</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id} · {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input type="date" value={form.date} onChange={set("date")} required />
      </label>
      <div className="row">
        <label>
          Start
          <input type="time" value={form.start} onChange={set("start")} required />
        </label>
        <label>
          End
          <input type="time" value={form.end} onChange={set("end")} required />
        </label>
      </div>
      <label>
        Purpose
        <input value={form.purpose} onChange={set("purpose")} placeholder="Optional" />
      </label>
      <button type="submit" disabled={busy}>
        {form.room_id ? "Check room" : "Find rooms"}
      </button>
    </form>
  );
}
