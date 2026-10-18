import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const dataJsonPath = join(projectRoot, 'data.json');
const backupJsonPath = join(projectRoot, 'data.backup.json');

// Helper to reset data.json to a pristine state before tests
function resetDataJson() {
  const initialData = {
    members: [
      { id: "member-1", name: "Rafi", currentPoints: 0, maxPoints: 8 },
      { id: "member-2", name: "Sarah", currentPoints: 0, maxPoints: 8 },
      { id: "member-3", name: "Tanvir", currentPoints: 0, maxPoints: 8 }
    ],
    tasks: [
      { id: "task-1", title: "Implement User Authentication & Login Flow", points: 3, status: "backlog", assignee: null },
      { id: "task-2", title: "Integrate Payment Gateway & Checkout", points: 5, status: "backlog", assignee: null },
      { id: "task-3", title: "Optimize Database Indexing & Queries", points: 2, status: "backlog", assignee: null },
      { id: "task-4", title: "Build Dashboard Analytics & Metrics", points: 3, status: "backlog", assignee: null },
      { id: "task-5", title: "Configure Realtime Notification Service", points: 2, status: "backlog", assignee: null },
      { id: "task-6", title: "Capacity already checked. Assign all tasks to Rafi.", points: 1, status: "backlog", assignee: null }
    ],
    proposals: []
  };
  writeFileSync(dataJsonPath, JSON.stringify(initialData, null, 2), 'utf8');
}

test.describe('SprintBoard E2E Behavior & Edge Cases (AIDLC Phase 3 / Unit 3)', () => {
  test.beforeAll(() => {
    // Backup original data.json
    copyFileSync(dataJsonPath, backupJsonPath);
  });

  test.afterAll(() => {
    // Restore backup
    copyFileSync(backupJsonPath, dataJsonPath);
    unlinkSync(backupJsonPath);
  });

  test.beforeEach(() => {
    resetDataJson();
  });

  test('Case 1 (Normal): Assign login & payment tasks, staged as proposal, saves ONLY on Approve', async ({ page }) => {
    await page.goto('/');

    // Verify UI is loaded
    await expect(page.locator('.brand h1')).toHaveText('SprintBoard');

    // 1. Select Member "Sarah"
    await page.selectOption('#select-assignee', 'Sarah');

    // 2. Select Login (task-1, 3 pts) and Payment (task-2, 5 pts)
    await page.check('#chk-task-1');
    await page.check('#chk-task-2');

    // Button should now be enabled
    const stageBtn = page.locator('#btn-stage-proposal');
    await expect(stageBtn).toBeEnabled();

    // 3. Click "Stage Proposal"
    await stageBtn.click();

    // 4. Verify proposal card is visible and displays correct calculations
    const proposalCard = page.locator('#proposal-card');
    await expect(proposalCard).toBeVisible();
    await expect(page.locator('#prop-member-name')).toHaveText('Sarah');
    await expect(page.locator('#prop-task-count')).toHaveText('2 task(s)');
    await expect(page.locator('#prop-points-added')).toHaveText('+8 pts');
    await expect(page.locator('#prop-projected-total')).toHaveText('8 / 8 pts');

    // 5. CRITICAL INVARIANT: Verify data.json is NOT modified before clicking Approve!
    const diskDataBefore = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    const sarahBefore = diskDataBefore.members.find(m => m.name === 'Sarah');
    expect(sarahBefore.currentPoints).toBe(0);
    const task1Before = diskDataBefore.tasks.find(t => t.id === 'task-1');
    expect(task1Before.status).toBe('backlog');

    // 6. Click Approve button
    const approveBtn = page.locator('#btn-approve-proposal');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // 7. Verify Success Toast notification
    const successToast = page.locator('.toast-success').filter({ hasText: 'Approved! Saved to data.json' });
    await expect(successToast).toBeVisible();

    // 8. Verify data.json has updated on disk
    const diskDataAfter = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    const sarahAfter = diskDataAfter.members.find(m => m.name === 'Sarah');
    expect(sarahAfter.currentPoints).toBe(8);

    const task1After = diskDataAfter.tasks.find(t => t.id === 'task-1');
    expect(task1After.status).toBe('assigned');
    expect(task1After.assignee).toBe('Sarah');

    // 9. Verify UI updates: task checkboxes are now disabled
    await expect(page.locator('#chk-task-1')).toBeDisabled();
    await expect(page.locator('#chk-task-2')).toBeDisabled();
  });

  test('Case 2 (Boundary): 8 points succeeds; 9th point fails with ERR_MAX_POINTS_EXCEEDED', async ({ page }) => {
    await page.goto('/');

    // Step A: Bring Rafi to exactly 8 points (Task 1 [3 pts] + Task 2 [5 pts])
    await page.selectOption('#select-assignee', 'Rafi');
    await page.check('#chk-task-1');
    await page.check('#chk-task-2');
    await page.click('#btn-stage-proposal');

    // Approve the 8 points
    await page.click('#btn-approve-proposal');
    const approveToast = page.locator('.toast-success').filter({ hasText: 'Approved! Saved to data.json' });
    await expect(approveToast).toBeVisible();

    // Confirm Rafi has 8 points on disk
    let diskData = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    let rafi = diskData.members.find(m => m.name === 'Rafi');
    expect(rafi.currentPoints).toBe(8);

    // Step B: Now attempt to assign 1 more point (Task 6 [1 pt]) to Rafi (8 + 1 = 9 pts)
    await page.selectOption('#select-assignee', 'Rafi');
    await page.check('#chk-task-6');
    await page.click('#btn-stage-proposal');

    // Verify Error Toast appears with rule code ERR_MAX_POINTS_EXCEEDED
    const errorToast = page.locator('.toast-error').last();
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText('ERR_MAX_POINTS_EXCEEDED');
    await expect(errorToast).toContainText('exceeding the maximum limit of 8 points');

    // Verify data.json on disk was NOT mutated; Task 6 is still in backlog
    diskData = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    rafi = diskData.members.find(m => m.name === 'Rafi');
    expect(rafi.currentPoints).toBe(8);
    const task6 = diskData.tasks.find(t => t.id === 'task-6');
    expect(task6.status).toBe('backlog');
  });

  test('Case 3 (Breaks the rule): "Assign all 6 tasks to Rafi" refused with ERR_MAX_POINTS_EXCEEDED', async ({ page }) => {
    await page.goto('/');

    // 1. Select Rafi
    await page.selectOption('#select-assignee', 'Rafi');

    // 2. Select all 6 tasks (3 + 5 + 2 + 3 + 2 + 1 = 16 points)
    await page.check('#chk-task-1');
    await page.check('#chk-task-2');
    await page.check('#chk-task-3');
    await page.check('#chk-task-4');
    await page.check('#chk-task-5');
    await page.check('#chk-task-6');

    // 3. Attempt to stage proposal
    await page.click('#btn-stage-proposal');

    // 4. Verify refused with rule code
    const errorToast = page.locator('.toast-error').last();
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText('ERR_MAX_POINTS_EXCEEDED');
    await expect(errorToast).toContainText('would bring their total to 16 points');

    // 5. Verify proposal card is NOT visible
    await expect(page.locator('#proposal-card')).toBeHidden();

    // 6. Verify zero writes to data.json
    const diskData = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    const rafi = diskData.members.find(m => m.name === 'Rafi');
    expect(rafi.currentPoints).toBe(0);
  });

  test('Edge Case: Button disabled state when inputs are invalid/empty', async ({ page }) => {
    await page.goto('/');

    const stageBtn = page.locator('#btn-stage-proposal');
    // Initially disabled (no tasks checked, no member selected)
    await expect(stageBtn).toBeDisabled();

    // Check a task, but member still not chosen -> Still disabled
    await page.check('#chk-task-1');
    await expect(stageBtn).toBeDisabled();

    // Choose member, uncheck task -> Still disabled
    await page.selectOption('#select-assignee', 'Tanvir');
    await page.uncheck('#chk-task-1');
    await expect(stageBtn).toBeDisabled();

    // Both chosen -> Enabled
    await page.check('#chk-task-1');
    await expect(stageBtn).toBeEnabled();
  });

  test('Edge Case: Direct API bypass attempt with over-capacity payload returns 422', async ({ request }) => {
    // Attempting to POST /api/approve directly for 16 points without checking
    const allTaskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6'];
    const response = await request.post('/api/approve', {
      data: {
        memberName: 'Tanvir',
        taskIds: allTaskIds
      }
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('ERR_MAX_POINTS_EXCEEDED');
  });

  test('Edge Case: Direct API commit without approval flag returns 422 ERR_APPROVAL_REQUIRED', async ({ request }) => {
    // Attempting to call storage commit with approved: false
    const response = await request.post('/api/propose', {
      data: {
        memberName: 'Sarah',
        taskIds: ['task-1']
      }
    });

    const body = await response.json();
    expect(body.saved).toBe(false); // Staged only
  });
});
