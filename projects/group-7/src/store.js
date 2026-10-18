import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.json');

// Resolved on every call so tests can point CLUBOPS_DATA at a temp copy.
function dataFile() {
  return process.env.CLUBOPS_DATA || defaultFile;
}

export function readData() {
  return JSON.parse(readFileSync(dataFile(), 'utf8'));
}

// Only add_expense may call this.
export function writeData(data) {
  writeFileSync(dataFile(), `${JSON.stringify(data, null, 2)}\n`);
}

// Pending proposals live in memory; they are not spending until approved.
const proposals = new Map();
let nextProposal = 1;

export function newProposalId() {
  return `p${nextProposal++}`;
}

export function saveProposal(proposal) {
  proposals.set(proposal.id, proposal);
  return proposal;
}

export function getProposal(id) {
  return proposals.get(id);
}

export function allProposals() {
  return [...proposals.values()];
}

export function pendingProposals() {
  return allProposals().filter((p) => p.status === 'pending');
}

export function resetProposals() {
  proposals.clear();
  nextProposal = 1;
}
