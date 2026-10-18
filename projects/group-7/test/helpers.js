import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetProposals } from '../src/store.js';

const realData = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.json');

function tempFile() {
  return join(mkdtempSync(join(tmpdir(), 'clubops-')), 'data.json');
}

// Points the store at a temp copy of the real data.json.
export function useRealData() {
  const file = tempFile();
  copyFileSync(realData, file);
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
