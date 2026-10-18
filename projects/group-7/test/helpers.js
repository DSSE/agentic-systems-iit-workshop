// Test helpers. Every test file works on its own temp copy of data.seed.json,
// so tests never touch the real data.json.

import { mkdtempSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEED = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data.seed.json");

export function useTempData() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "clubops-test-")), "data.json");
  copyFileSync(SEED, file);
  process.env.CLUBOPS_DATA_FILE = file;
  return {
    file,
    read: () => JSON.parse(readFileSync(file, "utf8")),
    reset: () => copyFileSync(SEED, file),
  };
}

export const seed = () => JSON.parse(readFileSync(SEED, "utf8"));

// Seed numbers: cap 25,000; spent 1,200 + 3,300 = 4,500; remaining 20,500.
export const CAP = 25000;
export const REMAINING = 20500;
