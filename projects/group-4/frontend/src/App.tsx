import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Chat } from './Chat';
import { checkStock, createLoan, Equipment, listEquipment, listLoans, Loan, LoanRequest, Proposal, Violation } from './api';

const MAX_ITEMS = 2;
const MAX_DAYS = 7;

export function App() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [studentId, setStudentId] = useState('s-1001');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [days, setDays] = useState(7);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [refusal, setRefusal] = useState<Violation[] | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await listEquipment();
    setEquipment(items);
    setItemId((current) => current || items[0]?.id || '');
    if (studentId.trim()) setLoans(await listLoans(studentId.trim()));
  }, [studentId]);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message ?? e)));
  }, [refresh]);

  const request = (): LoanRequest => ({ studentId: studentId.trim(), itemId, quantity, days });

  const clearResult = () => {
    setProposal(null);
    setRefusal(null);
    setSaved(null);
    setError(null);
  };

  async function onCheck(e: FormEvent) {
    e.preventDefault();
    clearResult();
    setBusy(true);
    try {
      const result = await checkStock(request());
      if (result.ok) setProposal(result.proposal);
      else setRefusal(result.violations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Only this button saves a loan.
  async function onApprove() {
    if (!proposal) return;
    setBusy(true);
    try {
      const result = await createLoan(proposal);
      setProposal(null);
      if (result.ok) {
        setSaved(`Saved: ${proposal.quantity} × ${proposal.itemName} for ${proposal.days} days.`);
        await refresh();
      } else {
        setRefusal(result.violations);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (id: string) => equipment.find((e) => e.id === id)?.name ?? id;
  const active = loans.filter((l) => l.status === 'active');

  return (
    <main>
      <h1>LabLend</h1>
      <p className="rule">
        <strong>Rule:</strong> a student has at most {MAX_ITEMS} items, for at most {MAX_DAYS} days. Nothing is saved until you approve.
      </p>

      <Chat studentId={studentId} onSaved={() => void refresh()} />

      <section>
        <h2>Equipment</h2>
        <table>
          <thead>
            <tr><th>Item</th><th>Available</th><th>Stock</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {equipment.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.available}</td>
                <td>{e.stock}</td>
                <td>{e.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Request a loan</h2>
        <form onSubmit={onCheck}>
          <label>
            Student ID
            <input value={studentId} onChange={(e) => { setStudentId(e.target.value); clearResult(); }} required />
          </label>
          <label>
            Item
            <select value={itemId} onChange={(e) => { setItemId(e.target.value); clearResult(); }}>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input type="number" min={1} value={quantity} onChange={(e) => { setQuantity(Number(e.target.value)); clearResult(); }} required />
          </label>
          <label>
            Days
            <input type="number" min={1} value={days} onChange={(e) => { setDays(Number(e.target.value)); clearResult(); }} required />
          </label>
          <button type="submit" disabled={busy || !itemId}>Check</button>
        </form>

        {proposal && (
          <div className="box ok" role="status">
            <p>
              <strong>Loan proposal:</strong> {proposal.quantity} × {proposal.itemName} for {proposal.days} days, for {proposal.studentId}.
            </p>
            <button onClick={onApprove} disabled={busy}>Approve</button>{' '}
            <button className="secondary" onClick={clearResult} disabled={busy}>Cancel</button>
          </div>
        )}
        {refusal && (
          <div className="box refused" role="alert">
            <p><strong>Refused</strong></p>
            <ul>
              {refusal.map((v) => (
                <li key={v.code}><code>{v.code}</code> {v.reason}</li>
              ))}
            </ul>
          </div>
        )}
        {saved && <div className="box ok" role="status">{saved}</div>}
        {error && <div className="box refused" role="alert">{error}</div>}
      </section>

      <section>
        <h2>Loans for {studentId.trim() || '…'}</h2>
        {active.length === 0 ? (
          <p>No active loans.</p>
        ) : (
          <ul>
            {active.map((l) => (
              <li key={l.id}>{l.quantity} × {nameOf(l.itemId)} for {l.days} days</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
