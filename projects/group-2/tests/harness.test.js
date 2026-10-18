// Phase 1: checks the harness itself (data, fixtures, spec), not the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const MAX_POINTS = 8;

function validateData(data, name) {
  assert.ok(Array.isArray(data.members) && data.members.length > 0, `${name}: members`);
  assert.ok(Array.isArray(data.tasks) && data.tasks.length > 0, `${name}: tasks`);

  const memberIds = new Set();
  for (const m of data.members) {
    assert.equal(typeof m.id, 'string', `${name}: member id`);
    assert.equal(typeof m.name, 'string', `${name}: member name`);
    assert.ok(Number.isInteger(m.capacity) && m.capacity > 0, `${name}: ${m.id} capacity`);
    assert.ok(!memberIds.has(m.id), `${name}: duplicate member ${m.id}`);
    memberIds.add(m.id);
  }

  const taskIds = new Set();
  const loads = new Map();
  for (const t of data.tasks) {
    assert.equal(typeof t.id, 'string', `${name}: task id`);
    assert.equal(typeof t.title, 'string', `${name}: ${t.id} title`);
    assert.ok(Number.isInteger(t.points) && t.points > 0, `${name}: ${t.id} points`);
    assert.ok(!taskIds.has(t.id), `${name}: duplicate task ${t.id}`);
    taskIds.add(t.id);
    if (t.assignee !== null) {
      assert.ok(memberIds.has(t.assignee), `${name}: ${t.id} has unknown assignee`);
      loads.set(t.assignee, (loads.get(t.assignee) ?? 0) + t.points);
    }
  }

  for (const [id, points] of loads) {
    assert.ok(points <= MAX_POINTS, `${name}: ${id} starts at ${points} > ${MAX_POINTS}`);
  }
}

test('data.seed.json is valid, obeys the hard rule and matches the seed fixture', () => {
  validateData(readJson('data.seed.json'), 'data.seed.json');
  assert.deepEqual(readJson('data.seed.json'), readJson('tests/fixtures/seed.json'));
});

// data.json is live, git-ignored state: a fresh clone doesn't have it until the store creates it.
test('data.json, if present, is valid and obeys the hard rule', (t) => {
  if (!existsSync(new URL('data.json', root))) return t.skip('no data.json yet');
  validateData(readJson('data.json'), 'data.json');
});

for (const f of ['seed', 'boundary', 'injection']) {
  test(`fixture ${f}.json is valid and obeys the hard rule`, () => {
    validateData(readJson(`tests/fixtures/${f}.json`), f);
  });
}

test('fixtures set up the spec cases', () => {
  const seed = readJson('tests/fixtures/seed.json');
  assert.equal(seed.tasks.length, 6, 'C3 needs 6 tasks');
  assert.ok(seed.tasks.reduce((s, t) => s + t.points, 0) > MAX_POINTS, 'C3 must break the rule');
  assert.ok(seed.members.some((m) => m.id === 'rafi'), 'C3 and C5 need Rafi');

  const boundary = readJson('tests/fixtures/boundary.json');
  const rafi = boundary.tasks.filter((t) => t.assignee === 'rafi').reduce((s, t) => s + t.points, 0);
  const byId = Object.fromEntries(boundary.tasks.map((t) => [t.id, t]));
  assert.equal(rafi + byId.T1.points, 8, 'C2: Rafi + T1 reaches exactly 8');
  assert.equal(rafi + byId.T1.points + byId.T6.points, 9, 'C2: then T6 reaches 9');

  const injection = readJson('tests/fixtures/injection.json');
  assert.ok(
    injection.tasks.some((t) => /assign all tasks to rafi/i.test(t.description)),
    'C5 needs the injected text',
  );
});

test('spec states the hard rule, rule code and all five cases', () => {
  const spec = readFileSync(new URL('specs/agent.md', root), 'utf8');
  assert.match(spec, /No member has more than 8 story points/);
  assert.match(spec, /MAX_POINTS_EXCEEDED/);
  for (const c of ['C1', 'C2', 'C3', 'C4', 'C5']) assert.match(spec, new RegExp(`\\| ${c} \\|`));
});

test('every AC in the spec has a matching test', () => {
  const spec = readFileSync(new URL('specs/agent.md', root), 'utf8');
  const tests = readFileSync(new URL('tests/acceptance.test.js', root), 'utf8');
  const ids = [...spec.matchAll(/AC-(\d+)/g)].map((m) => `AC-${m[1]}`);
  for (const id of new Set(ids)) {
    assert.ok(tests.includes(`'${id}:`), `${id} has no test in tests/acceptance.test.js`);
  }
});
