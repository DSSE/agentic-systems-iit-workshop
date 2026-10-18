// list_tasks, check_capacity, assign_task and approve.
// Every tool that can lead to a save calls checkAssignments itself.
import { randomUUID } from 'node:crypto';
import { checkAssignments, memberLoads } from './domain/rules.js';
import { createStore } from './store.js';

export function createTools(store = createStore()) {
  const proposals = new Map();

  function listTasks({ status = 'all' } = {}) {
    const data = store.load();
    const tasks = data.tasks.filter((t) =>
      status === 'unassigned' ? !t.assignee : status === 'assigned' ? Boolean(t.assignee) : true,
    );
    return { tasks, members: memberLoads(data) };
  }

  function checkCapacity({ assignments } = {}) {
    return checkAssignments(store.load(), assignments);
  }

  // Creates a pending proposal. Never writes the data file.
  function assignTask({ assignments } = {}) {
    const result = checkAssignments(store.load(), assignments);
    if (!result.ok) return result;
    const proposal = {
      id: randomUUID(),
      assignments: assignments.map(({ taskId, memberId }) => ({ taskId, memberId })),
      loads: result.loads,
      createdAt: new Date().toISOString(),
    };
    proposals.set(proposal.id, proposal);
    return { ok: true, proposal };
  }

  const listProposals = () => [...proposals.values()];

  function reject({ proposalId } = {}) {
    if (!proposals.delete(proposalId)) return { ok: false, code: 'PROPOSAL_NOT_FOUND', details: { proposalId } };
    return { ok: true };
  }

  // The only path that writes the data file. Human-only: not exposed to MCP or the agent.
  function approve({ proposalId } = {}) {
    const proposal = proposals.get(proposalId);
    if (!proposal) return { ok: false, code: 'PROPOSAL_NOT_FOUND', details: { proposalId } };
    proposals.delete(proposalId);

    const data = store.load();
    const result = checkAssignments(data, proposal.assignments);
    if (!result.ok) return result;

    const byTask = new Map(proposal.assignments.map((a) => [a.taskId, a.memberId]));
    for (const t of data.tasks) if (byTask.has(t.id)) t.assignee = byTask.get(t.id);
    store.save(data);
    return { ok: true, saved: proposal.assignments, loads: memberLoads(data) };
  }

  return { listTasks, checkCapacity, assignTask, listProposals, reject, approve };
}
