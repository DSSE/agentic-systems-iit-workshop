import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/domain/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A fresh store on temp files. `patch(data)` can change the seed (e.g. a tiny cap for boundary tests). */
export function tempStore(patch = (d) => d) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubops-'));
  const dataFile = path.join(dir, 'data.json');
  const stateFile = path.join(dir, 'state.json');
  const blank = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
  const demo = {
    ...blank,
    event: { name: 'Friday seminar', date: '2026-10-23', expected_attendees: 40, currency: 'BDT' },
    budget_cap: 30000,
    expenses: [{ id: 'e1', vendor_id: 'v-hall', item_id: 'hall-booking', description: 'Seminar hall booking', quantity: 1, amount: 10000, approved_at: '2026-10-10T09:00:00.000Z' }],
    pending: [],
  };
  const data = patch(demo);
  fs.writeFileSync(dataFile, JSON.stringify(data));
  return { store: createStore({ dataFile, stateFile }), dataFile, stateFile, env: { DATA_FILE: dataFile, STATE_FILE: stateFile } };
}

/** Seed with a small cap and three flat items priced 1000, 1001 and 1 BDT. */
export const boundarySeed = (d) => ({
  ...d, event: { name: 'Boundary test event', date: '2026-10-23', expected_attendees: 1, currency: 'BDT' }, budget_cap: 1000, expenses: [],
  vendors: [{ id: 'v', name: 'Test vendor', category: 'test', terms: 'ok', items: [
    { id: 'exact', name: 'Exactly the cap', unit: 'flat', unit_price: 1000 },
    { id: 'over', name: 'One over the cap', unit: 'flat', unit_price: 1001 },
    { id: 'one', name: 'One taka', unit: 'flat', unit_price: 1 },
  ] }],
});
