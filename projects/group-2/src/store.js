// The only module that reads or writes the data file.
// data.json is live, git-ignored state; data.seed.json is the committed starting board.
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFile = fileURLToPath(new URL('../data.json', import.meta.url));
export const seedFile = fileURLToPath(new URL('../data.seed.json', import.meta.url));

export function createStore(file = process.env.DATA_FILE || defaultFile) {
  const path = resolve(file);
  // A fresh clone has no data.json yet: start it from the seed. Other paths must exist.
  if (path === resolve(defaultFile) && !existsSync(path)) copyFileSync(seedFile, path);
  return {
    path,
    load: () => JSON.parse(readFileSync(path, 'utf8')),
    save(data) {
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
      renameSync(tmp, path);
    },
  };
}

// npm run reset: a person restores the seed board and drops pending proposals (e.g. before a demo).
export function resetData(file = process.env.DATA_FILE || defaultFile, proposalsFile) {
  copyFileSync(seedFile, resolve(file));
  if (proposalsFile) rmSync(proposalsFile, { force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'reset') {
  const { defaultProposalsFile } = await import('./proposals.js');
  const file = resolve(process.env.DATA_FILE || defaultFile);
  resetData(file, defaultProposalsFile(file));
  console.log(`Reset ${file} from data.seed.json; pending proposals cleared.`);
}
