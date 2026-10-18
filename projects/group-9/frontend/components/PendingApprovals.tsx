"use client";

import { useEffect, useState } from "react";

import RuleBox from "@/components/RuleBox";
import { api } from "@/lib/api";
import { fmtDay, fmtTime } from "@/lib/time";
import type { Proposal, RuleResult } from "@/lib/types";

const POLL_MS = 3000;

type Props = { version: number; onDecided: () => void };

export default function PendingApprovals({ version, onDecided }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [last, setLast] = useState<RuleResult | null>(null);
  // One decision at a time, so a double click cannot send a second approve.
  const [deciding, setDeciding] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    api.pending().then((outcome) => {
      if (active && outcome.ok) setProposals(outcome.data);
    });
    return () => {
      active = false;
    };
  }, [version, tick]);

  async function approve(proposal: Proposal) {
    setDeciding(proposal.proposal_id);
    const outcome = await api.approve(proposal.proposal_id);
    setDeciding(null);
    setLast(
      outcome.ok
        ? { ok: true, rule_code: null, message: `Saved booking ${outcome.data.id} in ${proposal.room_name}.`, suggestion: null }
        : outcome.refusal,
    );
    onDecided();
    reload();
  }

  async function reject(proposal: Proposal) {
    setDeciding(proposal.proposal_id);
    const outcome = await api.reject(proposal.proposal_id);
    setDeciding(null);
    if (!outcome.ok) setLast(outcome.refusal);
    reload();
  }

  return (
    <section className="panel">
      <h2>Pending approvals</h2>
      <p className="muted">Proposals from the form, the chat and MCP agents. Only Approve saves a booking.</p>
      {last && <RuleBox result={last} />}
      {proposals.length === 0 ? (
        <p className="muted">No pending proposals.</p>
      ) : (
        <ul className="cards">
          {proposals.map((p) => (
            <li key={p.proposal_id} className="card">
              <div>
                <strong>{p.room_name}</strong> · {fmtDay(p.start)} {fmtTime(p.start)}–{fmtTime(p.end)}
              </div>
              <div className="muted">
                {p.group_size} people · {p.booked_by} · <span className="badge">{p.source}</span> · expires{" "}
                {fmtTime(p.expires_at)}
              </div>
              <div className="actions">
                <button type="button" onClick={() => void approve(p)} disabled={deciding !== null}>
                  {deciding === p.proposal_id ? "Saving…" : "Approve"}
                </button>
                <button type="button" className="secondary" onClick={() => void reject(p)} disabled={deciding !== null}>
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
