// Harness-side guardrails (phase 7). The domain module already enforces the
// cap for every client; these stop the agent from being steered or looping.
// Turn off for eval comparisons with CLUBOPS_GUARDRAILS=off (the cap stays on).

import { sanitizeText } from "../domain/budget.js";

export const MAX_STEPS = Number(process.env.CLUBOPS_MAX_STEPS) || 8;
export const MAX_PROPOSALS_PER_TURN = 4;
export const enabled = () => process.env.CLUBOPS_GUARDRAILS !== "off";

/**
 * Defence in depth against prompt injection: scan every string in a tool
 * result and remove instruction-like sentences before the model sees it.
 * (Our MCP server already does this for vendor text; this also covers any
 * other MCP server the harness might be pointed at.)
 */
export function scrubToolResult(value, found = []) {
  if (typeof value === "string") {
    if (value.length < 12) return value;
    const s = sanitizeText(value);
    if (s.flagged) {
      found.push(...s.removed);
      return s.text;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrubToolResult(v, found));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === "message" || k === "code" ? v : scrubToolResult(v, found);
    return out;
  }
  return value;
}

/** Output guard: the agent may never say something was saved; only Approve saves. */
const CLAIMS_SAVED = /\b(has|have|was|were|is|are|been)\s+(now\s+)?(saved|approved|booked|paid|confirmed|recorded)\b|\bI\s+(saved|approved|booked|paid)\b/i;
export function checkReply(text, { approvedThisTurn = false } = {}) {
  if (!approvedThisTurn && CLAIMS_SAVED.test(text) && !/not (yet )?(saved|approved)/i.test(text)) {
    return text + "\n\n(Note: nothing is saved until a person clicks Approve.)";
  }
  return text;
}
