import express from "express";
import cors from "cors";
import { WEB_ORIGIN } from "./config.js";
import { BookingError, CODES } from "./domain/errors.js";
import { requireRole, SESSION_COOKIE, cookieOptions } from "./auth.js";
import { handleMcp, connectLocalMcp, unpackToolResult } from "./mcp.js";
import { createChat } from "./agent/chat.js";
import { AgentError } from "./agent/model.js";
import { LLM_API_KEY, LLM_MODEL } from "./config.js";
import { listRoomsTool, checkAvailabilityTool, createBookingTool, listBookingsForRoomTool,
  listRequestsTool, submitRequestTool, rejectRequestTool, cancelRequestTool } from "./service.js";

const route = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function createApp({ auth, chat = createChat() }) {
  const app = express();
  const allowLoopback = process.env.NODE_ENV !== "production";
  const allowedOrigin = (origin) => !origin || origin === WEB_ORIGIN || (allowLoopback && LOCALHOST_ORIGIN_RE.test(origin));
  app.disable("x-powered-by");
  app.use(cors({ credentials: true, origin(origin, callback) {
    if (allowedOrigin(origin)) callback(null, true);
    else callback(new BookingError(CODES.FORBIDDEN, "This origin is not allowed."));
  } }));
  app.use(express.json({ limit: "16kb" }));
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!allowedOrigin(req.headers.origin)) {
        return res.status(403).json({ error: { code: CODES.FORBIDDEN, message: "This origin is not allowed." } });
      }
      if (!req.is("application/json")) {
        return res.status(415).json({ error: { code: CODES.INVALID_REQUEST, message: "Send application/json." } });
      }
    }
    req.user = auth.userFor(req);
    next();
  });
  app.get("/", (req, res) => res.json({ service: "campusdesk-api", ok: true }));
  app.get("/api/auth/session", (req, res) => res.json({ user: req.user }));
  app.post("/api/auth/login", route(async (req, res) => {
    const session = await auth.login(req.body.email, req.body.password, req.ip);
    auth.logout(req);
    res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions, maxAge: session.maxAge });
    res.json({ user: session.user });
  }));
  app.post("/api/auth/logout", (req, res) => {
    auth.logout(req);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    try { requireRole(req.user); next(); } catch (err) { next(err); }
  });
  app.get("/api/chat/status", (req, res) => res.json({ configured: Boolean(LLM_API_KEY), model: LLM_MODEL, timezone: "Asia/Dhaka" }));
  app.post("/api/chat", route(async (req, res) => res.json(await chat(req.user, req.body))));
  app.post("/api/mcp", route(handleMcp));
  app.all("/api/mcp", (req, res) => res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use MCP Streamable HTTP POST." } }));
  // Every handler uses the server session, never a body-supplied user or role.
  app.get("/api/rooms", route(async (req, res) => res.json({ rooms: await listRoomsTool({ group_size: req.query.group_size }) })));
  app.get("/api/bookings", route(async (req, res) => {
    if (!req.query.room_id) throw new BookingError(CODES.INVALID_REQUEST, "room_id query param is required.");
    res.json({ bookings: await listBookingsForRoomTool(req.query.room_id) });
  }));
  app.post("/api/availability", route(async (req, res) => res.json({ proposal: await checkAvailabilityTool(req.body, req.user) })));
  app.get("/api/requests", route(async (req, res) => res.json({ requests: await listRequestsTool(req.user) })));
  app.post("/api/requests", route(async (req, res) => res.status(201).json({ request: await submitRequestTool(req.body, req.user) })));
  app.post("/api/requests/:id/approve", route(async (req, res) => {
    if (Object.keys(req.body).some((key) => key !== "note")) {
      throw new BookingError(CODES.INVALID_REQUEST, "A review accepts only a note; the submitted slot cannot be edited.");
    }
    requireRole(req.user, "staff");
    const request = (await listRequestsTool(req.user)).find((item) => item.id === req.params.id);
    if (!request) throw new BookingError(CODES.REQUEST_NOT_FOUND, "The request was not found.");
    const connection = await connectLocalMcp(req.user, "campusdesk-human-review", { request_id: request.id, note: req.body.note });
    try {
      const result = unpackToolResult(await connection.client.callTool({ name: "create_booking", arguments: {
        room_id: request.room_id, start_at: request.start_at, end_at: request.end_at, group_size: request.group_size, request_id: request.id,
      } }));
      if (result.error) throw new BookingError(result.error.code, result.error.message, result.error);
      res.json(result);
    } finally { await connection.close(); }
  }));
  app.post("/api/requests/:id/reject", route(async (req, res) => res.json({ request: await rejectRequestTool(req.params.id, req.user, req.body.note) })));
  app.post("/api/requests/:id/cancel", route(async (req, res) => res.json({ request: await cancelRequestTool(req.params.id, req.user) })));
  app.post("/api/bookings", route(async (req, res) => {
    const { room_id, start_at, end_at, group_size, request_id, approved, note } = req.body;
    res.status(201).json(await createBookingTool({ room_id, start_at, end_at, group_size },
      { request_id, approved: approved === true, note, reviewer: req.user }));
  }));
  app.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown API route." } }));
  app.use((err, req, res, _next) => {
    if (res.headersSent) return _next(err);
    if (err instanceof AgentError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err instanceof BookingError) {
      const status = { UNAUTHENTICATED: 401, INVALID_CREDENTIALS: 401, FORBIDDEN: 403,
        REQUEST_NOT_FOUND: 404, REQUEST_NOT_PENDING: 409, ROOM_UNAVAILABLE: 409, AUTH_RATE_LIMIT: 429 }[err.code] || 400;
      return res.status(status).json({ error: err.toJSON() });
    }
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: { code: CODES.INVALID_REQUEST, message: "Invalid JSON." } });
    if (err.type === "entity.too.large") return res.status(413).json({ error: { code: CODES.INVALID_REQUEST, message: "Request body is too large." } });
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } });
  });
  return app;
}
