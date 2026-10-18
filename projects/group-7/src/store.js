import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.json');

// Resolved on every call so tests can point CLUBOPS_DATA at a temp copy.
function dataFile() {
  return process.env.CLUBOPS_DATA || defaultFile;
}

// Pending proposals sit next to data.json, so the web app and the MCP server
// (two processes) see the same ones. They are not spending until approved.
function proposalsFile() {
  return join(dirname(dataFile()), 'proposals.json');
}

export function readData() {
  return JSON.parse(readFileSync(dataFile(), 'utf8'));
}

// Only add_expense may call this.
export function writeData(data) {
  writeFileSync(dataFile(), `${JSON.stringify(data, null, 2)}\n`);
}

function readProposals() {
  return existsSync(proposalsFile()) ? JSON.parse(readFileSync(proposalsFile(), 'utf8')) : [];
}

function writeProposals(list) {
  writeFileSync(proposalsFile(), `${JSON.stringify(list, null, 2)}\n`);
}

export function newProposalId() {
  const numbers = readProposals().map((p) => Number(p.id.slice(1)));
  return `p${Math.max(0, ...numbers) + 1}`;
}

// Inserts or replaces a proposal by id.
export function saveProposal(proposal) {
  const list = readProposals();
  const index = list.findIndex((p) => p.id === proposal.id);
  if (index === -1) list.push(proposal);
  else list[index] = proposal;
  writeProposals(list);
  return proposal;
}

export function getProposal(id) {
  return readProposals().find((p) => p.id === id);
}

export function allProposals() {
  return readProposals();
}

export function pendingProposals() {
  return readProposals().filter((p) => p.status === 'pending');
}

export function resetProposals() {
  writeProposals([]);
}
