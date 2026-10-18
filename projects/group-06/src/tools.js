/**
 * SprintBoard Core Tools
 * Implements the 3 required tools:
 * 1. list_tasks
 * 2. check_capacity
 * 3. assign_task (saves only after Approve)
 */

import { readData, stageProposal, commitAssignment } from './domain/storage.js';
import { checkMemberCapacity } from './domain/rules.js';

/**
 * Tool 1: list_tasks
 * Returns backlog tasks and team members with current point totals and capacity.
 *
 * @returns {Object} { members: Array, tasks: Array }
 */
export function list_tasks() {
  const data = readData();
  return {
    members: data.members.map(m => ({
      id: m.id,
      name: m.name,
      currentPoints: m.currentPoints,
      maxPoints: m.maxPoints,
      remainingPoints: m.maxPoints - m.currentPoints
    })),
    tasks: data.tasks.map(t => ({
      id: t.id,
      title: t.title,
      points: t.points,
      status: t.status,
      assignee: t.assignee
    }))
  };
}

/**
 * Tool 2: check_capacity
 * Checks whether assigning specified tasks to a team member exceeds the 8-point limit.
 * Does not mutate state.
 *
 * @param {string} memberName - Name or ID of the team member
 * @param {string[]} taskIds - Array of task IDs to check
 * @returns {Object} Capacity verification result with diagnostic details
 */
export function check_capacity(memberName, taskIds) {
  if (!memberName) {
    return {
      allowed: false,
      code: "ERR_MISSING_MEMBER",
      message: "Please specify a team member name."
    };
  }

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return {
      allowed: false,
      code: "ERR_EMPTY_TASKS",
      message: "Please provide an array of task IDs to check."
    };
  }

  const data = readData();
  const member = data.members.find(
    m => m.name.toLowerCase() === memberName.toLowerCase() || m.id === memberName
  );

  if (!member) {
    return {
      allowed: false,
      code: "ERR_MEMBER_NOT_FOUND",
      message: `Team member "${memberName}" was not found.`
    };
  }

  const tasks = data.tasks.filter(t => taskIds.includes(t.id));
  if (tasks.length === 0) {
    return {
      allowed: false,
      code: "ERR_TASKS_NOT_FOUND",
      message: `No tasks found matching IDs: ${taskIds.join(', ')}`
    };
  }

  const addedPoints = tasks.reduce((sum, t) => sum + t.points, 0);
  const result = checkMemberCapacity(member, member.currentPoints, addedPoints);

  return {
    ...result,
    taskCount: tasks.length,
    taskIds: tasks.map(t => t.id),
    taskTitles: tasks.map(t => t.title)
  };
}

/**
 * Tool 3: assign_task
 * Generates an assignment proposal or persists state if human approval is present.
 * Invariant: Saves to data.json ONLY if approved === true.
 *
 * @param {string} memberName - Target team member name or ID
 * @param {string[]} taskIds - Array of task IDs
 * @param {boolean} [approved=false] - Explicit human approval flag
 * @returns {Object} Proposal or saved assignment receipt
 */
export function assign_task(memberName, taskIds, approved = false) {
  if (!approved) {
    // Stage proposal only; does not write to data.json
    return stageProposal(memberName, taskIds);
  }

  // Commit assignment; saves to data.json after re-verifying rules
  return commitAssignment(memberName, taskIds, approved);
}
