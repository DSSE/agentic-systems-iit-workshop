import { FormEvent, useState } from 'react';
import { chat, ChatTurn, createLoan, Proposal } from './api';

interface Props {
  studentId: string;
  onSaved: () => void;
}

// A chat with the agent. The agent can only propose: the Approve button below
// is the one place this panel saves a loan, through the same API as the form.
export function Chat({ studentId, onSaved }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'refused'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    const next: ChatTurn[] = [...turns, { role: 'user', content: message }];
    setTurns(next);
    setText('');
    setProposal(null);
    setNotice(null);
    setBusy(true);
    try {
      const out = await chat(next, studentId.trim());
      setTurns([...next, { role: 'assistant', content: out.reply }]);
      setProposal(out.proposal ?? null);
    } catch (err) {
      setNotice({ kind: 'refused', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!proposal) return;
    setBusy(true);
    try {
      const result = await createLoan(proposal);
      if (result.ok) {
        setNotice({ kind: 'ok', text: `Saved: ${proposal.quantity} × ${proposal.itemName} for ${proposal.days} days.` });
        setProposal(null);
        onSaved();
      } else {
        setNotice({ kind: 'refused', text: result.violations.map((v) => `${v.code}: ${v.reason}`).join(' ') });
        setProposal(null);
      }
    } catch (err) {
      setNotice({ kind: 'refused', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Ask the agent</h2>
      <div className="chat-log" aria-live="polite">
        {turns.length === 0 && <p className="hint">Try: “I need two Arduino kits for my project next week.”</p>}
        {turns.map((t, i) => (
          <p key={i} className={`turn ${t.role}`}>
            <strong>{t.role === 'user' ? 'You' : 'Agent'}:</strong> {t.content}
          </p>
        ))}
        {busy && <p className="hint">Thinking…</p>}
      </div>

      {proposal && (
        <div className="box ok" role="status">
          <p>
            <strong>Loan proposal:</strong> {proposal.quantity} × {proposal.itemName} for {proposal.days} days, for {proposal.studentId}.
          </p>
          <button onClick={onApprove} disabled={busy}>Approve</button>{' '}
          <button className="secondary" onClick={() => setProposal(null)} disabled={busy}>Cancel</button>
        </div>
      )}
      {notice && (
        <div className={`box ${notice.kind}`} role={notice.kind === 'ok' ? 'status' : 'alert'}>{notice.text}</div>
      )}

      <form className="chat-form" onSubmit={onSend}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask for equipment in plain words"
          aria-label="Message to the agent"
        />
        <button type="submit" disabled={busy || !text.trim() || !studentId.trim()}>Send</button>
      </form>
    </section>
  );
}
