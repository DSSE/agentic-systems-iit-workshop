// list_tasks, check_capacity, assign_task and approve.
// Every tool that can lead to a save calls checkAssignments itself.
import { randomUUID } from 'node:crypto';
import { checkAssignments, memberLoads } from './domain/rules.js';
import { flagTasks } from './guardrails.js';
import { createStore } from './store.js';
import { createProposalStore, defaultProposalsFile } from './proposals.js';

export function createTools(store = createStore(), proposals = createProposalStore(defaultProposalsFile(store.path))) {
  // Task text is untrusted: tasks that read like instructions come back flagged.
  function listTasks({ status = 'all' } = {}) {
    const data = store.load();
    const tasks = data.tasks.filter((t) =>
      status === 'unassigned' ? !t.assignee : status === 'assigned' ? Boolean(t.assignee) : true,
    );
    return { tasks: flagTasks(tasks), members: memberLoads(data) };
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
    proposals.add(proposal);
    return { ok: true, proposal };
  }

  const listProposals = () => proposals.list();

  function reject({ proposalId } = {}) {
    if (!proposals.remove(proposalId)) return { ok: false, code: 'PROPOSAL_NOT_FOUND', details: { proposalId } };
    return { ok: true };
  }

  // The only path that writes the data file. Human-only: not exposed to MCP or the agent.
  function approve({ proposalId } = {}) {
    const proposal = proposals.get(proposalId);
    if (!proposal) return { ok: false, code: 'PROPOSAL_NOT_FOUND', details: { proposalId } };
    proposals.remove(proposalId);

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
