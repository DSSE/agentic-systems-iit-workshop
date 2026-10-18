import { RuleError, INVALID_REQUEST, assertWithinCap, lineAmount, sumAmounts } from './domain.js';
import { issueApprovalToken } from './approval.js';
import { addExpense } from './tools.js';
import {
  allProposals,
  getProposal,
  newProposalId,
  pendingProposals,
  readData,
  saveProposal,
} from './store.js';

// Creates a pending proposal. Nothing is saved. Fails with the rule code if the
// expense, on top of saved spending and other pending proposals, goes over the cap.
// Agents and the MCP server may call this, but never approveProposal.
export function createProposal({ vendorId, quantity }) {
  const data = readData();
  const vendor = data.vendors.find((v) => v.id === vendorId);
  if (!vendor) throw new RuleError('UNKNOWN_VENDOR', `Unknown vendor: ${vendorId}`, { vendorId });
  const amount = lineAmount(vendor, quantity);
  const committed = sumAmounts(data.expenses) + sumAmounts(pendingProposals());
  assertWithinCap({ cap: data.cap, committed, amount });

  return saveProposal({
    id: newProposalId(),
    vendorId: vendor.id,
    vendorName: vendor.name,
    item: vendor.item,
    quantity,
    unitPrice: vendor.unitPrice,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

export function listProposals() {
  return allProposals();
}

// Only the UI Approve button (through the API) calls this.
export function approveProposal(id) {
  const proposal = getProposal(id);
  if (!proposal) throw new RuleError(INVALID_REQUEST, `No such proposal: ${id}`, { id });
  if (proposal.status !== 'pending') {
    throw new RuleError(INVALID_REQUEST, `Proposal ${id} is already ${proposal.status}.`, { id });
  }
  const expense = addExpense({
    vendorId: proposal.vendorId,
    quantity: proposal.quantity,
    approvalToken: issueApprovalToken(),
  });
  proposal.status = 'approved';
  proposal.expenseId = expense.id;
  return { proposal, expense };
}

export function rejectProposal(id) {
  const proposal = getProposal(id);
  if (!proposal) throw new RuleError(INVALID_REQUEST, `No such proposal: ${id}`, { id });
  if (proposal.status !== 'pending') {
    throw new RuleError(INVALID_REQUEST, `Proposal ${id} is already ${proposal.status}.`, { id });
  }
  proposal.status = 'rejected';
  return proposal;
}
