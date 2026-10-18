// Express app. Routes delegate to src/service.js, which is the same module
// a future MCP server would call. Exported separately from src/server.js
// so tests can exercise it with supertest-style requests without binding a
// real port.
import express from "express";
import cors from "cors";
import { WEB_ORIGIN } from "./config.js";
import { BookingError } from "./domain/errors.js";
import {
  listRoomsTool,
  checkAvailabilityTool,
  createBookingTool,
  listBookingsForRoomTool,
} from "./service.js";

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (curl, server-to-server) — allow.
        if (!origin) return callback(null, true);
        // The configured frontend origin, or any localhost/127.0.0.1 port.
        // The latter is dev-only convenience: Next's default port (3000) is
        // often already taken by something else, so it moves around.
        if (origin === WEB_ORIGIN || LOCALHOST_ORIGIN_RE.test(origin)) {
          return callback(null, true);
        }
        callback(new Error(`Origin ${origin} is not allowed.`));
      },
    })
  );
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ service: "campusdesk-api", ok: true });
  });

  app.get("/api/rooms", async (req, res, next) => {
    try {
      const rooms = await listRoomsTool({ group_size: req.query.group_size });
      res.json({ rooms });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/bookings", async (req, res, next) => {
    try {
      const roomId = req.query.room_id;
      if (!roomId) {
        return res
          .status(400)
          .json({ error: { code: "INVALID_REQUEST", message: "room_id query param is required." } });
      }
      const bookings = await listBookingsForRoomTool(roomId);
      res.json({ bookings });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/availability", async (req, res, next) => {
    try {
      const proposal = await checkAvailabilityTool(req.body);
      res.json({ proposal });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/bookings", async (req, res, next) => {
    try {
      const { room_id, start_at, end_at, group_size, proposal_id, approved } = req.body || {};
      const booking = await createBookingTool(
        { room_id, start_at, end_at, group_size },
        { proposal_id, approved }
      );
      res.status(201).json({ booking });
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown API route." } });
  });

  // Error handler: BookingError -> structured 400, anything else -> 500.
  app.use((err, req, res, _next) => {
    if (err instanceof BookingError) {
      res.status(400).json({ error: err.toJSON() });
    } else {
      console.error(err);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." } });
    }
  });

  return app;
}
