import { Router } from "express";
import { listTasks } from "../tools/listTasks";
import { checkCapacity, UnknownMemberError } from "../tools/checkCapacity";
import { assignTask } from "../tools/assignTask";

const router = Router();

// list_tasks: the current backlog and each member's current points.
router.get("/tasks", (_req, res) => {
  res.json(listTasks());
});

// check_capacity: read-only preview, safe to call before an Approve click.
router.post("/check-capacity", (req, res) => {
  const { memberId, additionalPoints } = req.body as { memberId?: string; additionalPoints?: number };
  if (!memberId || typeof additionalPoints !== "number") {
    res.status(400).json({ error: "memberId and additionalPoints are required" });
    return;
  }
  try {
    res.json(checkCapacity(memberId, additionalPoints));
  } catch (err) {
    if (err instanceof UnknownMemberError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// assign_task: the only route that writes to data.json. The UI must only
// call this after a human clicks Approve.
router.post("/assign-task", (req, res) => {
  const { taskId, memberId } = req.body as { taskId?: string; memberId?: string };
  if (!taskId || !memberId) {
    res.status(400).json({ error: "taskId and memberId are required" });
    return;
  }
  res.json(assignTask(taskId, memberId));
});

export default router;
