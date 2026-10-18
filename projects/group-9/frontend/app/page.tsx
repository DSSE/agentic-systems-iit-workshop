"use client";

import { useEffect, useState } from "react";

import BookingForm from "@/components/BookingForm";
import Chat from "@/components/Chat";
import PendingApprovals from "@/components/PendingApprovals";
import Schedule from "@/components/Schedule";
import { api } from "@/lib/api";
import { todayInDhaka } from "@/lib/time";
import type { Room } from "@/lib/types";

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(todayInDhaka);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    api.rooms().then((outcome) => {
      if (outcome.ok) setRooms(outcome.data);
      else setError(outcome.refusal.message);
    });
  }, []);

  return (
    <main className="page">
      <header className="masthead">
        <h1>CampusDesk</h1>
        <p>Book a lab for group work. A booking is at most 3 hours, and nothing is saved until someone clicks Approve.</p>
      </header>
      {error && <p className="banner error">{error}</p>}
      <div className="grid">
        <BookingForm rooms={rooms} day={day} onDayChange={setDay} onProposed={refresh} />
        <PendingApprovals version={version} onDecided={refresh} />
        <Chat onProposed={refresh} onDecided={refresh} />
        <Schedule rooms={rooms} day={day} onDayChange={setDay} version={version} />
      </div>
    </main>
  );
}
