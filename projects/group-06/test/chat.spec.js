import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const dataJsonPath = join(projectRoot, 'data.json');
const backupJsonPath = join(projectRoot, 'data.chat-backup.json');

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

test.describe('In-UI Chat Agent Integration (AIDLC Phase 3 / Unit 5)', () => {
  test.beforeAll(() => {
    copyFileSync(dataJsonPath, backupJsonPath);
  });

  test.afterAll(() => {
    copyFileSync(backupJsonPath, dataJsonPath);
    unlinkSync(backupJsonPath);
  });

  test.beforeEach(() => {
    resetDataJson();
  });

  test('Milestone 2 - Case 1: Plain language assignment in chat stages proposal and saves on Approve', async ({ page }) => {
    await page.goto('/');

    // 1. Open Chat Drawer
    await page.click('#btn-toggle-chat');
    const drawer = page.locator('#chat-drawer');
    await expect(drawer).toBeVisible();

    // 2. Type Case 1 request
    await page.fill('#chat-input', 'Assign the login and payment tasks for this sprint.');
    await page.click('#btn-chat-send');

    // 3. Verify Assistant response in chat
    const lastAssistantMsg = page.locator('.message.assistant .msg-content').last();
    await expect(lastAssistantMsg).toBeVisible();
    await expect(lastAssistantMsg).toContainText('prepared an assignment proposal');
    await expect(lastAssistantMsg).toContainText('Human approval required');

    // 4. Verify proposal card is staged in the main UI
    const proposalCard = page.locator('#proposal-card');
    await expect(proposalCard).toBeVisible();
    await expect(page.locator('#prop-task-count')).toHaveText('2 task(s)');
    await expect(page.locator('#prop-points-added')).toHaveText('+8 pts');

    // 5. Verify data.json on disk is NOT touched before approval
    const diskBefore = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    const loginTaskBefore = diskBefore.tasks.find(t => t.id === 'task-1');
    expect(loginTaskBefore.status).toBe('backlog');

    // 6. Click Approve button
    await page.click('#btn-approve-proposal');
    await expect(page.locator('.toast-success').filter({ hasText: 'Approved! Saved to data.json' })).toBeVisible();

    // 7. Verify data.json on disk has updated
    const diskAfter = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    const loginTaskAfter = diskAfter.tasks.find(t => t.id === 'task-1');
    expect(loginTaskAfter.status).toBe('assigned');
  });

  test('Milestone 2 - Case 4: Ambiguous request ("Assign the remaining tasks") returns clarifying question', async ({ page }) => {
    await page.goto('/');

    // 1. Open Chat Drawer
    await page.click('#btn-toggle-chat');

    // 2. Type Case 4 request
    await page.fill('#chat-input', 'Assign the remaining tasks.');
    await page.click('#btn-chat-send');

    // 3. Verify Assistant asks clarifying questions
    const lastAssistantMsg = page.locator('.message.assistant .msg-content').last();
    await expect(lastAssistantMsg).toBeVisible();
    await expect(lastAssistantMsg).toContainText('Which specific tasks would you like to assign?');
    await expect(lastAssistantMsg).toContainText('To which team member(s) should they be assigned?');

    // 4. Verify that NO proposal card was staged
    await expect(page.locator('#proposal-card')).toBeHidden();

    // 5. Verify zero writes to data.json
    const disk = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
    const unassignedCount = disk.tasks.filter(t => t.status === 'backlog').length;
    expect(unassignedCount).toBe(6);
  });
});
