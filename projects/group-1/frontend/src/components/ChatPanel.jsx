import { useEffect, useRef, useState } from "react";
import { createBooking, sendChat } from "../api.js";
import ProposalCard from "./ProposalCard.jsx";
import RefusalBanner from "./RefusalBanner.jsx";

const EXAMPLES = ["Book a lab for 3 people Thursday afternoon.", "Book a room for tomorrow."];

export default function ChatPanel({ onBooked }) {
  const [name, setName] = useState("");
  const [messages, setMessages] = useState([]); // [{ role: "user" | "assistant", content }]
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, proposal]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setError(null);
    setProposal(null);
    setBusy(true);
    try {
      const result = await sendChat(history, name.trim());
      if (!result.ok) {
        setError(result);
        return;
      }
      setMessages([...history, { role: "assistant", content: result.reply || "…" }]);
      setProposal(result.proposal || null);
    } catch (e) {
      setError({ code: "NETWORK_ERROR", reason: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      const result = await createBooking(proposal);
      setProposal(null);
      if (result.ok) {
        const b = result.booking;
        const note = `Booked ${b.room_id} on ${b.start.slice(0, 10)} ${b.start.slice(11, 16)}–${b.end.slice(11, 16)} (${b.id}).`;
        setMessages((m) => [...m, { role: "assistant", content: note }]);
        onBooked?.();
      } else {
        setError(result);
        setMessages((m) => [...m, { role: "assistant", content: `That booking was refused: ${result.code}.` }]);
      }
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setProposal(null);
    setMessages((m) => [...m, { role: "assistant", content: "Okay, I've discarded that proposal." }]);
  }

  return (
    <div className="chat">
      <label className="chat-name">
        Booking name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Used on the booking" />
      </label>

      <div className="chat-log" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask in plain words, for example:</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="secondary example" onClick={() => send(ex)} disabled={busy}>
                {ex}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble assistant pending">Thinking…</div>}
        {proposal && <ProposalCard proposal={proposal} onApprove={approve} onCancel={cancel} busy={busy} />}
        {error && <RefusalBanner refusal={error} />}
        <div ref={endRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          aria-label="Message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Book a lab for 3 people Thursday afternoon"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
