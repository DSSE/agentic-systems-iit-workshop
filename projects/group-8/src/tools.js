import { randomUUID, randomBytes } from 'node:crypto';
import { failure, labToday, validateLoan, validDate, availableQuantity } from './domain.js';
import { createStore, StorageError } from './store.js';

const token = () => randomBytes(32).toString('hex');
const TTL = 10 * 60 * 1000;

export function createTools({ dataPath, now = () => new Date(), timezone = 'Asia/Dhaka' }) {
  const store = createStore(dataPath);
  const proposals = new Map();
  const approvals = new Map();
  const today = () => labToday(now(), timezone);
  const expired = () => failure('PROPOSAL_EXPIRED', 'Proposal expired or unavailable. Check again and approve a fresh proposal.');
  const owns = (entry, context) => entry && entry.session_id === context?.session_id
    && entry.proposal.student_id === context?.student_id;
  const cleanup = () => {
    for (const [id, entry] of proposals) if (entry.expires <= now().getTime()) proposals.delete(id);
    for (const [id, entry] of approvals) if (!proposals.has(entry.proposal_id)) approvals.delete(id);
  };
  const guard = (operation) => async (...args) => {
    try { return await operation(...args); }
    catch (error) {
      if (error instanceof StorageError) return failure('STORAGE_ERROR', error.message);
      throw error;
    }
  };

  const list_equipment = guard(async ({ query = '', start_date, due_date } = {}) => {
    if (typeof query !== 'string') return failure('INVALID_INPUT', 'Search must be text.');
    const currentDate = today();
    if (start_date === undefined && due_date === undefined) {
      start_date = currentDate;
      const tomorrow = new Date(`${currentDate}T00:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      due_date = tomorrow.toISOString().slice(0, 10);
    }
    if (!validDate(start_date) || !validDate(due_date) || start_date < currentDate || due_date <= start_date) {
      return failure('INVALID_INPUT', 'Choose valid availability dates, starting today or later with return after start.');
    }
    const data = await store.load();
    return { ok: true, start_date, due_date,
      equipment: data.equipment.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()))
        .map((item) => ({ ...item, available_quantity: availableQuantity(item, data, start_date, due_date, currentDate) })),
    };
  });

  const check_stock = guard(async (input, context) => {
    cleanup();
    if (!context?.session_id || !context.student_id || input?.student_id !== context.student_id) {
      return failure('INVALID_INPUT', 'Use the student ID selected in this session.');
    }
    const checked = validateLoan(input, await store.load(), today());
    if (!checked.ok) return checked;
    if (proposals.size >= 1000) return failure('INVALID_INPUT', 'Too many pending proposals. Please wait before checking again.');
    const proposal_id = randomUUID();
    const expires = now().getTime() + TTL;
    const proposal = { ...checked.proposal, items: checked.proposal.items.map((item) => ({
      ...item, name: checked.availability.find((entry) => entry.equipment_id === item.equipment_id).name,
    })) };
    proposals.set(proposal_id, { proposal: structuredClone(proposal), session_id: context.session_id, expires });
    return { ...checked, proposal, proposal_id, expires_at: new Date(expires).toISOString() };
  });

  // Trusted human UI handler only. Do not expose this helper as an agent/MCP tool.
  function approveProposal(proposal_id, context) {
    cleanup();
    const entry = proposals.get(proposal_id);
    if (!owns(entry, context)) return expired();
    if (entry.approval_token) return failure('APPROVAL_REQUIRED', 'This proposal already has an approval attempt. Check again.');
    const approval_token = token();
    entry.approval_token = approval_token;
    approvals.set(approval_token, { proposal_id, session_id: context.session_id, approved_at: now().toISOString() });
    return { ok: true, approval_token };
  }

  const create_loan = guard(async (input, context) => {
    cleanup();
    const approval = approvals.get(input?.approval_token);
    if (!approval || approval.proposal_id !== input?.proposal_id || approval.session_id !== context?.session_id) {
      return failure('APPROVAL_REQUIRED', 'Explicit human approval of this exact proposal is required.');
    }
    const entry = proposals.get(input.proposal_id);
    if (!owns(entry, context)) return expired();
    // Consume before awaiting storage so simultaneous calls and retries cannot replay approval.
    approvals.delete(input.approval_token);
    proposals.delete(input.proposal_id);
    return store.transaction(async (data) => {
      const checked = validateLoan(entry.proposal, data, today());
      if (!checked.ok) return checked;
      const loan = {
        id: randomUUID(), student_id: checked.proposal.student_id,
        items: checked.proposal.items, start_date: checked.proposal.start_date, due_date: checked.proposal.due_date,
        status: 'active', approved_at: approval.approved_at, created_at: now().toISOString(),
      };
      data.loans.push(loan);
      return { ok: true, loan };
    });
  });

  function cancelProposal(proposal_id, context) {
    const entry = proposals.get(proposal_id);
    if (!owns(entry, context)) return expired();
    if (entry.approval_token) approvals.delete(entry.approval_token);
    proposals.delete(proposal_id);
    return { ok: true };
  }

  const listLoans = guard(async (context) => {
    const data = await store.load();
    return { ok: true, loans: data.loans.filter((loan) => loan.student_id === context.student_id), equipment: data.equipment };
  });
  return { list_equipment, check_stock, create_loan, approveProposal, cancelProposal, listLoans, today };
}
