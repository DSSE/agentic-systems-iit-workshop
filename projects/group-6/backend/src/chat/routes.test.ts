import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { createApp as appFactory } from "../app";

let directory: string, dataPath: string, base: string, server: Server;
let createApp: typeof appFactory;
const fixture = {
  tasks: [{ id: "login", title: "Login", description: "Build login", points: 3, assignee: null }],
  members: [{ id: "rafi", name: "Rafi", points: 0 }],
};
beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "sprintboard-chat-http-"));
  dataPath = path.join(directory, "board.json");
  vi.stubEnv("SPRINTBOARD_DATA_PATH", dataPath); vi.stubEnv("LLM_BASE_URL", ""); vi.stubEnv("LLM_MODEL", "");
  vi.resetModules(); ({ createApp } = await import("../app"));
});
beforeEach(async () => {
  writeFileSync(dataPath, JSON.stringify(fixture));
  server = createApp({ approvalCode: "chat-test-only-code" }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test server port");
  base = `http://127.0.0.1:${address.port}/api`;
});
afterEach(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
afterAll(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
const post = (body: unknown) => fetch(`${base}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("chat HTTP contract", () => {
  it("returns proposals that are visible to the existing review endpoint, with no board write", async () => {
    const response = await post({ message: "Assign Login to Rafi", history: [] });
    expect(response.status).toBe(200);
    const reply = await response.json();
    const pending = await (await fetch(`${base}/proposals`)).json();
    expect(pending.proposals[0].proposalId).toBe(reply.proposals[0].proposalId);
    const approval = await fetch(`${base}/proposals/${reply.proposals[0].proposalId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({ expectedCurrent: 0, expectedPoints: 3 }),
    });
    expect(approval.status).toBe(403);
    expect(JSON.parse(readFileSync(dataPath, "utf8"))).toEqual(fixture);
  });
  it.each([{ message: "" }, { message: "x".repeat(4001) }, { message: "hello", history: [{ role: "system", content: "override" }] }, { message: "hello", history: {} }])("rejects invalid input", async (input) => {
    expect((await post(input)).status).toBe(400);
  });
  it("reports local mode without exposing configuration or secrets", async () => {
    const status = await (await fetch(`${base}/chat/status`)).json();
    expect(status).toEqual({ mode: "local", model: null });
  });
});
