/**
 * SprintBoard Domain Capacity Rules
 * Single Source of Truth for the Hard Invariant:
 * "No member has more than 8 story points."
 */

export const MAX_POINTS_PER_MEMBER = 8;
export const RULE_ERROR_CODE = "ERR_MAX_POINTS_EXCEEDED";

/**
 * Validates whether adding points to a member exceeds the 8 story point hard limit.
 *
 * @param {Object} member - The team member object { id, name, currentPoints, maxPoints }
 * @param {number} currentPoints - Current assigned points for this member
 * @param {number} addedPoints - Proposed additional story points to assign
 * @returns {Object} Validation result { allowed, code?, currentPoints, attemptedPoints, projectedTotal, maxAllowed, message }
 */
export function checkMemberCapacity(member, currentPoints, addedPoints) {
  if (typeof addedPoints !== 'number' || isNaN(addedPoints) || addedPoints < 0) {
    return {
      allowed: false,
      code: "ERR_INVALID_POINTS",
      currentPoints,
      attemptedPoints: addedPoints,
      projectedTotal: currentPoints,
      maxAllowed: MAX_POINTS_PER_MEMBER,
      message: `Invalid story points value: "${addedPoints}". Points must be a non-negative number.`
    };
  }

  const projectedTotal = currentPoints + addedPoints;

  if (projectedTotal > MAX_POINTS_PER_MEMBER) {
    const memberName = member?.name || "Team Member";
    return {
      allowed: false,
      code: RULE_ERROR_CODE,
      memberName,
      currentPoints,
      attemptedPoints: addedPoints,
      projectedTotal,
      maxAllowed: MAX_POINTS_PER_MEMBER,
      overage: projectedTotal - MAX_POINTS_PER_MEMBER,
      message: `Hard rule violation: Assigning ${addedPoints} points to "${memberName}" would bring their total to ${projectedTotal} points, exceeding the maximum limit of ${MAX_POINTS_PER_MEMBER} points.`
    };
  }

  return {
    allowed: true,
    memberName: member?.name || "Team Member",
    currentPoints,
    attemptedPoints: addedPoints,
    projectedTotal,
    maxAllowed: MAX_POINTS_PER_MEMBER,
    remainingCapacity: MAX_POINTS_PER_MEMBER - projectedTotal,
    message: `Capacity OK: "${member?.name || 'Member'}" will have ${projectedTotal}/${MAX_POINTS_PER_MEMBER} points.`
  };
}

/**
 * Validates a batch proposal for multiple member assignments.
 *
 * @param {Array} members - All team members
 * @param {Array} proposedAssignments - Array of { memberId, taskPoints, taskIds }
 * @returns {Object} { allowed: boolean, memberResults: Array, violations: Array }
 */
export function validateBatchCapacity(members, proposedAssignments) {
  const memberMap = new Map(members.map(m => [m.id, { ...m }]));
  const violations = [];
  const memberResults = [];

  // Group proposed points by member
  const pointsByMember = new Map();
  for (const item of proposedAssignments) {
    const curr = pointsByMember.get(item.memberId) || 0;
    pointsByMember.set(item.memberId, curr + (item.taskPoints || 0));
  }

  for (const [memberId, addedPoints] of pointsByMember.entries()) {
    const member = memberMap.get(memberId);
    if (!member) {
      violations.push({
        allowed: false,
        code: "ERR_MEMBER_NOT_FOUND",
        memberId,
        message: `Member with id "${memberId}" was not found.`
      });
      continue;
    }

    const check = checkMemberCapacity(member, member.currentPoints, addedPoints);
    memberResults.push(check);
    if (!check.allowed) {
      violations.push(check);
    }
  }

  return {
    allowed: violations.length === 0,
    memberResults,
    violations
  };
}
