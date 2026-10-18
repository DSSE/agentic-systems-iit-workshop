"use client";

import { useState } from "react";

import RuleBox from "@/components/RuleBox";
import { api } from "@/lib/api";
import { fmtDay, fmtTime } from "@/lib/time";
import type { ChatMessage, Proposal, RuleResult } from "@/lib/types";

const EXAMPLES = [
  "Book a lab for 3 people Thursday afternoon.",
  "Book a room for tomorrow.",
  "Book Lab-2 for 5 hours.",
];

// The backend takes at most 40 messages of 4000 characters; send only the recent part of the conversation.
const HISTORY_LIMIT = 20;
const MAX_MESSAGE_LENGTH = 4000;

type Entry = { message: ChatMessage; proposals: Proposal[]; failed?: boolean };

function recentHistory(entries: Entry[], question: ChatMessage): ChatMessage[] {
  const history = [...entries.filter((e) => !e.failed).map((e) => e.message), question].slice(-HISTORY_LIMIT);
  const firstUser = history.findIndex((m) => m.role === "user");
  return history.slice(firstUser);
}
type Props = { onProposed: () => void; onDecided: () => void };

export default function Chat({ onProposed, onDecided }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, RuleResult>>({});

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const question: ChatMessage = { role: "user", content };
    const history = recentHistory(entries, question);
    setEntries((list) => [...list, { message: question, proposals: [] }]);
    setDraft("");
    setBusy(true);
    const outcome = await api.chat(history);
    setBusy(false);
    if (!outcome.ok) {
      // Shown, but never sent back to the model as something the assistant said.
      const notice: ChatMessage = { role: "assistant", content: outcome.refusal.message };
      setEntries((list) => [...list, { message: notice, proposals: [], failed: true }]);
      return;
    }
    const answer = outcome.data;
    setEntries((list) => [...list, { message: { role: "assistant", content: answer.reply }, proposals: answer.proposals }]);
    if (answer.proposals.length > 0) onProposed();
  }

  async function decide(proposal: Proposal, approve: boolean) {
    setDeciding(proposal.proposal_id);
    const outcome = approve ? await api.approve(proposal.proposal_id) : await api.reject(proposal.proposal_id);
    setDeciding(null);
    const result: RuleResult = outcome.ok
      ? { ok: true, rule_code: null, message: approve ? `Saved in ${proposal.room_name}.` : "Rejected.", suggestion: null }
      : outcome.refusal;
    setDecided((all) => ({ ...all, [proposal.proposal_id]: result }));
    onDecided();
  }

  return (
    <section className="panel wide">
      <h2>Chat</h2>
      <p className="muted">Ask in plain words. The assistant can only propose; nothing is saved until you click Approve.</p>
      <ul className="chat-log">
        {entries.map((entry, i) => (
          <li key={i} className={`bubble ${entry.message.role}${entry.failed ? " failed" : ""}`}>
            <p>{entry.message.content}</p>
            {entry.proposals.map((p) => (
              <div key={p.proposal_id} className="card">
                <div>
                  <strong>{p.room_name}</strong> · {fmtDay(p.start)} {fmtTime(p.start)}–{fmtTime(p.end)} · {p.group_size} people
                </div>
                {decided[p.proposal_id] ? (
                  <RuleBox result={decided[p.proposal_id]} />
                ) : (
                  <div className="actions">
                    <button type="button" onClick={() => void decide(p, true)} disabled={deciding !== null}>
                      {deciding === p.proposal_id ? "Saving…" : "Approve"}
                    </button>
                    <button type="button" className="secondary" onClick={() => void decide(p, false)} disabled={deciding !== null}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </li>
        ))}
        {busy && <li className="bubble assistant muted">Thinking…</li>}
      </ul>
      <div className="chips">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="secondary" onClick={() => setDraft(example)} disabled={busy}>
            {example}
          </button>
        ))}
      </div>
      <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Book a lab for…"
          aria-label="Message"
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <button type="submit" disabled={busy || !draft.trim()}>Send</button>
      </form>
    </section>
  );
}
