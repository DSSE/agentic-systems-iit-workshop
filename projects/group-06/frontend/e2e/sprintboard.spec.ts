import { test, expect, type Page } from "@playwright/test";
import { apiAssign, seedBoard, MAX_POINTS } from "./fixtures";

// 10 end-to-end edge-case tests over the real UI (frontend/app/page.tsx)
// talking to the real backend, driven by Playwright. Complements the
// vitest unit/route-level suite in backend/src — this suite instead
// exercises the browser-rendered behaviour: disabled states, live
// preview, and what actually persists across a reload.
//
// Each test reseeds backend/data.e2e.json (a dedicated fixture, never
// the real data.json) so tests don't leak state into each other.

function backlogRow(page: Page, title: string) {
  return page.locator("table").first().getByRole("row", { name: new RegExp(title) });
}

function assignedRow(page: Page, title: string) {
  return page.locator("section", { hasText: "Assigned" }).getByRole("row", { name: new RegExp(title) });
}

function memberCard(page: Page, name: string) {
  return page.locator(".member-card", { hasText: name });
}

test.beforeEach(async ({ page }) => {
  seedBoard();
  await page.goto("/");
  await expect(page.getByText("Login", { exact: true })).toBeVisible();
});

test("1. initial load renders the backlog and members from list_tasks", async ({ page }) => {
  for (const title of ["Login", "Payment", "Search", "Profile", "Notifications", "Settings"]) {
    await expect(backlogRow(page, title)).toBeVisible();
  }
  for (const name of ["Rafi", "Afra", "Sami"]) {
    await expect(memberCard(page, name)).toContainText(`0 / ${MAX_POINTS} pts`);
  }
  await expect(page.locator("section", { hasText: "Assigned" })).toContainText("No tasks assigned yet.");
});

test("2. Approve is disabled until a member is selected (zero-state)", async ({ page }) => {
  const row = backlogRow(page, "Login");
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
});

test("3. the capacity preview is read-only and writes nothing until Approve", async ({ page }) => {
  const row = backlogRow(page, "Login");
  await row.getByRole("combobox").selectOption({ label: "Rafi" });
  await expect(row.locator(".preview-ok")).toContainText("OK");

  // Reload without ever clicking Approve: the preview must not have
  // persisted anything.
  await page.reload();
  await expect(page.getByText("Login", { exact: true })).toBeVisible();
  await expect(backlogRow(page, "Login")).toBeVisible();
  await expect(memberCard(page, "Rafi")).toContainText(`0 / ${MAX_POINTS} pts`);
  await expect(backlogRow(page, "Login").getByRole("combobox")).toHaveValue("");
});

test("4. boundary: two approvals landing exactly on 8 points both succeed", async ({ page }) => {
  const login = backlogRow(page, "Login"); // 3 pts
  await login.getByRole("combobox").selectOption({ label: "Rafi" });
  await expect(login.locator(".preview-ok")).toBeVisible();
  await login.getByRole("button", { name: "Approve" }).click();
  await expect(assignedRow(page, "Login")).toBeVisible();
  await expect(memberCard(page, "Rafi")).toContainText(`3 / ${MAX_POINTS} pts`);

  const payment = backlogRow(page, "Payment"); // +5 = 8, boundary
  await payment.getByRole("combobox").selectOption({ label: "Rafi" });
  await expect(payment.locator(".preview-ok")).toContainText(`8/${MAX_POINTS}`);
  await payment.getByRole("button", { name: "Approve" }).click();

  await expect(assignedRow(page, "Payment")).toBeVisible();
  const rafi = memberCard(page, "Rafi");
  await expect(rafi).toContainText(`8 / ${MAX_POINTS} pts`);
  await expect(rafi.locator(".bar-fill")).toHaveClass(/full/);
});

test("5. breaking: a refused preview keeps Approve disabled, so the UI can't submit it", async ({ page, request }) => {
  // Precondition via the API: Rafi is already at 8 points.
  await apiAssign(request, "t1", "rafi"); // 3
  await apiAssign(request, "t2", "rafi"); // +5 = 8
  await page.reload();
  await expect(memberCard(page, "Rafi")).toContainText(`8 / ${MAX_POINTS} pts`);

  const row = backlogRow(page, "Search"); // +2 = 10, breaks the rule
  await row.getByRole("combobox").selectOption({ label: "Rafi" });
  await expect(row.locator(".preview-refused")).toContainText("Refused");
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
});

test("6. switching the selected member refreshes a stale preview", async ({ page, request }) => {
  await apiAssign(request, "t1", "rafi"); // 3
  await apiAssign(request, "t2", "rafi"); // +5 = 8
  await page.reload();

  const row = backlogRow(page, "Search"); // 2 pts
  await row.getByRole("combobox").selectOption({ label: "Rafi" }); // 8 + 2 = 10, refused
  await expect(row.locator(".preview-refused")).toBeVisible();
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();

  await row.getByRole("combobox").selectOption({ label: "Afra" }); // 0 + 2 = 2, ok
  await expect(row.locator(".preview-ok")).toBeVisible();
  await expect(row.locator(".preview-refused")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Approve" })).toBeEnabled();
});

test("7. clearing the member selection clears the preview and disables Approve again", async ({ page }) => {
  const row = backlogRow(page, "Login");
  await row.getByRole("combobox").selectOption({ label: "Rafi" });
  await expect(row.locator(".preview-ok")).toBeVisible();
  await expect(row.getByRole("button", { name: "Approve" })).toBeEnabled();

  await row.getByRole("combobox").selectOption(""); // back to "Select member" (value="")
  await expect(row.locator(".preview-ok, .preview-refused")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
});

test("8. full scenario: assigning all 6 backlog tasks to one member through the UI never exceeds 8 points", async ({ page }) => {
  const titles = ["Login", "Payment", "Search", "Profile", "Notifications", "Settings"]; // 3+5+2+4+3+2 = 19

  for (const title of titles) {
    const row = backlogRow(page, title);
    await row.getByRole("combobox").selectOption({ label: "Rafi" });

    const ok = await row.locator(".preview-ok").isVisible();
    if (ok) {
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(assignedRow(page, title)).toBeVisible();
    } else {
      await expect(row.locator(".preview-refused")).toBeVisible();
      await expect(row.getByRole("button", { name: "Approve" })).toBeDisabled();
    }
  }

  const rafi = memberCard(page, "Rafi");
  const pointsText = await rafi.textContent();
  const [points] = /(\d+) \/ \d+ pts/.exec(pointsText ?? "")?.slice(1) ?? ["NaN"];
  expect(Number(points)).toBeLessThanOrEqual(MAX_POINTS);

  // 19 total points can never all fit in an 8-point capacity, so at least
  // one task must still be sitting in the backlog, refused.
  const stillInBacklog = await page.locator("table").first().locator("tbody tr").count();
  expect(stillInBacklog).toBeGreaterThan(0);
});

test("9. Approve disables itself immediately (\"Saving…\") so a second click can't double-assign", async ({ page }) => {
  // Slow the assign-task response down so the brief "Saving…" window is
  // reliably observable instead of racing a sub-millisecond localhost reply.
  await page.route("**/assign-task", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });

  const row = backlogRow(page, "Login");
  await row.getByRole("combobox").selectOption({ label: "Rafi" });
  // Matches both "Approve" and "Saving…" — its accessible name changes the
  // instant the click handler sets busyTask, before the delayed response.
  const approveButton = row.getByRole("button", { name: /Approve|Saving/ });
  await approveButton.click();

  await expect(approveButton).toBeDisabled();
  await expect(approveButton).toHaveText("Saving…");

  await expect(assignedRow(page, "Login")).toBeVisible();
  // Exactly one assignment's worth of points (3), never double-counted.
  await expect(memberCard(page, "Rafi")).toContainText(`3 / ${MAX_POINTS} pts`);
});

test("10. approvals persist across a fresh reload; unapproved preview state does not", async ({ page }) => {
  const login = backlogRow(page, "Login");
  await login.getByRole("combobox").selectOption({ label: "Rafi" });
  await login.getByRole("button", { name: "Approve" }).click();
  await expect(assignedRow(page, "Login")).toBeVisible();

  // Start (but never approve) a second selection on a different task.
  const payment = backlogRow(page, "Payment");
  await payment.getByRole("combobox").selectOption({ label: "Afra" });
  await expect(payment.locator(".preview-ok")).toBeVisible();

  await page.reload();

  // The real assignment survived the reload (served fresh from
  // data.e2e.json by the backend)...
  await expect(assignedRow(page, "Login")).toBeVisible();
  await expect(memberCard(page, "Rafi")).toContainText(`3 / ${MAX_POINTS} pts`);

  // ...but the never-approved preview on Payment did not: it's back in
  // the backlog with no member selected and no preview.
  const paymentAfter = backlogRow(page, "Payment");
  await expect(paymentAfter).toBeVisible();
  await expect(paymentAfter.getByRole("combobox")).toHaveValue("");
  await expect(paymentAfter.locator(".preview-ok, .preview-refused")).toHaveCount(0);
  await expect(memberCard(page, "Afra")).toContainText(`0 / ${MAX_POINTS} pts`);
});
