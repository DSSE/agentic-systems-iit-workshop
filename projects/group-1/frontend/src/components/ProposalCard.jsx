export default function ProposalCard({ proposal, onApprove, onCancel, busy }) {
  const day = proposal.start.slice(0, 10);
  return (
    <div className="proposal" role="region" aria-label="Booking proposal">
      <h3>Booking proposal</h3>
      <dl>
        <dt>Room</dt>
        <dd>{proposal.room_id}</dd>
        <dt>When</dt>
        <dd>
          {day} {proposal.start.slice(11, 16)}–{proposal.end.slice(11, 16)}
        </dd>
        <dt>Group</dt>
        <dd>
          {proposal.group_size} people · {proposal.requester}
        </dd>
        {proposal.purpose && (
          <>
            <dt>Purpose</dt>
            <dd>{proposal.purpose}</dd>
          </>
        )}
      </dl>
      <p className="hint">Nothing is saved until you press Approve.</p>
      <div className="actions">
        <button type="button" className="approve" onClick={onApprove} disabled={busy}>
          Approve
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
