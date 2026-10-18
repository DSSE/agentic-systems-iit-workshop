// THE HARD RULE lives here and nowhere else:
//   total spending never goes over the budget cap.
// The API, the MCP server and the agent all reach this through store.js.
// Amounts are whole BDT (integers) so "1 BDT over" is exact.

export const OVER_BUDGET = 'OVER_BUDGET';
export const INVALID_AMOUNT = 'INVALID_AMOUNT';

export const sum = (list) => list.reduce((total, e) => total + e.amount, 0);

/**
 * @param {{cap:number, spent:number, pending:number}} s  approved spend, and proposals waiting for approval
 * @param {number} amount  the new expense in BDT
 */
export function checkBudget({ cap, spent, pending = 0 }, amount) {
  const committed = spent + pending;
  const base = { cap, spent, pending, committed, remaining: cap - committed, amount };
  if (!Number.isInteger(amount) || amount < 0) {
    return { ...base, ok: false, code: INVALID_AMOUNT, message: 'Amount must be a whole number of BDT, zero or more.' };
  }
  const total_after = committed + amount;
  if (total_after > cap) {
    return {
      ...base, ok: false, code: OVER_BUDGET, total_after, over_by: total_after - cap,
      message: `Refused (${OVER_BUDGET}): total would be ${total_after} BDT, which is ${total_after - cap} BDT over the ${cap} BDT cap.`,
    };
  }
  return { ...base, ok: true, total_after, message: `Within budget: total would be ${total_after} of ${cap} BDT.` };
}

/** Largest quantity of a unit-priced item that still fits. Used to suggest a smaller order. */
export function maxAffordableQuantity(remaining, unitPrice) {
  if (unitPrice <= 0 || remaining <= 0) return 0;
  return Math.floor(remaining / unitPrice);
}
