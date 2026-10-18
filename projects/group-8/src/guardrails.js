import { failure } from './domain.js';
import { TOOL_DEFINITIONS, matchesSchema } from './tool-contract.js';

const allowedResultKeys = new Set([
  'ok', 'equipment', 'id', 'name', 'total_quantity', 'available_quantity',
  'start_date', 'due_date', 'violations', 'code', 'message', 'proposal', 'student_id',
  'items', 'equipment_id', 'quantity', 'duration_days', 'availability', 'proposal_id',
  'expires_at', 'review_url', 'loan', 'status', 'approved_at', 'created_at',
]);

export function validateToolInput(name, input) {
  const tool = TOOL_DEFINITIONS.find((entry) => entry.name === name);
  if (!tool) return failure('TOOL_NOT_ALLOWED', 'Only the three declared LabLend tools are allowed.');
  if (!matchesSchema(tool.inputSchema, input)) {
    return failure('INVALID_INPUT', 'Use the declared tool fields and types. Role overrides, approval flags, and extra instructions are not accepted.');
  }
  return { ok: true };
}

// Project catalog text cannot become instructions. Keep raw descriptions in the human UI,
// but omit them and non-contract fields from every MCP/model-facing result.
export function modelSafeToolResult(result) {
  function project(value, key = '') {
    if (Array.isArray(value)) return value.map((entry) => project(entry));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).filter(([name]) => allowedResultKeys.has(name))
        .map(([name, entry]) => [name, project(entry, name)]));
    }
    if (typeof value === 'string') {
      const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
      return cleaned.slice(0, key === 'name' ? 120 : key === 'message' ? 1000 : 2048);
    }
    return value;
  }
  const safe = project(result);
  if (Buffer.byteLength(JSON.stringify(safe)) > 24576) {
    return failure('TOOL_OUTPUT_LIMIT', 'Tool output is too large. Search for a specific equipment type and try again.');
  }
  return safe;
}

// This presentation filter supplements server validation; it is not an authorization check.
export function guardAssistantText(content) {
  if (/\b(saved|approved|created|reserved|booked)\b/i.test(content)) {
    return 'I can prepare a proposal after checking equipment, quantity, and dates. Only the Approve loan button can save a loan.';
  }
  if (/(?:\bTA\b|teaching assistant|administrator|staff).{0,100}(?:exempt|exception|override|allow|bypass)|(?:ignore|bypass|override|disable).{0,60}(?:rules|policy|limits|approval)/is.test(content)) {
    return 'The borrowing limits apply to every student: at most 2 units at a time, for at most 7 days. No role or equipment description can grant an exception. A checked proposal still requires human approval.';
  }
  return content;
}

export function boundedHistory(messages) {
  if (!Array.isArray(messages) || messages.length > 40 || Buffer.byteLength(JSON.stringify(messages)) > 65536) return [];
  return messages;
}
