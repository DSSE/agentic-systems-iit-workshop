import express, { Express } from "express";
import cors from "cors";
import { createRouter, AppOptions } from "./routes";
import { createApprovalCode, UI_ORIGIN } from "./approval/session";

export function createApp(options: Partial<AppOptions> = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  // No-Origin calls are the read/proposal API used by local MCP adapters.
  // Browser callers must come from the one known local UI origin.
  app.use((req, res, next) => {
    if (req.get("Origin") && req.get("Origin") !== UI_ORIGIN) {
      res.status(403).json({ ok: false, code: "origin_forbidden", reason: "Origin is not allowed" });
      return;
    }
    next();
  });
  app.use(cors({ origin: UI_ORIGIN, credentials: true, methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"] }));
  app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use(express.json());
  app.use("/api", createRouter({ approvalCode: options.approvalCode ?? createApprovalCode() }));
  return app;
}
