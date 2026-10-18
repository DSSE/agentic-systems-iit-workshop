const BACKEND = process.env.SPRINTBOARD_API_URL ?? "http://127.0.0.1:4000/api";
const UI_ORIGINS = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);

// Keep browser requests on the page's origin, including the HttpOnly approval
// cookie. Only the two local UI origins may reach the backend through this proxy.
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const origin = request.headers.get("origin");
  // NextURL normalizes 127.0.0.1 to localhost; compare the browser's actual Host
  // instead so a genuine same-origin POST is not rejected after normalization.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const pageOrigin = `${new URL(request.url).protocol}//${host}`;
  if (!UI_ORIGINS.has(pageOrigin) || (origin && origin !== pageOrigin)
    || (request.method === "POST" && !origin)) {
    return Response.json({ ok: false, reason: "Use the local SprintBoard UI", code: "origin_forbidden" }, { status: 403 });
  }
  const { path } = await context.params;
  const headers = new Headers({ "Origin": "http://127.0.0.1:3000", "Content-Type": "application/json" });
  for (const name of ["cookie", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${BACKEND}/${path.map(encodeURIComponent).join("/")}`, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(path[0] === "chat" ? 85000 : 12000),
      redirect: "error",
    });
    const responseHeaders = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    const cookie = upstream.headers.get("set-cookie");
    if (cookie) responseHeaders.set("set-cookie", cookie);
    return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ ok: false, code: "backend_unavailable", reason: "The backend is unavailable. Start it on port 4000 and retry." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
