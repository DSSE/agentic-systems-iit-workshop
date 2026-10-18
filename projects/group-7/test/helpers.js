import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetProposals } from '../src/store.js';

// Pinned copy of the seed data, so tests don't depend on what was approved in the live data.json.
const seedData = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'data.json');

function tempFile() {
  return join(mkdtempSync(join(tmpdir(), 'clubops-')), 'data.json');
}

// Points the store at a temp copy of the seed data.
export function useSeedData() {
  const file = tempFile();
  copyFileSync(seedData, file);
  process.env.CLUBOPS_DATA = file;
  resetProposals();
  return file;
}

// Points the store at a small fixture: one vendor selling 1 BDT items, given cap.
export function useFixture({ cap, expenses = [] }) {
  const file = tempFile();
  writeFileSync(
    file,
    JSON.stringify({
      event: 'Test event',
      currency: 'BDT',
      cap,
      vendors: [{ id: 'x', name: 'Test Vendor', category: 'test', item: 'Thing', unit: 'each', unitPrice: 1, terms: '' }],
      expenses,
    }),
  );
  process.env.CLUBOPS_DATA = file;
  resetProposals();
  return file;
}

export const read = (file) => readFileSync(file, 'utf8');
