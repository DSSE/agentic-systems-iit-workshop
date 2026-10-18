import { Router, Request, Response, NextFunction } from "express";
import { listTasks } from "../tools/listTasks";
import { checkCapacity, UnknownMemberError } from "../tools/checkCapacity";
import { createApproverSession, UI_ORIGIN } from "../approval/session";
import { createProposalService } from "../approval/proposals";
import { chat, modelConfig } from "../chat/agent";
import type { ChatMessage } from "../chat/planner";

export interface AppOptions { approvalCode: string }

function strictObject(value: unknown, fields: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const validPoints = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function invalid(res: Response, reason: string) {
  return res.status(400).json({ ok: false, code: "invalid_input", reason });
}

function browserOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.get("Origin") !== UI_ORIGIN) {
    res.status(403).json({ ok: false, code: "origin_forbidden", reason: "Use the local SprintBoard approval UI" });
    return;
  }
  next();
}

export function createRouter(options: AppOptions): Router {
  const router = Router();
  const session = createApproverSession(options.approvalCode);
  const proposals = createProposalService();
  router.get("/chat/status", (_req, res) => {
    const config = modelConfig();
    res.json({ mode: config ? "llm" : "local", model: config?.model ?? null });
  });
  router.post("/chat", async (req, res) => {
    const { message, history = [] } = req.body ?? {};
    if (typeof message !== "string" || !message.trim() || message.length > 4000
      || !Array.isArray(history) || history.length > 12 || history.some((entry: ChatMessage) =>
        !entry || !["user", "assistant"].includes(entry.role) || typeof entry.content !== "string" || entry.content.length > 8000)) {
      invalid(res, "Use a message of 1–4000 characters and up to 12 user/assistant history messages");
      return;
    }
    try {
      res.json(await chat(message.trim(), history, proposals));
    } catch (error) {
      res.status(502).json({ ok: false, code: "chat_unavailable", reason: error instanceof Error ? error.message : "The chat provider is unavailable. Please retry." });
    }
  });
  const requireApproval = (req: Request, res: Response, next: NextFunction) => {
    if (!session.authorize(req)) {
      res.status(403).json({ ok: false, code: "approval_required", reason: "Human approver session and CSRF token are required" });
      return;
    }
    next();
  };

  router.get("/tasks", (_req, res) => { res.json(listTasks()); });

  router.post("/check-capacity", (req, res) => {
    if (!strictObject(req.body, ["memberId", "additionalPoints"])
      || !validId(req.body.memberId) || !validPoints(req.body.additionalPoints)) {
      invalid(res, "Use exactly memberId (a nonempty ID) and additionalPoints (a nonnegative safe integer)");
      return;
    }
    try {
      res.json(checkCapacity(req.body.memberId, req.body.additionalPoints));
    } catch (err) {
      if (!(err instanceof UnknownMemberError)) throw err;
      res.status(404).json({ ok: false, code: "unknown_member", reason: err.message });
    }
  });

  router.get("/approval-session", browserOrigin, (req, res) => { res.json(session.status(req)); });
  router.post("/approval-session", browserOrigin, (req, res) => {
    if (!strictObject(req.body, ["code"]) || typeof req.body.code !== "string" || !req.body.code.length) {
      invalid(res, "Use exactly the setup code shown in the backend terminal");
      return;
    }
    const established = session.establish(req.body.code, res);
    if (!established) {
      res.status(401).json({ ok: false, code: "invalid_setup_code", reason: "Setup code is invalid or already used" });
      return;
    }
    res.json(established);
  });

  router.post("/proposals", (req, res) => {
    if (!strictObject(req.body, ["taskId", "memberId"]) || !validId(req.body.taskId) || !validId(req.body.memberId)) {
      invalid(res, "Use exactly taskId and memberId, both nonempty IDs");
      return;
    }
    const result = proposals.create(req.body.taskId, req.body.memberId);
    const notFound = "code" in result && (result.code === "unknown_task" || result.code === "unknown_member");
    res.status(notFound ? 404 : 200).json(result);
  });
  router.get("/proposals", (_req, res) => { res.json({ proposals: proposals.list() }); });

  router.post("/proposals/:id/approve", requireApproval, (req, res) => {
    if (typeof req.params.id !== "string" || !validId(req.params.id)
      || !strictObject(req.body, ["expectedCurrent", "expectedPoints"])
      || !validPoints(req.body.expectedCurrent) || !validPoints(req.body.expectedPoints)) {
      invalid(res, "Use exactly expectedCurrent and expectedPoints from the displayed proposal");
      return;
    }
    const result = proposals.approve(req.params.id, req.body.expectedCurrent, req.body.expectedPoints);
    const status = "code" in result && result.code === "stale_proposal" ? 409 : 200;
    res.status(status).json(result);
  });
  router.post("/proposals/:id/reject", requireApproval, (req, res) => {
    if (typeof req.params.id !== "string" || !validId(req.params.id) || !strictObject(req.body, [])) {
      invalid(res, "Reject expects an empty object and a proposal ID");
      return;
    }
    res.json(proposals.reject(req.params.id));
  });

  router.post("/assign-task", (_req, res) => {
    res.status(410).json({ ok: false, code: "direct_assignment_retired", reason: "Create a proposal, then approve it in the SprintBoard UI" });
  });
  return router;
}
