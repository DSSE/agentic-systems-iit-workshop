import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const fixturePath = path.join(os.tmpdir(), `sprintboard-test-${process.pid}.json`);

function seedFixture() {
  fs.writeFileSync(
    fixturePath,
    JSON.stringify({
      tasks: [
        { id: "t1", title: "Login", description: "", points: 3, assignee: null },
        { id: "t2", title: "Payment", description: "", points: 5, assignee: null },
        { id: "t3", title: "Already assigned", description: "", points: 1, assignee: "rafi" },
      ],
      members: [{ id: "rafi", name: "Rafi", points: 5 }],
    })
  );
}

beforeEach(() => {
  process.env.SPRINTBOARD_DATA_PATH = fixturePath;
  seedFixture();
});

afterEach(() => {
  delete process.env.SPRINTBOARD_DATA_PATH;
  fs.rmSync(fixturePath, { force: true });
});

describe("assignTask", () => {
  it("writes the assignment and updates the member's points when it lands exactly on 8", async () => {
    const { assignTask } = await import("./assignTask");
    const result = assignTask("t1", "rafi");
    expect(result.ok).toBe(true);

    const { readBoard } = await import("../data/store");
    const board = readBoard();
    expect(board.tasks.find((t) => t.id === "t1")?.assignee).toBe("rafi");
    expect(board.members.find((m) => m.id === "rafi")?.points).toBe(8);
  });

  it("refuses and does not write when the hard rule would be broken (9 points)", async () => {
    const { assignTask } = await import("./assignTask");
    const result = assignTask("t2", "rafi"); // 5 + 5 = 10
    expect(result.ok).toBe(false);

    const { readBoard } = await import("../data/store");
    const board = readBoard();
    expect(board.tasks.find((t) => t.id === "t2")?.assignee).toBeNull();
    expect(board.members.find((m) => m.id === "rafi")?.points).toBe(5);
  });

  it("refuses to reassign a task that already has an assignee", async () => {
    const { assignTask } = await import("./assignTask");
    const result = assignTask("t3", "rafi");
    expect(result.ok).toBe(false);
  });
});
