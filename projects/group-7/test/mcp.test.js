import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { read, useSeedData } from './helpers.js';

const serverPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mcp-server.js');

// Starts the real MCP server as a child process over stdio, like an agent would.
describe('MCP server', () => {
  let client;
  let file;

  before(async () => {
    file = useSeedData();
    client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [serverPath],
        env: { ...process.env, CLUBOPS_DATA: file },
      }),
    );
  });

  after(() => client.close());

  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return { ...result, data: JSON.parse(result.content[0].text) };
  };

  test('exposes list, check and add tools, and no approve tool', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['add_expense', 'check_budget', 'list_vendors']);
  });

  test('list_vendors returns the vendors', async () => {
    const { data } = await call('list_vendors');
    assert.equal(data.vendors.length, 5);
  });

  test('case 3: over-cap order is refused with the rule code', async () => {
    const result = await call('add_expense', { vendorId: 'v3', quantity: 200 });
    assert.equal(result.isError, true);
    assert.equal(result.data.error, 'BUDGET_CAP_EXCEEDED');
  });

  test('check_budget tells the agent a smaller order that fits', async () => {
    const { data } = await call('check_budget', { vendorId: 'v3', quantity: 200 });
    assert.equal(data.check.fits, false);
    assert.ok(data.check.maxQuantity > 0);
  });

  test('case 1: add_expense only creates a pending proposal and saves nothing', async () => {
    const before = read(file);
    const { data } = await call('add_expense', { vendorId: 'v1', quantity: 50 });
    assert.equal(data.proposal.status, 'pending');
    assert.equal(read(file), before, 'data.json untouched');
    const budget = (await call('check_budget', { vendorId: 'v1', quantity: 1 })).data.budget;
    assert.equal(budget.pending, 3000);
    assert.equal(budget.spent, 3000);
  });

  test('invalid input is rejected by the tool schema', async () => {
    const result = await client
      .callTool({ name: 'add_expense', arguments: { vendorId: 'v1', quantity: -5 } })
      .catch(() => ({ isError: true }));
    assert.equal(result.isError, true);
  });
});
