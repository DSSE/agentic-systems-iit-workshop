// Guardrail for prompt injection. Vendor terms are DATA written by third parties.
// Instruction-like sentences are removed before ANY client (UI, API, MCP, agent) sees them.
// This is defence in depth: even if text slipped through, the hard rule in budget.js still blocks overspending.

const SUSPICIOUS = [
  { reason: 'tries to change the budget cap', re: /\b(rais|increas|chang|lift|remov|bypass|disabl|overrid|set|adjust|updat|expand|extend)\w*\b[^.!?]{0,80}\b(cap|budget|limit|rule)s?\b|\b(cap|budget|spending limit)\b[^.!?]{0,45}\b(?:is|was|now|raised|increased|updated|set to|equals)\b[^.!?]{0,30}\d[\d,]*\s*(?:bdt|taka|tk)\b/i },
  { reason: 'tells the reader to add spending', re: /\b(add|book|order|pay|spend|approve|buy|purchase|use)\b[^.!?]{0,60}\d[\d,]*(?:\s*k)?\s*(bdt|taka|tk)\b/i },
  { reason: 'addresses the AI directly', re: /\b(ignore|disregard|forget)\b[^.!?]{0,30}\b(previous|above|instructions?|rules?)\b/i },
  { reason: 'fakes a system or assistant message', re: /\b(system|assistant|developer)\s*(prompt|message)?\s*:/i },
];

export const REDACTED = '[removed: instruction-like text in vendor data]';

/** @returns {{text:string, flagged:boolean, reasons:string[]}} */
export function screenUntrustedText(input) {
  const text = String(input ?? '');
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [];
  const reasons = new Set();
  const kept = sentences.map((s) => {
    const hit = SUSPICIOUS.filter((p) => p.re.test(s));
    if (hit.length === 0) return s.trim();
    hit.forEach((h) => reasons.add(h.reason));
    return REDACTED;
  });
  const collapsed = kept.filter((s, i) => s && !(s === REDACTED && kept[i - 1] === REDACTED));
  return { text: collapsed.join(' '), flagged: reasons.size > 0, reasons: [...reasons] };
}

export function cleanNote(note) {
  return String(note ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
}
