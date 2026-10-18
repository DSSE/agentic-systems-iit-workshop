import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connectRemote({ baseUrl = process.env.CAMPUSDESK_API_URL || "http://localhost:4000",
  email = process.env.CAMPUSDESK_EMAIL, password = process.env.CAMPUSDESK_PASSWORD, name = "campusdesk-cli" } = {}) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || (base.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("Use HTTPS for remote accounts; HTTP is supported only on loopback.");
  }
  if (!email || !password) throw new Error("Set CAMPUSDESK_EMAIL and CAMPUSDESK_PASSWORD in your private environment file.");
  const login = await fetch(new URL("/api/auth/login", base), { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000) });
  if (!login.ok) throw new Error(`Sign-in failed (${login.status}). Check the account configuration.`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  const token = cookie?.split("=")[1];
  if (!token) throw new Error("Sign-in did not return a session.");
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", base), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  try { await client.connect(transport); }
  catch (error) { await client.close(); throw error; }
  return { client, close: async () => {
    await client.close();
    await fetch(new URL("/api/auth/logout", base), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  } };
}
