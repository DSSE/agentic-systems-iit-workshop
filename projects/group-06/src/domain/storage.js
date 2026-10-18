/**
 * SprintBoard Persistence Layer
 * Enforces the Human-in-the-Loop Safe Storage Invariant:
 * "Nothing is saved until a person approves it."
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkMemberCapacity, RULE_ERROR_CODE } from './rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultDataPath = join(__dirname, '..', '..', 'data.json');

let currentDataFilePath = defaultDataPath;

/**
 * Configure active data file path (useful for testing against fixtures).
 * @param {string} filePath
 */
export function setDataFilePath(filePath) {
  currentDataFilePath = filePath;
}

export function getDataFilePath() {
  return currentDataFilePath;
}

/**
 * Reads the latest state from data.json.
 * @returns {Object} { members, tasks, proposals }
 */
export function readData() {
  if (!existsSync(currentDataFilePath)) {
    throw new Error(`Data file not found at ${currentDataFilePath}`);
  }
  const raw = readFileSync(currentDataFilePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Stages an assignment proposal in memory without persisting to data.json.
 *
 * @param {string} memberName
 * @param {string[]} taskIds
 * @returns {Object} Staged proposal details and capacity check
 */
export function stageProposal(memberName, taskIds) {
  const data = readData();
  const member = data.members.find(
    m => m.name.toLowerCase() === memberName.toLowerCase() || m.id === memberName
  );

  if (!member) {
    return {
      success: false,
      code: "ERR_MEMBER_NOT_FOUND",
      message: `Team member "${memberName}" was not found.`
    };
  }

  const tasksToAssign = data.tasks.filter(t => taskIds.includes(t.id));
  if (tasksToAssign.length === 0) {
    return {
      success: false,
      code: "ERR_TASKS_NOT_FOUND",
      message: `No matching tasks found for IDs: ${taskIds.join(', ')}`
    };
  }

  // Calculate total points for requested tasks
  const addedPoints = tasksToAssign.reduce((sum, t) => sum + t.points, 0);

  // Validate hard capacity rule
  const capacityCheck = checkMemberCapacity(member, member.currentPoints, addedPoints);
  if (!capacityCheck.allowed) {
    return {
      success: false,
      code: capacityCheck.code,
      capacityCheck,
      message: capacityCheck.message
    };
  }

  const proposal = {
    id: `prop-${Date.now()}`,
    memberName: member.name,
    memberId: member.id,
    taskIds: tasksToAssign.map(t => t.id),
    taskTitles: tasksToAssign.map(t => t.title),
    addedPoints,
    projectedTotal: capacityCheck.projectedTotal,
    status: "proposed",
    requiresApproval: true,
    createdAt: new Date().toISOString()
  };

  return {
    success: true,
    staged: true,
    saved: false,
    proposal,
    capacityCheck,
    message: `Proposal staged: Assigning ${tasksToAssign.length} task(s) (${addedPoints} pts) to ${member.name}. Needs explicit approval to save.`
  };
}

/**
 * Commits an approved assignment to data.json.
 * Hard rule: Refuses write unless approved is strictly true.
 * Self-verification: Re-validates checkMemberCapacity right before writing.
 *
 * @param {string} memberName
 * @param {string[]} taskIds
 * @param {boolean} approved - Explicit human approval flag
 * @returns {Object} Result of assignment commit
 */
export function commitAssignment(memberName, taskIds, approved) {
  if (approved !== true) {
    return {
      success: false,
      code: "ERR_APPROVAL_REQUIRED",
      saved: false,
      message: "Human approval required: Nothing is saved until a person approves it. Set approved: true to commit."
    };
  }

  const data = readData();
  const member = data.members.find(
    m => m.name.toLowerCase() === memberName.toLowerCase() || m.id === memberName
  );

  if (!member) {
    return {
      success: false,
      code: "ERR_MEMBER_NOT_FOUND",
      saved: false,
      message: `Team member "${memberName}" was not found.`
    };
  }

  const tasksToAssign = data.tasks.filter(t => taskIds.includes(t.id));
  if (tasksToAssign.length === 0) {
    return {
      success: false,
      code: "ERR_TASKS_NOT_FOUND",
      saved: false,
      message: `No matching tasks found for IDs: ${taskIds.join(', ')}`
    };
  }

  const addedPoints = tasksToAssign.reduce((sum, t) => sum + t.points, 0);

  // Self-verification: Re-check hard rule directly on current database state
  const capacityCheck = checkMemberCapacity(member, member.currentPoints, addedPoints);
  if (!capacityCheck.allowed) {
    return {
      success: false,
      code: capacityCheck.code || RULE_ERROR_CODE,
      saved: false,
      capacityCheck,
      message: capacityCheck.message
    };
  }

  // Mutate data
  member.currentPoints = capacityCheck.projectedTotal;
  for (const task of tasksToAssign) {
    task.status = "assigned";
    task.assignee = member.name;
  }

  // Atomic write to data.json
  writeFileSync(currentDataFilePath, JSON.stringify(data, null, 2), 'utf8');

  return {
    success: true,
    saved: true,
    approved: true,
    member: {
      id: member.id,
      name: member.name,
      currentPoints: member.currentPoints,
      maxPoints: member.maxPoints
    },
    assignedTasks: tasksToAssign.map(t => ({ id: t.id, title: t.title, points: t.points })),
    message: `Successfully approved and saved! ${tasksToAssign.length} task(s) assigned to ${member.name}. Member now has ${member.currentPoints}/8 points.`
  };
}
