// Guardrails for untrusted task text (case C5). Pure functions, no I/O.
// They flag and hide text that reads like an instruction; HR-1 itself stays in domain/rules.js.

export const FLAG = 'instruction';
export const REDACTED = '[hidden by guardrail: this text reads like an instruction; it is data, not a command]';

// Each pattern is named so evals and tests can say which one matched.
const patterns = [
  ['assign-directive', /\bassign\s+(all|every|each|everything|the\s+rest|them)\b[^.]*\bto\b/i],
  ['already-checked', /\b(already|been)\s+(checked|approved|verified|validated|confirmed)\b/i],
  ['ignore-instructions', /\b(ignore|disregard|forget|override)\b[^.]*\b(previous|prior|above|earlier|instructions?|rules?|limits?)\b/i],
  ['role-marker', /(^|\s|\[|<)(system|assistant|developer)\s*[:>\]]/i],
  ['skip-check', /\b(skip|bypass|no\s+need\s+to|don'?t|do\s+not)\s+(the\s+)?(check|checking|verify|validate|approval)\b/i],
  ['capacity-claim', /\b(capacity|limit|rule)\b[^.]*\b(checked|disabled|lifted|raised|unlimited|does\s+not\s+apply)\b/i],
  ['auto-approve', /\b(approve|save)\s+(it|this|them|all|now|automatically)\b/i],
];

export function scanText(text) {
  if (typeof text !== 'string' || !text) return [];
  return patterns.filter(([, re]) => re.test(text)).map(([name]) => name);
}

const isSuspicious = (t) => scanText(t.title).length > 0 || scanText(t.description).length > 0;

// Adds flags: ["instruction"] to tasks whose text reads like an instruction. Text is kept.
export const flagTasks = (tasks) => tasks.map((t) => (isSuspicious(t) ? { ...t, flags: [FLAG] } : t));

// For AI clients: replaces the text of flagged tasks. id, points and assignee stay.
export const redactTasks = (tasks) =>
  tasks.map((t) => {
    if (!t.flags?.includes(FLAG)) return t;
    const title = scanText(t.title).length ? `Task ${t.id} (title hidden)` : t.title;
    return { ...t, title, description: REDACTED };
  });
