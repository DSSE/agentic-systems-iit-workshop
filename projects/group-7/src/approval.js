// Approval tokens. Only the approve flow (UI button / API) issues one, and
// add_expense consumes it. Agents and the MCP server never get a token, so they
// can propose an expense but cannot save it.

const tokens = new Set();

export function issueApprovalToken() {
  const token = crypto.randomUUID();
  tokens.add(token);
  return token;
}

export function consumeApprovalToken(token) {
  if (typeof token !== 'string' || !tokens.has(token)) return false;
  tokens.delete(token);
  return true;
}
