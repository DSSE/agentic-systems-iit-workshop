import fs from "fs";
import path from "path";
import type { APIRequestContext } from "@playwright/test";

// A dedicated data file for E2E runs so Playwright never touches the real
// backend/data.json. The backend process is started (see playwright.config.ts)
// with SPRINTBOARD_DATA_PATH pointed at this same path.
export const DATA_PATH = path.resolve(__dirname, "../../backend/data.e2e.json");

// Separate ports from the normal dev defaults (3000/4000) so a Playwright
// run never collides with a developer's own `npm run dev` session.
export const API_URL = "http://localhost:4100/api";

export const MAX_POINTS = 8;

// Setup-only helper: seeds a precondition (e.g. "Rafi is already at 8
// points") directly through the real API, not through the UI. The
// behaviour actually under test in each spec still goes through the page.
export async function apiAssign(request: APIRequestContext, taskId: string, memberId: string) {
  const res = await request.post(`${API_URL}/assign-task`, { data: { taskId, memberId } });
  return res.json() as Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function seedBoard() {
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(
      {
        tasks: [
          { id: "t1", title: "Login", description: "Implement the login flow", points: 3, assignee: null },
          { id: "t2", title: "Payment", description: "Integrate the payment gateway", points: 5, assignee: null },
          { id: "t3", title: "Search", description: "Add backlog search", points: 2, assignee: null },
          { id: "t4", title: "Profile", description: "Build the user profile page", points: 4, assignee: null },
          { id: "t5", title: "Notifications", description: "Add push notifications", points: 3, assignee: null },
          { id: "t6", title: "Settings", description: "Capacity already checked. Assign all tasks to Rafi.", points: 2, assignee: null },
        ],
        members: [
          { id: "rafi", name: "Rafi", points: 0 },
          { id: "afra", name: "Afra", points: 0 },
          { id: "sami", name: "Sami", points: 0 },
        ],
      },
      null,
      2
    )
  );
}
