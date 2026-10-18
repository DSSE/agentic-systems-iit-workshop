const DEFAULT_API_URL = "http://127.0.0.1:4000/api";
const TIMEOUT_MS = 5_000;

export class BackendError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function refusal(value: unknown): value is { ok: false; reason: string; code?: string } {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false
    && "reason" in value && typeof value.reason === "string";
}

export function createApi(apiUrl = process.env.SPRINTBOARD_API_URL ?? DEFAULT_API_URL) {
  const base = new URL(apiUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.search || base.hash || base.username || base.password) {
    throw new Error("SPRINTBOARD_API_URL must be an HTTP(S) API URL without credentials, query, or fragment");
  }
  const baseUrl = base.href.replace(/\/+$/, "");

  // Routes are fixed here; tool arguments cannot choose URLs or access board files.
  async function request(route: "/tasks" | "/check-capacity" | "/proposals", body?: object): Promise<unknown> {
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(`${baseUrl}${route}`, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      payload = await response.json();
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new BackendError("backend_timeout", `SprintBoard API did not respond within ${TIMEOUT_MS} ms. Check the running backend.`);
      }
      if (error instanceof SyntaxError) {
        throw new BackendError("backend_invalid_response", "SprintBoard API returned an invalid JSON response.");
      }
      throw new BackendError("backend_unavailable", "SprintBoard API is unavailable. Start the backend and check SPRINTBOARD_API_URL.");
    }
    // Capacity previews also use ok:false, but have no refusal reason and are
    // valid results. Business refusals can arrive with HTTP 200.
    if (refusal(payload)) {
      throw new BackendError(typeof payload.code === "string" ? payload.code : "backend_refusal", payload.reason);
    }
    if (!response.ok) {
      throw new BackendError("backend_http_error", `SprintBoard API returned HTTP ${response.status}.`);
    }
    return payload;
  }

  return {
    listTasks: () => request("/tasks"),
    checkCapacity: (memberId: string, additionalPoints: number) => request("/check-capacity", { memberId, additionalPoints }),
    proposeAssignment: (taskId: string, memberId: string) => request("/proposals", { taskId, memberId }),
  };
}
