// The only module that reads or writes the data file.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFile = fileURLToPath(new URL('../data.json', import.meta.url));

export function createStore(file = process.env.DATA_FILE || defaultFile) {
  const path = resolve(file);
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
