import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/domain/store.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** A fresh store on temp files. `patch(data)` can change the seed (e.g. a tiny cap for boundary tests). */
export function tempStore(patch = (d) => d) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubops-'));
  const dataFile = path.join(dir, 'data.json');
  const stateFile = path.join(dir, 'state.json');
  const data = patch(JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8')));
  fs.writeFileSync(dataFile, JSON.stringify(data));
  return { store: createStore({ dataFile, stateFile }), dataFile, stateFile, env: { DATA_FILE: dataFile, STATE_FILE: stateFile } };
}

/** Seed with a small cap and three flat items priced 1000, 1001 and 1 BDT. */
export const boundarySeed = (d) => ({
  ...d, budget_cap: 1000, expenses: [],
  vendors: [{ id: 'v', name: 'Test vendor', category: 'test', terms: 'ok', items: [
    { id: 'exact', name: 'Exactly the cap', unit: 'flat', unit_price: 1000 },
    { id: 'over', name: 'One over the cap', unit: 'flat', unit_price: 1001 },
    { id: 'one', name: 'One taka', unit: 'flat', unit_price: 1 },
  ] }],
});
