// Shared configuration. No secrets live here; see .env.example for the
// variable names the future chat agent will read.
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(here, "..");

// Overridable so tests can point at a throwaway file instead of the real
// seed data.
export const DATA_FILE =
  process.env.CAMPUSDESK_DATA_FILE || path.join(PROJECT_ROOT, "data.json");

export const PORT = Number(process.env.PORT || 4000);

// Origin of the Next.js frontend, for CORS in development.
export const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

// Campus timezone used to resolve conversational dates and to show the
// proposal's date/timezone. Booking timestamps themselves are always
// explicit ISO 8601 with an offset, so this only affects display/suggestion
// defaults, not validation.
export const CAMPUS_TZ_OFFSET = "+06:00";
export const CAMPUS_TZ_NAME = "Asia/Dhaka";

export const MAX_DURATION_MINUTES = 180;

// How long a check_availability proposal stays valid for approval. Keeps
// "approval applies only to the exact proposal shown" from drifting forever,
// and bounds the in-memory proposal store.
export const PROPOSAL_TTL_MS = 5 * 60 * 1000;

// Model configuration for the future chat agent (not used yet). Keep the
// MCP/agent layer provider-agnostic.
export const LLM_BASE_URL = process.env.LLM_BASE_URL || "";
export const LLM_API_KEY = process.env.LLM_API_KEY || "";
export const LLM_MODEL = process.env.LLM_MODEL || "";
