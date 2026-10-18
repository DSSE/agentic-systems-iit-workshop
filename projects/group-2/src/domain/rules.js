// HR-1: no member has more than 8 story points.
// This is the only place the rule is implemented. Pure functions, no I/O.

export const MAX_POINTS = 8;
export const RULE_CODE = 'MAX_POINTS_EXCEEDED';

export const limitFor = (member) => Math.min(member.capacity ?? MAX_POINTS, MAX_POINTS);

function pointsByMember(tasks) {
  const points = new Map();
  for (const t of tasks) {
    if (t.assignee) points.set(t.assignee, (points.get(t.assignee) ?? 0) + t.points);
  }
  return points;
}

export function memberLoads(data, extra = new Map()) {
  const saved = pointsByMember(data.tasks);
  return data.members.map((m) => {
    const points = (saved.get(m.id) ?? 0) + (extra.get(m.id) ?? 0);
    const limit = limitFor(m);
    return { id: m.id, name: m.name, points, limit, remaining: limit - points };
  });
}

const fail = (code, details = {}) => ({ ok: false, code, details });

// Checks a whole batch against the current data. Atomic: the first failure wins.
export function checkAssignments(data, assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return fail('INVALID_INPUT', { reason: 'assignments must be a non-empty array' });
  }
  for (const a of assignments) {
    if (!a || typeof a.taskId !== 'string' || typeof a.memberId !== 'string') {
      return fail('INVALID_INPUT', { reason: 'each assignment needs taskId and memberId' });
    }
  }

  const seen = new Set();
  for (const { taskId } of assignments) {
    if (seen.has(taskId)) return fail('DUPLICATE_TASK', { taskId });
    seen.add(taskId);
  }

  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const members = new Map(data.members.map((m) => [m.id, m]));
  for (const { taskId } of assignments) {
    if (!tasks.has(taskId)) return fail('UNKNOWN_TASK', { taskId });
  }
  for (const { memberId } of assignments) {
    if (!members.has(memberId)) return fail('UNKNOWN_MEMBER', { memberId });
  }
  for (const { taskId } of assignments) {
    const { assignee } = tasks.get(taskId);
    if (assignee) return fail('TASK_ALREADY_ASSIGNED', { taskId, assignee });
  }

  const adding = new Map();
  for (const { taskId, memberId } of assignments) {
    adding.set(memberId, (adding.get(memberId) ?? 0) + tasks.get(taskId).points);
  }
  const loads = memberLoads(data, adding);
  for (const load of loads) {
    if (load.points > load.limit) {
      const add = adding.get(load.id);
      return fail(RULE_CODE, {
        memberId: load.id,
        current: load.points - add,
        adding: add,
        total: load.points,
        limit: load.limit,
      });
    }
  }
  return { ok: true, loads };
}
