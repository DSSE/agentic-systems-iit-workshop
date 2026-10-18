// Reads and writes data.json. Writes are atomic (temp file + rename), and the
// file is re-read on every call, so the API server and the MCP server (two
// processes) always see each other's changes.

import { readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const dataFile = () => process.env.CLUBOPS_DATA_FILE || path.join(ROOT, "data.json");
export const seedFile = () => path.join(ROOT, "data.seed.json");

export function load(file = dataFile()) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.expenses ??= [];
  data.proposals ??= [];
  data.vendors ??= [];
  return data;
}

export function save(data, file = dataFile()) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, file);
}

/** Demo reset: copy the seed back over data.json. */
export function resetToSeed(file = dataFile()) {
  copyFileSync(seedFile(), file);
}
