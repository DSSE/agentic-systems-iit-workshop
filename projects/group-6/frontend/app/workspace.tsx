"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import {
  ApiError, approveProposal, fetchApprovalSession, fetchBoard, fetchChatStatus, fetchProposals,
  previewCapacity, proposeAssignment, rejectProposal, sendChat, startApprovalSession,
} from "@/lib/api";
import type { Board, CapacityPreview, ChatMessage, ChatReply, PendingProposal, Task } from "@/lib/api";

type View = "chat" | "board" | "review";
type Entry = ChatMessage & { id: string; proposals?: PendingProposal[]; refusals?: ChatReply["refusals"]; failed?: boolean };
type Decision = "approved" | "rejected";
type IconName = "spark" | "chat" | "board" | "check" | "arrow" | "plus" | "refresh" | "shield" | "chevron" | "close" | "team";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z"/></>,
    chat: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>,
    board: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h6m6 6h6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <><path d="M12 19V5m-6 6 6-6 6 6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></>,
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const prompts = [
  { icon: "spark" as const, title: "Plan a balanced sprint", detail: "Find room for the whole backlog", message: "Plan a balanced sprint" },
  { icon: "board" as const, title: "Assign Login & Payment", detail: "Turn a request into proposals", message: "Assign the Login and Payment tasks for this sprint" },
  { icon: "team" as const, title: "Check team capacity", detail: "See who has room for more", message: "Who has capacity?" },
];

const getError = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function SprintWorkspace({ initialBoard, initialError }: { initialBoard: Board; initialError: string | null }) {
  const [board, setBoard] = useState(initialBoard);
  const [boardError, setBoardError] = useState(initialError);
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [code, setCode] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [model, setModel] = useState<{ mode: "local" | "llm"; model: string | null }>({ mode: "local", model: null });
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, CapacityPreview | undefined>>({});
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const previewRequests = useRef<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);

  const refreshBoard = useCallback(async () => {
    try { setBoard(await fetchBoard()); setBoardError(null); setPreviews({}); }
    catch (error) { setBoardError(getError(error)); }
  }, []);
  const refreshProposals = useCallback(async () => {
    try { setProposals(await fetchProposals()); setProposalError(null); }
    catch (error) { setProposalError(getError(error)); }
  }, []);
  const refreshSession = useCallback(async () => {
    try { const session = await fetchApprovalSession(); setCsrf(session.authenticated ? session.csrfToken : null); setSetupError(null); }
    catch (error) { setCsrf(null); setSetupError(getError(error)); }
  }, []);
  async function refresh() {
    setRefreshing(true);
    await Promise.all([refreshBoard(), refreshProposals(), refreshSession(), fetchChatStatus().then(setModel).catch(() => {})]);
    setRefreshing(false);
  }
  useEffect(() => {
    void refreshBoard(); void refreshProposals(); void refreshSession();
    void fetchChatStatus().then(setModel).catch(() => {});
    if (new URLSearchParams(window.location.search).has("proposal")) setView("review");
  }, [refreshBoard, refreshProposals, refreshSession]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, sending]);

  async function submitMessage(text: string) {
    if (!text.trim() || sendingRef.current) return;
    const content = text.trim();
    sendingRef.current = true; setSending(true); setView("chat"); setDraft(""); setFeedback(null);
    const history = messages.filter((entry) => !entry.failed).map(({ role, content }) => ({ role, content }));
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", content }]);
    try {
      const result = await sendChat(content, history);
      setModel((current) => ({ ...current, mode: result.mode }));
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: result.message, proposals: result.proposals, refusals: result.refusals }]);
      await Promise.all([refreshBoard(), refreshProposals()]);
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: getError(error), failed: true }]);
      // A provider may fail after creating proposals. Always recover them for review.
      await refreshProposals();
    } finally { sendingRef.current = false; setSending(false); composerRef.current?.focus(); }
  }

  async function enableApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSetupBusy(true); setSetupError(null);
    try {
      const session = await startApprovalSession(code.trim());
      setCsrf(session.authenticated ? session.csrfToken : null); setCode(""); setSetupOpen(false);
    } catch (error) { setSetupError(getError(error)); }
    finally { setSetupBusy(false); }
  }

  async function decide(proposal: PendingProposal, approve: boolean) {
    if (!csrf) { setSetupOpen(true); return; }
    if (busyProposal) return;
    setBusyProposal(proposal.proposalId); setFeedback(null);
    try {
      if (approve) await approveProposal(proposal, csrf); else await rejectProposal(proposal.proposalId, csrf);
      setDecisions((current) => ({ ...current, [proposal.proposalId]: approve ? "approved" : "rejected" }));
      setFeedback({ text: approve ? `${proposal.taskTitle} assigned to ${proposal.memberName}.` : `${proposal.taskTitle} proposal dismissed. The board is unchanged.`, error: false });
    } catch (error) {
      setFeedback({ text: getError(error), error: true });
      if (error instanceof ApiError && error.code === "stale_proposal") setView("review");
      if (error instanceof ApiError && [401, 403].includes(error.status)) { setCsrf(null); setSetupOpen(true); }
    } finally { await Promise.all([refreshBoard(), refreshProposals()]); setBusyProposal(null); }
  }

  async function selectMember(task: Task, memberId: string) {
    setSelected((current) => ({ ...current, [task.id]: memberId }));
    setPreviews((current) => ({ ...current, [task.id]: undefined }));
    const requestId = (previewRequests.current[task.id] ?? 0) + 1; previewRequests.current[task.id] = requestId;
    if (!memberId) return;
    try {
      const preview = await previewCapacity(memberId, task.points);
      if (previewRequests.current[task.id] === requestId) setPreviews((current) => ({ ...current, [task.id]: preview }));
    } catch (error) { setFeedback({ text: getError(error), error: true }); }
  }

  async function manualProposal(task: Task) {
    const memberId = selected[task.id]; if (!memberId) return;
    setBusyTask(task.id);
    try { await proposeAssignment(task.id, memberId); await refreshProposals(); setView("review"); }
    catch (error) { setFeedback({ text: getError(error), error: true }); }
    finally { setBusyTask(null); }
  }

  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); void submitMessage(draft);
    }
  }

  const backlog = board.tasks.filter((task) => task.assignee === null);
  const assigned = board.tasks.length - backlog.length;
  const totalPoints = board.tasks.reduce((sum, task) => sum + task.points, 0);
  const assignedPoints = board.members.reduce((sum, member) => sum + member.points, 0);

  function proposalCard(snapshot: PendingProposal) {
    const current = proposals.find((p) => p.proposalId === snapshot.proposalId);
    const proposal = current ?? snapshot;
    const decision = decisions[proposal.proposalId];
    const unavailable = !current && !decision;
    return <article className={`proposal-card ${decision ? "decided" : ""}`} key={proposal.proposalId}>
      <div className="proposal-top"><span className={`status-tag ${decision === "approved" ? "green" : ""}`}><span className="tiny-dot"/>{decision === "approved" ? "Assigned" : decision === "rejected" ? "Dismissed" : unavailable ? "No longer pending" : "Awaiting your approval"}</span><span className="point-pill">{proposal.points} pts</span></div>
      <h3>{proposal.taskTitle}</h3>
      <div className="assignment-detail"><span className={`avatar avatar-${board.members.findIndex((m) => m.id === proposal.memberId) % 3}`}>{proposal.memberName.slice(0, 1)}</span><strong>{proposal.memberName}</strong><span className="capacity-change">{proposal.current} <span aria-hidden="true">→</span> {proposal.projected} / {proposal.max} pts</span></div>
      {!decision && !unavailable && <div className="proposal-buttons"><button className="primary small" onClick={() => void decide(proposal, true)} disabled={!!busyProposal || sending || proposal.projected > proposal.max}><Icon name="check" size={15}/>{busyProposal === proposal.proposalId ? "Working…" : "Approve"}</button><button className="text-button" disabled={!!busyProposal || sending} onClick={() => { if (csrf) void decide(proposal, false); else setSetupOpen(true); }}>Dismiss</button>{!csrf && <span className="approval-hint">Enable approvals first</span>}</div>}
    </article>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="SprintBoard home"><span className="brand-icon"><Icon name="board" size={23}/></span>Sprint<span>board</span><span className="brand-dot">.</span></a>
      <div className="workspace-switch"><span className="workspace-avatar">S</span><div><strong>Workshop workspace</strong><small>Group 06 · IIT Workshop</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={view === "chat" ? "nav-item active" : "nav-item"} onClick={() => setView("chat")}><Icon name="spark"/>Sprint assistant<span className="nav-badge">AI</span></button>
        <button className={view === "board" ? "nav-item active" : "nav-item"} onClick={() => setView("board")}><Icon name="board"/>Sprint board<span className="nav-count">{board.tasks.length}</span></button>
        <button className={view === "review" ? "nav-item active" : "nav-item"} onClick={() => setView("review")}><Icon name="check"/>Approvals{proposals.length > 0 && <span className="nav-count pending-count">{proposals.length}</span>}</button>
      </nav>
      <button className="new-chat" disabled={sending} onClick={() => { setMessages([]); setDraft(""); setView("chat"); setFeedback(null); composerRef.current?.focus(); }}><Icon name="plus" size={17}/>New conversation</button>
      <div className="sidebar-bottom"><div className="guard-card"><Icon name="shield" size={21}/><strong>A balanced sprint. Always.</strong><p>At most 8 points per person.<br/>Every assignment needs your OK.</p></div><div className="profile"><span className="profile-avatar">Y</span><div><strong>Your workspace</strong><small>Team lead</small></div><span className="online-dot"/></div></div>
    </aside>

    <div className="workspace-main">
      <header className="topbar"><div className="breadcrumbs">Workspace <Icon name="chevron" size={13}/><strong>{view === "chat" ? "Sprint assistant" : view === "board" ? "Sprint board" : "Approvals"}</strong></div><div className="header-actions"><span className="guard-badge"><Icon name="shield" size={14}/>8-point guardrail</span><button className="icon-button" aria-label="Refresh board" title="Refresh board" disabled={refreshing} onClick={() => void refresh()}><Icon name="refresh" size={18}/></button></div></header>
      <div className="workspace-columns">
        <main className="conversation-pane" id="main-content">
          <div className="pane-heading"><div className="assistant-identity"><span className="assistant-icon"><Icon name="spark" size={20}/></span><div><h1>{view === "chat" ? "Sprint assistant" : view === "board" ? "Your sprint board" : "Review proposals"}</h1><p>{view === "chat" ? "A little less planning. A lot more building." : view === "board" ? "The whole sprint, in one place." : "You make the final call."}</p></div></div><span className="mode-badge"><span className={boardError ? "offline-dot" : "online-dot"}/>{boardError ? "Board offline" : model.mode === "llm" ? "Model connected" : "Local planner"}</span></div>
          {boardError && <div className="notice error" role="alert"><span>{boardError}</span><button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Retrying…" : "Reconnect"}</button></div>}
          {feedback && <div className={`notice ${feedback.error ? "error" : "success"}`} role="status"><span>{feedback.text}</span><button aria-label="Dismiss notification" onClick={() => setFeedback(null)}><Icon name="close" size={15}/></button></div>}
          {proposalError && <div className="notice error" role="alert"><span>{proposalError}</span><button onClick={() => void refreshProposals()}>Retry proposals</button></div>}

          {view === "chat" ? <>
            <div className={`chat-scroll ${messages.length ? "has-messages" : ""}`}>
              {messages.length === 0 ? <div className="welcome"><span className="welcome-symbol"><Icon name="spark" size={34}/></span><span className="eyebrow">YOUR SPRINT, SORTED</span><h2>Good work starts with<br/>a balanced plan<span>.</span></h2><p>Tell me what needs to get done. I’ll find the capacity,<br className="desktop-break"/> suggest assignments, and leave the final call to you.</p><div className="suggestion-cards">{prompts.map((prompt) => <button key={prompt.title} onClick={() => void submitMessage(prompt.message)} disabled={sending || !!boardError}><Icon name={prompt.icon} size={21}/><strong>{prompt.title}</strong><span>{prompt.detail}</span><span className="card-arrow">↗</span></button>)}</div><div className="welcome-note"><Icon name="shield" size={14}/><span>Suggestions first. Your approval, always.</span></div></div> : <div className="transcript" role="log" aria-live="polite" aria-relevant="additions">{messages.map((entry) => <article className={`chat-entry ${entry.role}`} key={entry.id}><span className={entry.role === "assistant" ? "message-avatar bot" : "message-avatar human"}>{entry.role === "assistant" ? <Icon name="spark" size={17}/> : "Y"}</span><div className="message-body"><div className="message-label">{entry.role === "assistant" ? "Sprint assistant" : "You"}{entry.role === "assistant" && <span>{model.mode === "llm" ? model.model ?? "AI planner" : "Local planner"}</span>}</div><div className={`message-content ${entry.failed ? "message-error" : ""}`}>{entry.content}</div>{entry.failed && <button className="text-button" onClick={() => { const index = messages.findIndex((m) => m.id === entry.id); const request = messages.slice(0, index).reverse().find((m) => m.role === "user"); if (request) void submitMessage(request.content); }} disabled={sending}>Try again</button>}{entry.proposals && entry.proposals.length > 0 && <div className="proposal-list">{entry.proposals.map(proposalCard)}</div>}{entry.refusals?.map((refusal, index) => <div className="refusal-card" key={index}><strong>{refusal.taskTitle} · {refusal.memberName}</strong><p>{refusal.reason}</p></div>)}</div></article>)}</div>}
              {sending && <div className="thinking" role="status"><span className="message-avatar bot"><Icon name="spark" size={17}/></span><span className="thinking-dots"><i/><i/><i/></span><span>Checking the board and team capacity…</span></div>}
              <div ref={bottomRef}/>
            </div>
            <div className="composer-area">{proposals.length > 0 && <button className="pending-banner" onClick={() => setView("review")}><span><span className="tiny-dot"/>{proposals.length} proposal{proposals.length === 1 ? "" : "s"} waiting for your review</span><span>Review <Icon name="chevron" size={13}/></span></button>}<form className="composer" onSubmit={(event) => { event.preventDefault(); void submitMessage(draft); }}><label className="sr-only" htmlFor="chat-message">Message Sprint assistant</label><textarea ref={composerRef} id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={composerKey} placeholder="What should we work on this sprint?" rows={2} maxLength={4000} disabled={sending}/><div className="composer-toolbar"><span><Icon name="spark" size={14}/>{model.mode === "llm" ? model.model ?? "AI planner" : "Local planner"}</span><button className="send-button" type="submit" aria-label="Send message" disabled={sending || !draft.trim() || !!boardError}><Icon name="arrow" size={19}/></button></div></form><div className="composer-caption"><span>Enter to send <span className="caption-separator">·</span> Shift + Enter for a new line</span><span>Nothing saves without approval</span></div></div>
          </> : <div className="board-scroll">{view === "review" ? <><div className="section-title"><h2>Pending approval <span>{proposals.length}</span></h2><p>Review each task, assignee, and capacity before saving.</p></div>{!csrf && proposals.length > 0 && <div className="notice"><span>Enable approvals to save or dismiss a proposal.</span><button onClick={() => setSetupOpen(true)}>Enable approvals</button></div>}{proposals.length ? <div className="review-grid">{proposals.map(proposalCard)}</div> : <div className="empty-state"><Icon name="check" size={32}/><h3>All caught up.</h3><p>Ask the assistant to plan your sprint. Proposals will appear here for your review.</p><button className="primary" onClick={() => setView("chat")}>Open assistant</button></div>}</> : <><div className="board-stats"><div><strong>{board.tasks.length}</strong><span>Total tasks</span></div><div><strong>{backlog.length}</strong><span>In backlog</span></div><div><strong>{assigned}</strong><span>Assigned</span></div><div><strong>{assignedPoints}<small> / {totalPoints}</small></strong><span>Points planned</span></div></div><div className="section-title"><h2>Backlog <span>{backlog.length}</span></h2><p>Choose a member to preview capacity and request an assignment.</p></div><div className="board-task-list">{backlog.map((task) => <article className="board-task" key={task.id}><div className="board-task-title"><span className="task-square"/><h3>{task.title}</h3><span className="point-pill">{task.points} pts</span></div><p>{task.description}</p><div className="board-task-actions"><label className="sr-only" htmlFor={`member-${task.id}`}>Assign {task.title} to</label><select id={`member-${task.id}`} value={selected[task.id] ?? ""} onChange={(event) => void selectMember(task, event.target.value)}><option value="">Choose a member</option>{board.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select>{previews[task.id] && <span className={previews[task.id]?.ok ? "text-green" : "text-error"}>{previews[task.id]?.projected}/{previews[task.id]?.max} pts{!previews[task.id]?.ok && " · over capacity"}</span>}<button className="primary small" disabled={!previews[task.id]?.ok || !!busyTask || proposals.some((p) => p.taskId === task.id)} onClick={() => void manualProposal(task)}>{busyTask === task.id ? "Requesting…" : proposals.some((p) => p.taskId === task.id) ? "Pending review" : "Request approval"}</button></div></article>)}</div>{!backlog.length && <p className="muted">Every task is assigned.</p>}<div className="section-title assigned-heading"><h2>Assigned <span>{assigned}</span></h2></div>{board.tasks.filter((task) => task.assignee !== null).map((task) => <div className="assigned-row" key={task.id}><span className="assigned-check"><Icon name="check" size={14}/></span><strong>{task.title}</strong><span>{board.members.find((m) => m.id === task.assignee)?.name}</span><span className="point-pill">{task.points} pts</span></div>)}</>}</div>}
        </main>

        <aside className="context-pane" aria-label="Sprint context"><div className="context-title"><h2>Sprint overview</h2><span className="live-label"><span className={boardError ? "offline-dot" : "online-dot"}/>{boardError ? "Offline" : "Live"}</span></div><div className="sprint-summary"><span className="eyebrow">CURRENT SPRINT</span><h3>Make room for great work.</h3><div className="summary-numbers"><div><strong>{board.tasks.length}</strong><span>tasks</span></div><div><strong>{totalPoints}</strong><span>story points</span></div><div><strong>{board.members.length}</strong><span>members</span></div></div><div className="sprint-progress"><span style={{ width: `${totalPoints ? Math.min(100, assignedPoints / totalPoints * 100) : 0}%` }}/></div><div className="sprint-progress-label"><span>{assigned} of {board.tasks.length} tasks assigned</span><span>{totalPoints ? Math.round(assignedPoints / totalPoints * 100) : 0}%</span></div></div>
          <section className="team-section"><div className="context-section-heading"><h3>Team capacity</h3><span>Max 8 pts / person</span></div>{board.members.map((member, index) => <div className="team-member" key={member.id}><span className={`avatar avatar-${index % 3}`}>{member.name.slice(0, 1)}</span><div className="member-info"><div><strong>{member.name}</strong><span>{member.points}<span className="muted"> / 8 pts</span></span></div><div className="capacity-bar"><span className={member.points >= 8 ? "full" : ""} style={{ width: `${Math.min(100, member.points / 8 * 100)}%` }}/></div></div></div>)}<div className="capacity-note"><span className="online-dot"/>{board.members.length ? `${Math.max(0, board.members.length * 8 - assignedPoints)} points available across the team` : "Waiting for the board connection"}</div></section>
          <section className="backlog-section"><div className="context-section-heading"><h3>In the backlog <span className="count-inline">{backlog.length}</span></h3><button className="text-button" onClick={() => setView("board")}>View all</button></div>{backlog.map((task) => <button className="backlog-item" key={task.id} onClick={() => { setDraft(`Assign ${task.title} to `); setView("chat"); composerRef.current?.focus(); }}><span className="task-square"/><span>{task.title}</span><span className="point-pill">{task.points}</span></button>)}{!backlog.length && <p className="muted">{boardError ? "Reconnect to see your tasks." : "All tasks have a home."}</p>}</section>
          <div className={`approval-settings ${csrf ? "enabled" : ""}`}><div><Icon name="shield" size={18}/><strong>{csrf ? "You’re ready to approve" : "You’re in control"}</strong></div><p>{csrf ? "Your browser can approve assignments. Every save still needs your click." : "The assistant proposes. You decide what makes it onto the board."}</p><button className="text-button" onClick={() => setSetupOpen(true)}>{csrf ? "Approval settings" : "Enable approvals"}<Icon name="chevron" size={13}/></button></div>
          <div className="context-footer"><Icon name="shield" size={13}/><span>Capacity checked on every assignment</span></div>
        </aside>
      </div>
    </div>

    {setupOpen && <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSetupOpen(false); }}><section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title" onKeyDown={(event) => { if (event.key === "Escape") setSetupOpen(false); }}><button className="dialog-close icon-button" aria-label="Close approval settings" onClick={() => setSetupOpen(false)}><Icon name="close"/></button><span className="welcome-symbol small-symbol"><Icon name="shield" size={26}/></span><h2 id="setup-title">{csrf ? "Approvals are enabled" : "Make the final call."}</h2><p>{csrf ? "This browser is authorized to approve and dismiss proposals. The assistant can never approve for you." : "Enter the one-time setup code from the backend terminal. This enables approval in this browser."}</p>{!csrf && <form onSubmit={enableApproval} autoComplete="off"><label htmlFor="setup-code">Approval setup code</label><input autoFocus id="setup-code" type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" required placeholder="Paste your one-time code"/><button className="primary" disabled={setupBusy || !code.trim()} type="submit">{setupBusy ? "Enabling…" : "Enable approvals"}<Icon name="chevron" size={16}/></button></form>}{setupError && <p className="text-error" role="alert">{setupError}</p>}{csrf && <button className="primary" onClick={() => setSetupOpen(false)}>Back to planning</button>}</section></div>}
  </div>;
}
