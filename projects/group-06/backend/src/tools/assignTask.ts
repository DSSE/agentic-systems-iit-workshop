import { readBoard, writeBoard, Task } from "../data/store";
import { checkCapacity } from "../domain/capacity";

export type AssignTaskResult =
  | { ok: true; task: Task }
  | { ok: false; reason: string };

// Called only after the human approves in the UI (or, later, after the
// agent's own approval gate). Re-checks the hard rule itself even though
// the caller likely already called check_capacity — never trust that a
// prior check still holds by the time this writes.
export function assignTask(taskId: string, memberId: string): AssignTaskResult {
  const board = readBoard();
  const task = board.tasks.find((t) => t.id === taskId);
  const member = board.members.find((m) => m.id === memberId);

  if (!task) return { ok: false, reason: `Unknown task: ${taskId}` };
  if (!member) return { ok: false, reason: `Unknown member: ${memberId}` };
  if (task.assignee) {
    return { ok: false, reason: `Task "${task.title}" is already assigned to ${task.assignee}` };
  }

  const result = checkCapacity(member.points, task.points);
  if (!result.ok) {
    return {
      ok: false,
      reason: `rule:max-8-points — assigning "${task.title}" would put ${member.name} at ${result.projected}/${result.max} points`,
    };
  }

  task.assignee = memberId;
  member.points = result.projected;
  writeBoard(board);

  return { ok: true, task };
}
