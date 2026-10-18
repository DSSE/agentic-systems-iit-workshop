import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Resolve from the script so the check also works when called from the repo root.
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const json = async (path) => JSON.parse(await read(path));

try {
  assert(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22+ is required');
  for (const path of ['README.md', 'CLAUDE.md', 'AGENTS.md', 'specs/agent.md', 'progress.html']) {
    const contents = await read(path);
    assert(contents.trim(), `${path} is empty`);
    assert(!/<Project name>|<N>|<One line:/.test(contents), `${path} has template placeholders`);
  }

  const pkg = await json('package.json');
  assert.equal(pkg.private, true, 'The workshop package must be private');
  assert.equal(pkg.type, 'module', 'Use ES modules');
  const settings = await json('.claude/settings.json');
  assert(Array.isArray(settings.permissions?.allow), 'Missing Claude allow list');
  assert(Array.isArray(settings.permissions?.deny), 'Missing Claude deny list');

  const env = await read('.env.example');
  for (const name of ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL']) {
    assert(new RegExp(`^${name}=\\s*$`, 'm').test(env), `${name} must be an empty placeholder`);
  }
  assert(/^LAB_TIMEZONE=Asia\/Dhaka\s*$/m.test(env), 'Missing lab timezone default');

  const data = await json('data.json');
  assert(Array.isArray(data.equipment) && data.equipment.length > 0, 'Seed equipment is missing');
  assert(Array.isArray(data.loans), 'Seed loans must be an array');
  const equipmentIds = new Set();
  for (const item of data.equipment) {
    assert(typeof item.id === 'string' && item.id.trim(), 'Equipment ID is required');
    assert(!equipmentIds.has(item.id), `Duplicate equipment ID: ${item.id}`);
    equipmentIds.add(item.id);
    assert(typeof item.name === 'string' && item.name.trim(), 'Equipment name is required');
    assert(typeof item.description === 'string', 'Equipment description is required');
    assert(Number.isInteger(item.total_quantity) && item.total_quantity >= 0, 'Invalid total quantity');
  }
  const loanIds = new Set();
  const dateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  for (const loan of data.loans) {
    assert(typeof loan.id === 'string' && loan.id.trim() && !loanIds.has(loan.id), 'Invalid loan ID');
    loanIds.add(loan.id);
    assert(typeof loan.student_id === 'string' && loan.student_id.trim(), 'Student ID is required');
    assert(['active', 'returned'].includes(loan.status), 'Invalid loan status');
    assert(dateOnly(loan.start_date) && dateOnly(loan.due_date), 'Invalid seed loan dates');
    const days = (Date.parse(loan.due_date) - Date.parse(loan.start_date)) / 86400000;
    assert(days >= 1 && days <= 7, 'Seed loan duration must be 1-7 days');
    assert(Array.isArray(loan.items) && loan.items.length > 0, 'Seed loan items are required');
    let units = 0;
    for (const item of loan.items) {
      assert(equipmentIds.has(item.equipment_id), 'Unknown seed equipment');
      assert(Number.isInteger(item.quantity) && item.quantity > 0, 'Invalid seed loan quantity');
      units += item.quantity;
    }
    assert(units <= 2, 'Seed loan exceeds two units');
    for (const key of ['approved_at', 'created_at']) {
      assert(typeof loan[key] === 'string' && Number.isFinite(Date.parse(loan[key])), `Invalid ${key}`);
    }
  }
  console.log('Harness check passed: project documents, configuration, and seed data are valid.');
  console.log('Application, business-rule enforcement, MCP, and model integration are not tested by this check.');
} catch (error) {
  console.error(`Harness check failed: ${error.message}`);
  process.exitCode = 1;
}
