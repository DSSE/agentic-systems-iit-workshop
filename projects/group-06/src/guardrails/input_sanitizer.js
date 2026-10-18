/**
 * SprintBoard Guardrails & Input Sanitizer (AIDLC Phase 7 / Unit 7)
 * Defense-in-depth isolation against prompt injection, instruction hijacking,
 * and malicious capacity override attempts (Case 5).
 */

import { checkMemberCapacity, MAX_POINTS_PER_MEMBER, RULE_ERROR_CODE } from '../domain/rules.js';

// Suspicious prompt injection patterns that attempt to override system rules
const INJECTION_PATTERNS = [
  { name: 'capacity_override', regex: /capacity\s+already\s+checked/i },
  { name: 'assign_all_hijack', regex: /assign\s+all\s+(tasks\s+)?to/i },
  { name: 'instruction_override', regex: /ignore\s+(all\s+)?previous\s+instructions/i },
  { name: 'system_override', regex: /system\s+override|admin\s+override|bypass\s+capacity/i },
  { name: 'prompt_breakout', regex: /<\/?untrusted_backlog_data>/i }
];

/**
 * Encloses untrusted text inside structural XML delimiters.
 * Escapes internal closing tags to prevent delimiter breakout.
 */
export function wrapUntrustedData(content, tag = 'untrusted_backlog_data') {
  if (typeof content !== 'string') {
    content = String(content || '');
  }
  // Prevent tag breakout by neutralising closing tags
  const sanitized = content.replace(new RegExp(`</${tag}>`, 'gi'), `[escaped_tag]`);
  return `<${tag}>\n${sanitized}\n</${tag}>`;
}

/**
 * Scans a string for prompt injection indicators.
 */
export function detectInjectionPatterns(text) {
  if (!text || typeof text !== 'string') {
    return { hasInjectionPattern: false, matchedPatterns: [] };
  }

  const matched = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(text)) {
      matched.push(pattern.name);
    }
  }

  return {
    hasInjectionPattern: matched.length > 0,
    matchedPatterns: matched
  };
}

/**
 * Sanitizes a backlog task before providing it to the AI agent or UI.
 * Ensures the `points` field is an immutable integer and marks injection flags.
 */
export function sanitizeBacklogTask(task) {
  if (!task || typeof task !== 'object') {
    throw new Error('Invalid task object');
  }

  const numericPoints = Number(task.points);
  if (Number.isNaN(numericPoints) || numericPoints <= 0) {
    throw new Error(`Invalid story points for task ${task.id}: ${task.points}`);
  }

  const injectionCheck = detectInjectionPatterns(task.title);

  return {
    id: String(task.id),
    title: String(task.title),
    points: numericPoints,
    status: task.status || 'backlog',
    assignee: task.assignee || null,
    isUntrustedData: true,
    hasInjectionAttempt: injectionCheck.hasInjectionPattern,
    safeDisplayTitle: injectionCheck.hasInjectionPattern
      ? `[Untrusted Data Payload] ${task.title}`
      : task.title,
    promptDelimited: wrapUntrustedData(task.title)
  };
}

/**
 * Formats backlog tasks for inclusion in LLM prompt context with structural boundaries.
 */
export function formatTasksForPrompt(tasks) {
  const sanitized = tasks.map(sanitizeBacklogTask);
  return sanitized.map(t => {
    return `Task ID: ${t.id} | Points: ${t.points} | Status: ${t.status}\nTask Content:\n${t.promptDelimited}`;
  }).join('\n\n');
}

/**
 * Strict Domain Firewall Guardrail.
 * Verifies that regardless of any textual assertions, numeric capacity cannot be bypassed.
 */
export function assertCapacityFirewall(memberName, tasksToAssign, members) {
  const totalIncomingPoints = tasksToAssign.reduce((sum, t) => sum + Number(t.points), 0);
  const capacityResult = checkMemberCapacity(memberName, totalIncomingPoints, members);

  if (!capacityResult.allowed) {
    const error = new Error(
      `[SECURITY GUARDRAIL TRIGGERED] Member '${memberName}' cannot receive ${totalIncomingPoints} points. Exceeds max limit of ${MAX_POINTS_PER_MEMBER}. Code: ${RULE_ERROR_CODE}`
    );
    error.code = RULE_ERROR_CODE;
    error.details = capacityResult;
    throw error;
  }

  return capacityResult;
}
