// Persistence for data.json plus the in-memory approval-proposal store.
//
// - Reads/writes are serialized through a single mutex so a conflict check
//   and the following write happen atomically: two concurrent creates for
//   an overlapping slot cannot both succeed.
// - Writes go to a temp file then rename, so a crash mid-write cannot leave
//   data.json partially modified.
// - Proposals returned by check_availability live only in memory and expire
//   after PROPOSAL_TTL_MS; they are not persisted and are single-use.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { DATA_FILE, PROPOSAL_TTL_MS } from "../config.js";

// --- data.json access, serialized through one mutex -----------------------

let queue = Promise.resolve();

/** Run fn exclusively with respect to every other call to withLock(). */
export function withLock(fn) {
  const result = queue.then(() => fn());
  // Keep the queue alive even if fn() rejects, so later callers still run.
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function loadData() {
  const raw = await readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  parsed.rooms ||= [];
  parsed.bookings ||= [];
  return parsed;
}

async function saveData(data) {
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpFile, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmpFile, DATA_FILE);
}

/**
 * Read data.json, let mutate() change it in place and return a result, then
 * write it back — all while holding the lock, so nothing else can read a
 * half-updated file or race the write. If mutate() throws, nothing is saved.
 */
export function withData(mutate) {
  return withLock(async () => {
    const data = await loadData();
    const result = await mutate(data);
    await saveData(data);
    return result;
  });
}

// --- in-memory approval proposals ------------------------------------------

const proposals = new Map();

/** Store a proposal's exact fields and return a single-use token for it. */
export function createProposal(fields) {
  const id = randomUUID();
  proposals.set(id, { fields, expiresAt: Date.now() + PROPOSAL_TTL_MS });
  return id;
}

/** Look up a non-expired proposal without consuming it. */
export function peekProposal(id) {
  const entry = proposals.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    proposals.delete(id);
    return null;
  }
  return entry.fields;
}

/** Consume (delete) a proposal, returning its fields if it was still valid. */
export function consumeProposal(id) {
  const fields = peekProposal(id);
  if (fields) proposals.delete(id);
  return fields;
}
