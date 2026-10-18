"use client";

import { useEffect, useRef, useState } from "react";
import { chatStatus, sendChat, submitRequest } from "@/lib/api";

function stamp(iso) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function ChatPanel({ onSubmitted }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const log = useRef(null);
  useEffect(() => { chatStatus().then(setStatus).catch(() => setStatus({ configured: false })); }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy]);
  async function send(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setProposal(null);
    setMessages((items) => [...items, { role: "user", text }]); setInput("");
    try {
      const answer = await sendChat({ message: text, ...(conversation ? { conversation_id: conversation } : {}) });
      setConversation(answer.conversation_id);
      setMessages((items) => [...items, { role: "assistant", text: answer.text, trace: answer.trace }]);
      setProposal(answer.proposal); setPurpose("");
    } catch (err) {
      setError(err.message);
      if (["CONVERSATION_NOT_FOUND", "CHAT_LIMIT"].includes(err.code)) setConversation(null);
    } finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const saved = await submitRequest({ proposal_id: proposal.proposal_id, room_id: proposal.room.id,
        start_at: proposal.start_at, end_at: proposal.end_at, group_size: proposal.group_size, purpose: purpose.trim() });
      setProposal(null);
      setMessages((items) => [...items, { role: "assistant", text: `Request #${saved.id.slice(0, 8)} sent to staff. It is pending review; the room is not reserved yet.` }]);
      onSubmitted(saved);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function reset() {
    setMessages([]); setConversation(null); setProposal(null); setPurpose(""); setError(""); setInput("");
  }
  return <section className="card chat-card" aria-labelledby="chat-title">
    <div className="section-heading spread"><div><span className="eyebrow">A LITTLE HELP FINDING YOUR SPACE</span>
      <h2 id="chat-title">Ask CampusDesk</h2><p>Describe your plans. We’ll help you prepare a request.</p></div>
      <button className="text-button" onClick={reset} disabled={busy}>New chat</button></div>
    {status && !status.configured && <p className="notice" role="status">The assistant is waiting for its model configuration. You can use the request form below.</p>}
    <div className="chat-log" role="log" aria-label="Conversation" aria-live="polite" ref={log}>
      {!messages.length && <div className="chat-welcome"><span aria-hidden="true">✳</span><h3>Good work starts with the right space.</h3>
        <p>Tell me when you’d like to meet, for how long, and how many people are coming. Staff will review your request before it’s booked.</p></div>}
      {messages.map((item, index) => <div className={`chat-message ${item.role}`} key={index}>
        <span className="chat-speaker">{item.role === "user" ? "You" : "CampusDesk"}</span><p>{item.text}</p>
        {item.trace?.length > 0 && <small className="tool-evidence">{item.trace.map((entry) => entry.tool === "list_rooms" ? "Rooms checked" : entry.code ? `Availability: ${entry.code}` : "Availability checked").join(" · ")}</small>}
      </div>)}
      {busy && <p className="chat-thinking" role="status">Working on your request…</p>}
    </div>
    <form className="chat-compose" onSubmit={send}><label className="sr-only" htmlFor="chat-message">Message CampusDesk</label>
      <textarea id="chat-message" placeholder="e.g. A lab for 3 people on 22 October, 2–4 pm" rows={2} maxLength={2000}
        value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} required />
      <button className="primary" disabled={busy || !input.trim() || status?.configured === false}>Send message →</button></form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {proposal && <div className="chat-proposal"><span className="eyebrow">AVAILABLE PREVIEW · NOT YET RESERVED</span><h3>Review before you send</h3>
      <dl className="slot-details"><div><dt>Lab room</dt><dd>{proposal.room.name}</dd></div><div><dt>Group size</dt><dd>{proposal.group_size} people</dd></div>
        <div><dt>Start</dt><dd>{stamp(proposal.start_at)}</dd></div><div><dt>End</dt><dd>{stamp(proposal.end_at)}</dd></div>
        <div><dt>Duration</dt><dd>{proposal.duration_minutes} minutes</dd></div><div><dt>Timezone</dt><dd>Asia/Dhaka · UTC+06:00</dd></div></dl>
      <form onSubmit={submit}><label>Purpose for staff review<textarea rows={2} minLength={3} maxLength={500} required disabled={busy} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
        <p className="field-hint">This preview expires in 5 minutes. Sending creates a pending request. Only independent staff approval confirms the booking.</p>
        <div className="actions"><button className="primary" disabled={busy}>Send chat request to staff</button><button type="button" onClick={() => setProposal(null)} disabled={busy}>Discard preview</button></div></form>
    </div>}
    <p className="field-hint chat-footnote">Up to 3 hours · Asia/Dhaka · Staff approval required</p>
  </section>;
}
