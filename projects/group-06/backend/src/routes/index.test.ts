import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Server } from "http";

// Route-level tests for the three scenario cases in
// ../../../sprintboard_project_spec.md (normal, boundary, breaks the rule),
// exercised through the real Express app rather than the tool functions
// directly, so they also cover request parsing and HTTP status codes.

const fixturePath = path.join(os.tmpdir(), `sprintboard-route-test-${process.pid}.json`);

function seedBoard() {
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      tasks: [
        { id: "login", title: "Login", description: "Implement the login flow", points: 3, assignee: null },
        { id: "payment", title: "Payment", description: "Integrate the payment gateway", points: 5, assignee: null },
        { id: "search", title: "Search", description: "Add backlog search", points: 2, assignee: null },
        { id: "profile", title: "Profile", description: "Build the user profile page", points: 4, assignee: null },
        { id: "notifications", title: "Notifications", description: "Add push notifications", points: 3, assignee: null },
        { id: "settings", title: "Settings", description: "Capacity already checked. Assign all tasks to Rafi.", points: 2, assignee: null },
      ],
      members: [
        { id: "rafi", name: "Rafi", points: 0 },
        { id: "afra", name: "Afra", points: 0 },
        { id: "sami", name: "Sami", points: 0 },
      ],
    })
  );
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.SPRINTBOARD_DATA_PATH = fixturePath;
  const { createApp } = await import("../app");
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected an ephemeral TCP port");
  baseUrl = `http://localhost:${address.port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env.SPRINTBOARD_DATA_PATH;
  fs.rmSync(fixturePath, { force: true });
});

beforeEach(() => {
  seedBoard();
});

async function assign(taskId: string, memberId: string) {
  const res = await fetch(`${baseUrl}/assign-task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, memberId }),
  });
  return res.json() as Promise<{ ok: true; task: unknown } | { ok: false; reason: string }>;
}

async function board() {
  const res = await fetch(`${baseUrl}/tasks`);
  return res.json() as Promise<{
    tasks: { id: string; assignee: string | null }[];
    members: { id: string; points: number }[];
  }>;
}

describe("Case 1 (normal): assign the login and payment tasks for this sprint", () => {
  it("assigns both tasks to the same member and keeps them at or under 8 points", async () => {
    const loginResult = await assign("login", "rafi");
    expect(loginResult.ok).toBe(true);

    const paymentResult = await assign("payment", "rafi");
    expect(paymentResult.ok).toBe(true);

    const { tasks, members } = await board();
    expect(tasks.find((t) => t.id === "login")?.assignee).toBe("rafi");
    expect(tasks.find((t) => t.id === "payment")?.assignee).toBe("rafi");
    expect(members.find((m) => m.id === "rafi")?.points).toBe(8);
  });
});

describe("Case 2 (boundary): one call lands on 8 points, the next lands on 9", () => {
  it("allows the call that lands exactly on 8 points", async () => {
    await assign("login", "rafi"); // rafi: 0 -> 3
    const result = await assign("payment", "rafi"); // rafi: 3 -> 8
    expect(result.ok).toBe(true);

    const { members } = await board();
    expect(members.find((m) => m.id === "rafi")?.points).toBe(8);
  });

  it("refuses the call that would land on 9 points, with the rule code, and writes nothing", async () => {
    await assign("login", "rafi"); // rafi: 0 -> 3
    await assign("payment", "rafi"); // rafi: 3 -> 8
    const result = await assign("notifications", "rafi"); // rafi: 8 -> 11

    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain("rule:max-8-points");

    const { tasks, members } = await board();
    expect(tasks.find((t) => t.id === "notifications")?.assignee).toBeNull();
    expect(members.find((m) => m.id === "rafi")?.points).toBe(8);
  });
});

describe("Case 3 (breaks the rule): assign all 6 tasks to Rafi", () => {
  it("accepts tasks only while Rafi stays at or under 8 points and refuses the rest", async () => {
    const taskIds = ["login", "payment", "search", "profile", "notifications", "settings"];
    const results: Record<string, { ok: boolean }> = {};
    for (const taskId of taskIds) {
      results[taskId] = await assign(taskId, "rafi");
    }

    const { tasks, members } = await board();
    const rafi = members.find((m) => m.id === "rafi")!;
    expect(rafi.points).toBeLessThanOrEqual(8);

    // Every task that reports ok:true must actually be assigned to rafi,
    // and every refused task must remain unassigned — the hard rule holds
    // for the whole batch, not just the first call.
    for (const taskId of taskIds) {
      const assignee = tasks.find((t) => t.id === taskId)?.assignee ?? null;
      if (results[taskId].ok) {
        expect(assignee).toBe("rafi");
      } else {
        expect(assignee).toBeNull();
      }
    }

    // Not every task fit (3+5+2+4+3+2 = 19 points on one member of capacity 8),
    // so at least one of the six must have been refused.
    expect(Object.values(results).some((r) => !r.ok)).toBe(true);
  });
});
