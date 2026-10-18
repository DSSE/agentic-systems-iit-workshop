"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { buildIso, formatIso } from "@/lib/campusTime";
import ChatPanel from "./ChatPanel";

const statuses = { pending: "Pending review", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };
function message(error) {
  let text = error.message || "Something went wrong. Please try again.";
  if (error.details?.suggestedSlot) text += ` Try ${formatIso(error.details.suggestedSlot.start_at)}.`;
  if (error.details?.suggestedRooms) text += ` Other rooms: ${error.details.suggestedRooms.join(", ")}.`;
  return text;
}
function stamp(iso) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function Brand() {
  return <a className="brand" href="/" aria-label="CampusDesk home"><span className="brand-mark" aria-hidden="true">C<span>↗</span></span><span>CampusDesk<small>DEPARTMENT LABS</small></span></a>;
}
function Notice({ error, success }) {
  return <>{error && <div className="notice error" role="alert">{error}</div>}{success && <div className="notice success" role="status">{success}</div>}</>;
}
function SlotDetails({ slot }) {
  return <dl className="slot-details"><div><dt>Room</dt><dd>{slot.room?.name || slot.room_id}</dd></div>
    <div><dt>Group size</dt><dd>{slot.group_size} people</dd></div>
    <div><dt>Start</dt><dd>{stamp(slot.start_at)}</dd></div><div><dt>End</dt><dd>{stamp(slot.end_at)}</dd></div>
    <div><dt>Duration</dt><dd>{slot.duration_minutes} minutes</dd></div><div><dt>Timezone</dt><dd>Asia/Dhaka · UTC+06:00</dd></div></dl>;
}
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { onLogin(await api.login(email, password)); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <main className="login-shell"><div className="login-story"><Brand /><div><span className="eyebrow">SPACE FOR GOOD WORK</span>
    <h1>A place for your<br />next big idea.</h1><p>Find a lab, request a session, and let your department take care of the approval.</p>
    <div className="flow"><span>01 <b>Request a slot</b></span><span>02 <b>Staff reviews</b></span><span>03 <b>You’re booked</b></span></div></div>
    <p className="story-foot">Department labs · Sessions up to 3 hours</p></div>
    <div className="login-panel"><section className="login-card"><span className="eyebrow">WELCOME TO CAMPUSDESK</span><h2>Sign in to your workspace</h2>
      <p className="muted">Use the account provided by your department.</p><form onSubmit={signIn}>
      <label>Email address<input type="email" autoComplete="username" placeholder="you@department.edu" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={256} disabled={busy} /></label>
      <Notice error={error} /><button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in →"}</button></form>
      <div className="role-guide"><p><strong>Students</strong> request labs and follow their bookings.</p><p><strong>Staff</strong> review requests and manage approvals.</p></div>
    </section></div></main>;
}

function RequestForm({ rooms, onSubmitted, onRoomChange }) {
  const [form, setForm] = useState({ room_id: rooms[0]?.id || "", date: "", start: "09:00", duration: 60, group_size: 1, purpose: "" });
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value })); setProposal(null); setError("");
    if (key === "room_id") onRoomChange(value);
  }
  async function check(event) {
    event.preventDefault(); setBusy(true); setError(""); setProposal(null);
    try {
      const result = await api.checkAvailability({ room_id: form.room_id, start_at: buildIso(form.date, form.start),
        end_at: buildIso(form.date, form.start, Number(form.duration)), group_size: Number(form.group_size) });
      setProposal({ ...result, purpose: form.purpose.trim() });
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function send() {
    setBusy(true); setError("");
    try {
      const result = await api.submitRequest({ proposal_id: proposal.proposal_id, room_id: proposal.room.id,
        start_at: proposal.start_at, end_at: proposal.end_at, group_size: proposal.group_size, purpose: proposal.purpose });
      setProposal(null); onSubmitted(result);
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <section className="card request-form"><div className="section-heading"><span className="step">01</span><div><h2>Request a lab</h2><p>Choose a space and tell us your plans.</p></div></div>
    <form onSubmit={check}><label>Lab room<select value={form.room_id} onChange={(e) => change("room_id", e.target.value)} required disabled={busy || !rooms.length}>
      {rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.capacity} seats</option>)}</select></label>
      <div className="form-row"><label>Date<input type="date" value={form.date} onChange={(e) => change("date", e.target.value)} required disabled={busy} /></label>
      <label>Start time<input type="time" value={form.start} onChange={(e) => change("start", e.target.value)} required disabled={busy} /></label></div>
      <div className="form-row"><label>Duration (minutes)<input type="number" min="1" max="180" value={form.duration} onChange={(e) => change("duration", e.target.value)} required disabled={busy} /></label>
      <label>Group size<input type="number" min="1" value={form.group_size} onChange={(e) => change("group_size", e.target.value)} required disabled={busy} /></label></div>
      <label>Purpose of your session<textarea placeholder="e.g. Database project meeting with my group" minLength={3} maxLength={500} rows={3} value={form.purpose} onChange={(e) => change("purpose", e.target.value)} required disabled={busy} /></label>
      <p className="field-hint">All times are in Asia/Dhaka (UTC+06:00). Maximum 3 hours.</p>
      <button className="secondary" disabled={busy || !rooms.length}>{busy ? "Please wait…" : "Check availability →"}</button>
    </form>
    {proposal && <div className="preview"><span className="eyebrow">AVAILABLE NOW</span><h3>Review your request</h3><SlotDetails slot={proposal} /><p className="purpose">{proposal.purpose}</p>
      <p className="muted">Sending this request does not reserve the room. A staff member will review it first.</p>
      <div className="actions"><button className="primary" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send to staff"}</button><button onClick={() => setProposal(null)} disabled={busy}>Back to editing</button></div></div>}
    <Notice error={error} />
  </section>;
}

function RequestCard({ request, staff, onReview, onCancel, busy }) {
  return <article className="request-item"><div className="request-top"><span className={`status ${request.status}`}>{statuses[request.status]}</span>
    <small className="muted">#{request.id.slice(0, 8)}</small></div><h3>{request.room?.name || request.room_id}</h3>
    <p className="request-time">{stamp(request.start_at)} → {stamp(request.end_at)}</p><p className="muted">{request.duration_minutes} min · {request.group_size} people{staff && ` · ${request.requester_name}`}</p>
    <p className="purpose">{request.purpose}</p>
    {request.review_note && <p className="review-note"><strong>{request.reviewer_name || "Staff"}:</strong> {request.review_note}</p>}
    {request.status === "approved" && <p className="field-hint">Booking confirmation: {request.booking_id}</p>}
    {request.status === "pending" && <div className="actions">{staff ? <button className="secondary" disabled={busy} onClick={() => onReview(request)}>Review request →</button>
      : <button className="text-button" disabled={busy} onClick={() => onCancel(request.id)}>Cancel request</button>}</div>}</article>;
}

function Dashboard({ user, onLogout }) {
  const staff = user.role === "staff";
  const [rooms, setRooms] = useState([]);
  const [requests, setRequests] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState(staff ? "pending" : "all");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [bookings, setBookings] = useState([]);
  const refresh = useCallback(async () => setRequests(await api.fetchRequests()), []);
  useEffect(() => {
    let active = true;
    Promise.all([api.fetchRooms(), api.fetchRequests()]).then(([roomList, requestList]) => {
      if (active) { setRooms(roomList); setRoomId(roomList[0]?.id || ""); setRequests(requestList); }
    }).catch((err) => { if (active) setError(message(err)); }).finally(() => { if (active) setReady(true); });
    const timer = setInterval(() => { if (document.visibilityState === "visible") api.fetchRequests().then((items) => { if (active) setRequests(items); }).catch((err) => { if (active) setError(message(err)); }); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    api.fetchBookingsForRoom(roomId).then((items) => { if (active) setBookings(items); }).catch((err) => { if (active) setError(message(err)); });
    return () => { active = false; };
  }, [roomId, requests]);
  const pending = requests.filter((request) => request.status === "pending").length;
  const approved = requests.filter((request) => request.status === "approved").length;
  const visible = requests.filter((request) => filter === "all" || request.status === filter);
  useEffect(() => {
    if (selected && !requests.some((request) => request.id === selected.id && request.status === "pending")) setSelected(null);
  }, [requests, selected]);
  async function decide(action) {
    if (action === "reject" && !note.trim()) { setError("Please give the student a reason for rejection."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      if (action === "approve") await api.approveRequest(selected.id, note);
      else await api.rejectRequest(selected.id, note);
      setSuccess(action === "approve" ? "Booking approved. The student can see their confirmation." : "Request rejected. The student can see your note.");
      setSelected(null); setNote(""); await refresh();
    } catch (err) { setError(message(err)); await refresh().catch(() => {}); } finally { setBusy(false); }
  }
  async function cancel(id) {
    setBusy(true); setError(""); setSuccess("");
    try { await api.cancelRequest(id); await refresh(); setSuccess("Request cancelled. No booking was created."); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { await api.logout(); onLogout(); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <><header className="topbar"><Brand /><div className="account"><div className="account-info"><strong>{user.name}</strong><span>{staff ? "Lab staff" : "Student"}</span></div>
    <span className="avatar" aria-hidden="true">{user.name.charAt(0)}</span><button className="text-button" onClick={signOut} disabled={busy}>Sign out</button></div></header>
    <main className="workspace"><div className="page-heading"><div><span className="eyebrow">{staff ? "STAFF WORKSPACE" : "STUDENT WORKSPACE"}</span>
      <h1>{staff ? "A little review. A lot of possibility." : "Make room for your next idea."}</h1><p className="muted">{staff ? "Review student requests and approve the right space for their work." : "Find a lab, send your request, and follow its progress here."}</p></div>
      <span className="campus-tag"><span /> Campus labs · Asia/Dhaka</span></div>
    <div className="stats"><div><span>{staff ? "Awaiting your review" : "Awaiting staff review"}</span><strong>{pending.toString().padStart(2, "0")}</strong></div>
      <div><span>Approved bookings</span><strong>{approved.toString().padStart(2, "0")}</strong></div><div><span>{staff ? "Total requests" : "Your requests"}</span><strong>{requests.length.toString().padStart(2, "0")}</strong></div></div>
    <Notice error={error} success={success} />
    {!staff && ready && <ChatPanel onSubmitted={() => { setSuccess("Chat request sent to staff for review."); refresh().catch((err) => setError(message(err))); }} />}
    {!ready ? <p role="status" className="muted">Loading your workspace…</p> : <div className={staff ? "dashboard-grid staff-grid" : "dashboard-grid"}>
      {!staff && <div><RequestForm rooms={rooms} onRoomChange={setRoomId} onSubmitted={() => { setSuccess("Request sent to staff. You’ll see their decision here."); setError(""); refresh().catch((err) => setError(message(err))); }} />
        <section className="card schedule"><h2>Booked sessions</h2><p className="muted">{rooms.find((room) => room.id === roomId)?.name} · Asia/Dhaka</p>
          {bookings.length ? bookings.map((booking) => <p key={booking.id}>{stamp(booking.start_at)}<br /><span className="muted">until {stamp(booking.end_at)}</span></p>) : <p className="muted">No confirmed bookings for this room.</p>}</section></div>}
      <section className="card requests-card"><div className="section-heading spread"><div><h2>{staff ? "Booking requests" : "Your requests"}</h2><p>{staff ? "Pending requests do not reserve a room." : "Your session is confirmed when staff approves it."}</p></div>
        <button className="text-button" onClick={() => refresh().then(() => setError("")).catch((err) => setError(message(err)))} aria-label="Refresh requests">↻ Refresh</button></div>
        <div className="filters" aria-label="Filter requests">{["all", "pending", "approved", "rejected"].map((value) => <button key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All requests" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div>
        {visible.length ? visible.map((request) => <RequestCard key={request.id} request={request} staff={staff} busy={busy}
          onCancel={cancel} onReview={(item) => { setSelected(item); setNote(""); setError(""); setSuccess(""); }} />)
          : <div className="empty-state"><span aria-hidden="true">▤</span><h3>{filter === "pending" ? "All caught up" : "Nothing here yet"}</h3><p>{staff ? "Student requests will appear here for review." : "Send a lab request to get started. Its status will appear here."}</p></div>}
      </section>
      {staff && <aside className="card review-panel">{selected ? <><div className="section-heading"><span className="step">02</span><div><h2>Review this request</h2><p>#{selected.id.slice(0, 8)}</p></div></div>
        <div className="requester"><strong>{selected.requester_name}</strong><span>{selected.requester_email}</span></div><SlotDetails slot={selected} /><p className="purpose">{selected.purpose}</p>
        <label>Review note <span className="field-hint">Required when rejecting</span><textarea rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="Add a note for the student…" /></label>
        <p className="field-hint">Approval confirms this exact slot. Availability is checked again before the booking is saved.</p>
        <div className="actions"><button className="primary" onClick={() => decide("approve")} disabled={busy}>{busy ? "Saving…" : "Approve booking"}</button><button className="danger" onClick={() => decide("reject")} disabled={busy}>Reject request</button></div>
        <button className="text-button close-review" disabled={busy} onClick={() => setSelected(null)}>Close review</button></>
        : <div className="empty-state"><span aria-hidden="true">✓</span><h3>Every request gets a second pair of eyes.</h3><p>Select a pending request to see its full details before making a decision.</p></div>}</aside>}
    </div>}
    <footer className="workspace-footer">CampusDesk · Department lab bookings<span>Student requests. Staff approves. Good work follows.</span></footer></main></>;
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.getSession().then((current) => { if (active) setUser(current); }).catch(() => { if (active) setError("Could not connect to CampusDesk. Check that the API is running and refresh."); }).finally(() => { if (active) setLoading(false); });
    const expired = () => setUser(null);
    window.addEventListener("campusdesk:session-expired", expired);
    return () => { active = false; window.removeEventListener("campusdesk:session-expired", expired); };
  }, []);
  if (loading) return <main className="loading-screen"><Brand /><p role="status">Opening your workspace…</p></main>;
  if (error) return <main className="loading-screen"><Brand /><Notice error={error} /><button onClick={() => window.location.reload()}>Try again</button></main>;
  return user ? <Dashboard key={user.id} user={user} onLogout={() => setUser(null)} /> : <Login onLogin={setUser} />;
}
