"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { fmtTime } from "@/lib/time";
import type { Booking, Room } from "@/lib/types";

type Props = { rooms: Room[]; day: string; onDayChange: (day: string) => void; version: number };

export default function Schedule({ rooms, day, onDayChange, version }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.bookings(day).then((outcome) => {
      if (!active) return;
      setBookings(outcome.ok ? outcome.data : []);
      setError(outcome.ok ? null : outcome.refusal.message);
    });
    return () => {
      active = false;
    };
  }, [day, version]);

  return (
    <section className="panel wide">
      <div className="panel-head">
        <h2>Schedule</h2>
        <input type="date" value={day} onChange={(e) => onDayChange(e.target.value)} aria-label="Day" />
      </div>
      {error && <p className="banner error">{error}</p>}
      <ul className="rooms">
        {rooms.map((room) => {
          const taken = bookings.filter((b) => b.room_id === room.id);
          return (
            <li key={room.id} className="room">
              <div className="room-head">
                <strong>{room.name}</strong>
                <span className="muted">up to {room.capacity} people</span>
              </div>
              {room.note && <p className="note">Room note: {room.note}</p>}
              {taken.length === 0 ? (
                <p className="muted">Free all day</p>
              ) : (
                <ul className="slots">
                  {taken.map((b) => (
                    <li key={b.id}>
                      {fmtTime(b.start)}–{fmtTime(b.end)} · {b.group_size} people · {b.purpose || b.booked_by}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
