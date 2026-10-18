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
export const AUTH_DIR = process.env.CAMPUSDESK_AUTH_DIR || path.join(PROJECT_ROOT, ".local");

// Origin of the Next.js frontend, for CORS in development.
export const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";

// Campus timezone used to resolve conversational dates and to show the
// proposal's date/timezone. Booking timestamps themselves are always
// explicit ISO 8601 with an offset, so this only affects display/suggestion
// defaults, not validation.
export const CAMPUS_TZ_OFFSET = "+06:00";
export const CAMPUS_TZ_NAME = "Asia/Dhaka";

export const MAX_DURATION_MINUTES = 180;

// How long a student's availability preview can be submitted as a request.
// Staff decisions refer to persisted immutable requests, not this token.
export const PROPOSAL_TTL_MS = 5 * 60 * 1000;

// Groq's compatible endpoint is the default; other compatible providers can
// override it. Secrets are loaded by Node from .env, never sent to the browser.
export const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1/";
export const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "";
export const LLM_MODEL = process.env.LLM_MODEL || "openai/gpt-oss-120b";
const configuredTimeout = Number(process.env.LLM_TIMEOUT_MS || 30000);
export const LLM_TIMEOUT_MS = Number.isInteger(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 120000
  ? configuredTimeout : 30000;
