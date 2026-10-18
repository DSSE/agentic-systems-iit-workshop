import { randomUUID } from "node:crypto";
import { readBoard } from "../data/store";
import { checkCapacity } from "../domain/capacity";
import { assignTask } from "../tools/assignTask";
import { UI_ORIGIN } from "./session";

export interface PendingProposal {
  status: "pending_approval";
  proposalId: string;
  taskId: string;
  memberId: string;
  taskTitle: string;
  memberName: string;
  points: number;
  current: number;
  projected: number;
  max: number;
  approvalUrl: string;
}

interface Refusal { ok: false; reason: string; code: string }
type Snapshot = Omit<PendingProposal, "status" | "proposalId" | "approvalUrl">;
type Inspection = { snapshot: Snapshot; fits: boolean } | Refusal;
const refuse = (reason: string, code: string): Refusal => ({ ok: false, reason, code });

function inspect(taskId: string, memberId: string): Inspection {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  const member = board.members.find((candidate) => candidate.id === memberId);
  if (!task) return refuse(`Unknown task: ${taskId}`, "unknown_task");
  if (!member) return refuse(`Unknown member: ${memberId}`, "unknown_member");
  if (task.assignee !== null) return refuse(`Task "${task.title}" is already assigned`, "task_unavailable");
  if (!Number.isSafeInteger(task.points) || task.points < 0
    || !Number.isSafeInteger(member.points) || member.points < 0) {
    return refuse("Stored story points must be nonnegative safe integers", "invalid_board");
  }
  const capacity = checkCapacity(member.points, task.points);
  return {
    fits: capacity.ok,
    snapshot: { taskId, memberId, taskTitle: task.title, memberName: member.name,
      points: task.points, current: capacity.current, projected: capacity.projected, max: capacity.max },
  };
}

function display(proposalId: string, snapshot: Snapshot): PendingProposal {
  return { status: "pending_approval", proposalId, ...snapshot, approvalUrl: `${UI_ORIGIN}/` };
}

// Deliberately synchronous: inspect -> final domain check -> single file writer
// runs in one event-loop turn, without an async gap between validation and write.
export function createProposalService() {
  const pending = new Map<string, Snapshot>();
  function refresh(proposalId: string, previous: Snapshot, current: Snapshot): PendingProposal {
    // The approval payload binds numeric details. If displayed labels change,
    // rotate the opaque ID so an older browser view cannot approve new labels.
    if (previous.taskTitle !== current.taskTitle || previous.memberName !== current.memberName) {
      pending.delete(proposalId);
      proposalId = randomUUID();
    }
    pending.set(proposalId, current);
    return display(proposalId, current);
  }
  return {
    create(taskId: string, memberId: string): PendingProposal | Refusal {
      const inspected = inspect(taskId, memberId);
      if ("ok" in inspected) return inspected;
      if (!inspected.fits) {
        return refuse(`rule:max-8-points - assigning "${inspected.snapshot.taskTitle}" would put ${inspected.snapshot.memberName} at ${inspected.snapshot.projected}/${inspected.snapshot.max} points`, "rule:max-8-points");
      }
      const proposalId = randomUUID();
      pending.set(proposalId, inspected.snapshot);
      return display(proposalId, inspected.snapshot);
    },
    list(): PendingProposal[] {
      const proposals: PendingProposal[] = [];
      for (const [proposalId, previous] of Array.from(pending)) {
        const inspected = inspect(previous.taskId, previous.memberId);
        if ("ok" in inspected) {
          pending.delete(proposalId);
          continue;
        }
        proposals.push(refresh(proposalId, previous, inspected.snapshot));
      }
      return proposals;
    },
    approve(proposalId: string, expectedCurrent: number, expectedPoints: number) {
      const previous = pending.get(proposalId);
      if (!previous) return refuse("Proposal is unknown, expired, rejected, or already consumed", "unknown_proposal");
      const inspected = inspect(previous.taskId, previous.memberId);
      if ("ok" in inspected) {
        pending.delete(proposalId);
        return inspected;
      }
      if (expectedCurrent !== inspected.snapshot.current || expectedPoints !== inspected.snapshot.points
        || JSON.stringify(previous) !== JSON.stringify(inspected.snapshot)) {
        return { ...refuse("Assignment details changed. Review the refreshed proposal and click Approve again.", "stale_proposal"),
          proposal: refresh(proposalId, previous, inspected.snapshot) };
      }
      // The existing commit function independently re-reads and checks capacity.
      const result = assignTask(previous.taskId, previous.memberId);
      pending.delete(proposalId);
      return result;
    },
    reject(proposalId: string) {
      return pending.delete(proposalId) ? { ok: true as const }
        : refuse("Proposal is unknown, expired, rejected, or already consumed", "unknown_proposal");
    },
  };
}
