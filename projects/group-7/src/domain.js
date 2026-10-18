// The hard rule lives here and nowhere else:
// total spending never goes over the budget cap.
// The API, the MCP server and the agent all call this module.

export const BUDGET_CAP_EXCEEDED = 'BUDGET_CAP_EXCEEDED';
export const INVALID_REQUEST = 'INVALID_REQUEST';
export const UNKNOWN_VENDOR = 'UNKNOWN_VENDOR';
export const NOT_APPROVED = 'NOT_APPROVED';

export class RuleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
    this.details = details;
  }
}

export function validateQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RuleError(INVALID_REQUEST, 'Quantity must be a positive whole number.', { quantity });
  }
}

export function lineAmount(vendor, quantity) {
  validateQuantity(quantity);
  return vendor.unitPrice * quantity;
}

export function sumAmounts(items) {
  return items.reduce((total, item) => total + item.amount, 0);
}

// Pure check: does `amount` fit under `cap` on top of what is already committed?
// `committed` is saved spending plus any pending proposals.
export function checkAmount({ cap, committed, amount }) {
  const remaining = cap - committed;
  const fits = amount <= remaining;
  return {
    fits,
    code: fits ? null : BUDGET_CAP_EXCEEDED,
    cap,
    committed,
    amount,
    remaining,
    remainingAfter: remaining - amount,
    overBy: fits ? 0 : amount - remaining,
  };
}

export function assertWithinCap({ cap, committed, amount }) {
  const result = checkAmount({ cap, committed, amount });
  if (!result.fits) {
    throw new RuleError(
      BUDGET_CAP_EXCEEDED,
      `Budget cap exceeded: ${amount} would bring the total to ${committed + amount}, over the cap of ${cap} (${result.remaining} left).`,
      result,
    );
  }
  return result;
}

export function maxAffordableQuantity({ cap, committed, unitPrice }) {
  return Math.max(0, Math.floor((cap - committed) / unitPrice));
}
