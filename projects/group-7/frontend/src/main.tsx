import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Vendor = { id: string; name: string; category: string; item: string; unit: string; unit_price_poisha: number };
type State = { status: { cap: number; spent: number; remaining: number }; vendors: Vendor[]; expenses: Array<{ description: string; amount_poisha: number }> };
const money = (value: number) => `${(value / 100).toLocaleString()} BDT`;

function App() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState("Loading ClubOps…");
  useEffect(() => { fetch("http://127.0.0.1:8000/api/state").then(r => r.json()).then(setState).catch(() => setMessage("Start the FastAPI backend on port 8000.")); }, []);
  if (!state) return <main><h1>ClubOps</h1><p>{message}</p></main>;
  return <main><header><h1>ClubOps</h1><p>Human approval is required before anything is saved.</p></header>
    <section className="meter"><b>Budget cap {money(state.status.cap)}</b><span>Approved {money(state.status.spent)}</span><strong>Remaining {money(state.status.remaining)}</strong></section>
    <h2>Vendors</h2><div className="grid">{state.vendors.map(v => <article key={v.id}><b>{v.name}</b><small>{v.item} · {v.unit}</small><strong>{money(v.unit_price_poisha)}</strong></article>)}</div>
    <h2>Approved expenses</h2>{state.expenses.map((e, i) => <p key={i}>{e.description}: {money(e.amount_poisha)}</p>)}
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
