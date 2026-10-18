import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const dataJsonPath = join(projectRoot, 'data.json');
const backupJsonPath = join(projectRoot, 'data.mcp-backup.json');
const mcpServerScript = join(projectRoot, 'src', 'mcp', 'server.js');

/**
 * Helper to run an interactive session with the MCP server over stdio
 */
class McpClient {
  constructor() {
    this.process = spawn('node', [mcpServerScript], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.buffer = '';
    this.resolvers = new Map();

    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop(); // keep remainder

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id !== undefined && this.resolvers.has(msg.id)) {
            const resolve = this.resolvers.get(msg.id);
            this.resolvers.delete(msg.id);
            resolve(msg);
          }
        } catch (e) {
          // Ignore non-json lines
        }
      }
    });
  }

  request(method, params = {}) {
    const id = Date.now() + Math.floor(Math.random() * 10000);
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    }) + '\n';

    return new Promise((resolve) => {
      this.resolvers.set(id, resolve);
      this.process.stdin.write(payload);
    });
  }

  close() {
    this.process.stdin.end();
    this.process.kill();
  }
}

describe('Model Context Protocol (MCP) Server (AIDLC Phase 3 / Unit 4)', () => {
  beforeEach(() => {
    copyFileSync(dataJsonPath, backupJsonPath);
  });

  afterEach(() => {
    copyFileSync(backupJsonPath, dataJsonPath);
    unlinkSync(backupJsonPath);
  });

  test('MCP handshake: initialize & capabilities negotiation', async () => {
    const client = new McpClient();
    try {
      const res = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-agent', version: '1.0.0' }
      });

      assert.equal(res.jsonrpc, '2.0');
      assert.ok(res.result, 'Response must have result');
      assert.equal(res.result.serverInfo.name, 'sprintboard');
      assert.equal(res.result.serverInfo.version, '1.0.0');
      assert.ok(res.result.capabilities.tools, 'Server must declare tools capability');
    } finally {
      client.close();
    }
  });

  test('MCP tool catalog: tools/list returns list_tasks, check_capacity, assign_task', async () => {
    const client = new McpClient();
    try {
      await client.request('initialize');
      const res = await client.request('tools/list');

      assert.equal(res.jsonrpc, '2.0');
      const tools = res.result.tools;
      assert.equal(tools.length, 3);

      const toolNames = tools.map(t => t.name);
      assert.ok(toolNames.includes('list_tasks'), 'Must include list_tasks');
      assert.ok(toolNames.includes('check_capacity'), 'Must include check_capacity');
      assert.ok(toolNames.includes('assign_task'), 'Must include assign_task');

      // Verify assign_task has approved parameter
      const assignTool = tools.find(t => t.name === 'assign_task');
      assert.ok(assignTool.inputSchema.properties.approved, 'assign_task must have approved property');
    } finally {
      client.close();
    }
  });

  test('MCP execution: tools/call list_tasks returns backlog and team capacities', async () => {
    const client = new McpClient();
    try {
      await client.request('initialize');
      const res = await client.request('tools/call', {
        name: 'list_tasks',
        arguments: {}
      });

      assert.equal(res.jsonrpc, '2.0');
      assert.equal(res.result.isError, false);
      const text = res.result.content[0].text;
      const data = JSON.parse(text);

      assert.equal(data.members.length, 3);
      assert.ok(data.tasks.length >= 6);
    } finally {
      client.close();
    }
  });

  test('MCP execution: tools/call check_capacity enforces 8-point limit', async () => {
    const client = new McpClient();
    try {
      await client.request('initialize');

      // 1. Valid: 3 + 5 = 8 points for Sarah -> Allowed
      const resValid = await client.request('tools/call', {
        name: 'check_capacity',
        arguments: { memberName: 'Sarah', taskIds: ['task-1', 'task-2'] }
      });
      assert.equal(resValid.result.isError, false);
      const dataValid = JSON.parse(resValid.result.content[0].text);
      assert.equal(dataValid.allowed, true);
      assert.equal(dataValid.projectedTotal, 8);

      // 2. Over-capacity: 3 + 5 + 1 = 9 points for Sarah -> isError: true
      const resOver = await client.request('tools/call', {
        name: 'check_capacity',
        arguments: { memberName: 'Sarah', taskIds: ['task-1', 'task-2', 'task-6'] }
      });
      assert.equal(resOver.result.isError, true);
      const dataOver = JSON.parse(resOver.result.content[0].text);
      assert.equal(dataOver.allowed, false);
      assert.equal(dataOver.code, 'ERR_MAX_POINTS_EXCEEDED');
      assert.equal(dataOver.projectedTotal, 9);
    } finally {
      client.close();
    }
  });

  test('MCP execution: tools/call assign_task stages proposal without approved flag', async () => {
    const client = new McpClient();
    try {
      await client.request('initialize');

      // Call without approved: true
      const res = await client.request('tools/call', {
        name: 'assign_task',
        arguments: { memberName: 'Sarah', taskIds: ['task-1'] }
      });

      assert.equal(res.result.isError, false);
      const outputText = res.result.content[0].text;
      assert.ok(outputText.includes('PROPOSAL STAGED'), 'Output must announce staged proposal');
      assert.ok(outputText.includes('HUMAN APPROVAL REQUIRED'), 'Output must require human approval');

      // Disk assertion: data.json on disk must remain untouched
      const diskData = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
      const sarah = diskData.members.find(m => m.name === 'Sarah');
      assert.equal(sarah.currentPoints, 0, 'Sarah points must not change without approval');
    } finally {
      client.close();
    }
  });

  test('MCP execution: tools/call assign_task with approved: true commits to data.json', async () => {
    const client = new McpClient();
    try {
      await client.request('initialize');

      // Call with approved: true
      const res = await client.request('tools/call', {
        name: 'assign_task',
        arguments: { memberName: 'Sarah', taskIds: ['task-1', 'task-2'], approved: true } // 3 + 5 = 8 pts
      });

      assert.equal(res.result.isError, false);
      const outputText = res.result.content[0].text;
      assert.ok(outputText.includes('ASSIGNMENT APPROVED & SAVED'), 'Output must confirm save');

      // Disk assertion: data.json on disk must be updated
      const diskData = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
      const sarah = diskData.members.find(m => m.name === 'Sarah');
      assert.equal(sarah.currentPoints, 8, 'Sarah must now have 8 points');
      const task1 = diskData.tasks.find(t => t.id === 'task-1');
      assert.equal(task1.status, 'assigned');
      assert.equal(task1.assignee, 'Sarah');
    } finally {
      client.close();
    }
  });

  test('MCP execution: tools/call assign_task refuses over-capacity even if approved: true', async () => {
    const client = new McpClient();
    try {
      await client.request('initialize');

      // Attempt to assign 16 points (all 6 tasks) to Rafi with approved: true
      const allTaskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6'];
      const res = await client.request('tools/call', {
        name: 'assign_task',
        arguments: { memberName: 'Rafi', taskIds: allTaskIds, approved: true }
      });

      assert.equal(res.result.isError, true);
      const outputText = res.result.content[0].text;
      assert.ok(outputText.includes('ERR_MAX_POINTS_EXCEEDED'), 'Must return rule error code');
      assert.ok(outputText.includes('ASSIGNMENT REFUSED'), 'Must declare assignment refused');

      // Disk assertion: zero writes to disk
      const diskData = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
      const rafi = diskData.members.find(m => m.name === 'Rafi');
      assert.equal(rafi.currentPoints, 0);
    } finally {
      client.close();
    }
  });
});
