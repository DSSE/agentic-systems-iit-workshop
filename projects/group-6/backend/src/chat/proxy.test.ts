import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../../frontend/app/api/[...path]/route";

function makeRequest(url: string, init: RequestInit = {}) {
  const request = new Request(url, init);
  request.headers.set("host", new URL(url).host);
  return request;
}

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());

describe("same-origin frontend API proxy", () => {
  it.each(["http://127.0.0.1:3000", "http://localhost:3000"])("reads the board at %s without cross-origin browser fetches", async (origin) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ tasks: [], members: [] }));
    vi.stubGlobal("fetch", upstream);
    const result = await GET(makeRequest(`${origin}/api/tasks`), context(["tasks"]));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ tasks: [], members: [] });
    const headers = upstream.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Origin")).toBe("http://127.0.0.1:3000");
  });
  it("forwards only the browser session and CSRF token and preserves the HttpOnly cookie", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ authenticated: true }, {
      headers: { "Set-Cookie": "sprintboard_approver=test-session; Path=/api; HttpOnly; SameSite=Strict" },
    }));
    vi.stubGlobal("fetch", upstream);
    const request = makeRequest("http://localhost:3000/api/approval-session", {
      method: "POST", headers: { Origin: "http://localhost:3000", Cookie: "sprintboard_approver=test-session", "X-CSRF-Token": "test-csrf" },
      body: JSON.stringify({ code: "test-code" }),
    });
    const response = await POST(request, context(["approval-session"]));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    const headers = upstream.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("cookie")).toBe("sprintboard_approver=test-session");
    expect(headers.get("x-csrf-token")).toBe("test-csrf");
    expect(upstream.mock.calls[0][1]?.body).toBe(JSON.stringify({ code: "test-code" }));
  });
  it.each([
    ["http://127.0.0.1:3000", "https://untrusted.example"],
    ["http://127.0.0.1:3000", "http://localhost:3000"],
    ["https://untrusted.example", "https://untrusted.example"],
    ["http://127.0.0.1:3000", ""],
  ])("rejects a POST to %s from %s before reaching the backend", async (target, origin) => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", upstream);
    const result = await POST(makeRequest(`${target}/api/proposals`, {
      method: "POST", headers: origin ? { Origin: origin } : {}, body: "{}",
    }), context(["proposals"]));
    expect(result.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("does not create approval credentials when forwarding a proposal", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "pending_approval" }));
    vi.stubGlobal("fetch", upstream);
    await POST(makeRequest("http://127.0.0.1:3000/api/proposals", {
      method: "POST", headers: { Origin: "http://127.0.0.1:3000" }, body: "{}",
    }), context(["proposals"]));
    const headers = upstream.mock.calls[0][1]?.headers as Headers;
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("x-csrf-token")).toBe(false);
  });
  it("turns an unreachable backend into a retryable JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await GET(makeRequest("http://127.0.0.1:3000/api/tasks"), context(["tasks"]));
    expect(result.status).toBe(502);
    expect(await result.json()).toMatchObject({ code: "backend_unavailable" });
  });
});
