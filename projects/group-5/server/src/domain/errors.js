// The spec's error-code contract (specs/agent.md). One place defines the
// codes and their default messages so API, MCP, and agent clients agree.
export const CODES = {
  DURATION_LIMIT_EXCEEDED: "DURATION_LIMIT_EXCEEDED",
  ROOM_UNAVAILABLE: "ROOM_UNAVAILABLE",
  CAPACITY_EXCEEDED: "CAPACITY_EXCEEDED",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  AUTH_RATE_LIMIT: "AUTH_RATE_LIMIT",
  REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND",
  REQUEST_NOT_PENDING: "REQUEST_NOT_PENDING",
};

export class BookingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, ...this.details };
  }
}
