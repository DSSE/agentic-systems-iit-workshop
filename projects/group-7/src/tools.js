import {
  NOT_APPROVED,
  RuleError,
  UNKNOWN_VENDOR,
  assertWithinCap,
  checkAmount,
  lineAmount,
  maxAffordableQuantity,
  sumAmounts,
} from './domain.js';
import { consumeApprovalToken } from './approval.js';
import { pendingProposals, readData, writeData } from './store.js';

function findVendor(data, vendorId) {
  const vendor = data.vendors.find((v) => v.id === vendorId);
  if (!vendor) throw new RuleError(UNKNOWN_VENDOR, `Unknown vendor: ${vendorId}`, { vendorId });
  return vendor;
}

export function listVendors() {
  const { vendors, currency } = readData();
  return { currency, vendors };
}

export function budgetSummary() {
  const data = readData();
  const spent = sumAmounts(data.expenses);
  const pending = sumAmounts(pendingProposals());
  return {
    event: data.event,
    currency: data.currency,
    cap: data.cap,
    spent,
    pending,
    remaining: data.cap - spent - pending,
    expenses: data.expenses,
  };
}

// Read-only: would this expense fit? Counts saved spending and pending proposals.
export function checkBudget({ vendorId, quantity }) {
  const data = readData();
  const vendor = findVendor(data, vendorId);
  const amount = lineAmount(vendor, quantity);
  const committed = sumAmounts(data.expenses) + sumAmounts(pendingProposals());
  const result = checkAmount({ cap: data.cap, committed, amount });
  return {
    ...result,
    vendor: vendor.name,
    item: vendor.item,
    maxQuantity: maxAffordableQuantity({ cap: data.cap, committed, unitPrice: vendor.unitPrice }),
  };
}

// Saves an expense. Needs an approval token, and re-checks the cap against the
// saved total itself, whether or not check_budget was called first.
export function addExpense({ vendorId, quantity, approvalToken }) {
  if (!consumeApprovalToken(approvalToken)) {
    throw new RuleError(NOT_APPROVED, 'An expense can only be saved after a person approves it.');
  }
  const data = readData();
  const vendor = findVendor(data, vendorId);
  const amount = lineAmount(vendor, quantity);
  assertWithinCap({ cap: data.cap, committed: sumAmounts(data.expenses), amount });

  const expense = {
    id: `e${data.expenses.length + 1}`,
    vendorId: vendor.id,
    vendorName: vendor.name,
    item: vendor.item,
    quantity,
    unitPrice: vendor.unitPrice,
    amount,
    approvedAt: new Date().toISOString(),
  };
  data.expenses.push(expense);
  writeData(data);
  return expense;
}
