// Pending proposals, shared between processes (web server, MCP server) through a file.
// This is not data.json: a proposal is never a saved assignment.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function createProposalStore(file) {
  const path = resolve(file);
  const read = () => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return [];
    }
  };
  const write = (list) => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n');
    renameSync(tmp, path);
  };
  return {
    path,
    list: read,
    get: (id) => read().find((p) => p.id === id),
    add: (proposal) => write([...read(), proposal]),
    remove(id) {
      const list = read();
      const next = list.filter((p) => p.id !== id);
      if (next.length === list.length) return false;
      write(next);
      return true;
    },
  };
}

export const defaultProposalsFile = (dataFile) =>
  process.env.PROPOSALS_FILE || join(dirname(dataFile), 'proposals.json');
