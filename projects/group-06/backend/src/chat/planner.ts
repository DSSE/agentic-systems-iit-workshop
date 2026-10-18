import { listTasks } from "../tools/listTasks";
import { checkCapacity } from "../tools/checkCapacity";
import type { createProposalService, PendingProposal } from "../approval/proposals";

export type ProposalService = ReturnType<typeof createProposalService>;
export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface ChatReply {
  message: string;
  mode: "local" | "llm";
  proposals: PendingProposal[];
  refusals: { taskTitle: string; memberName: string; reason: string; code: string }[];
}

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const mentions = (text: string, name: string) => (` ${text} `).includes(` ${normalize(name)} `);

// This fallback is intentionally a small command planner, not a simulated LLM.
// It matches user requests against task titles/IDs only. Descriptions are never instructions.
export function planLocally(message: string, history: ChatMessage[], proposals: ProposalService): ChatReply {
  const board = listTasks();
  const reply: ChatReply = { message: "", mode: "local", proposals: [], refusals: [] };
  let text = normalize(message);
  let requestedMembers = board.members.filter((m) => mentions(text, m.name) || mentions(text, m.id));
  let requestedTasks = board.tasks.filter((t) => mentions(text, t.title) || mentions(text, t.id));

  // A short answer to a clarification may supply just the missing member.
  if (!requestedTasks.length && requestedMembers.length === 1 && text.split(" ").length <= 5) {
    const previous = history.filter((entry) => entry.role === "user").at(-1);
    if (previous && /\b(assign|give|plan|remaining)\b/i.test(previous.content)) {
      text = normalize(`${previous.content} ${message}`);
      requestedTasks = board.tasks.filter((t) => mentions(text, t.title) || mentions(text, t.id));
    }
  }
  const backlog = board.tasks.filter((task) => task.assignee === null);
  const balanced = /\b(balanc\w*|spread|distribute)\b/.test(text);
  const assigning = /\b(assign|allocate|give|plan|spread|distribute)\b/.test(text) || (requestedTasks.length > 0 && requestedMembers.length > 0);

  if (/\b(approve|confirm|save|commit)\b/.test(text) && !assigning) {
    reply.message = "To save an assignment, review its proposal and click Approve. A chat message cannot approve or save tasks.";
  } else if (/\b(capacity|available|availability|workload|room)\b/.test(text) && !assigning) {
    reply.message = board.members.map((member) => {
      const capacity = checkCapacity(member.id, 0);
      return `${member.name}: ${capacity.current}/${capacity.max} points assigned, ${capacity.max - capacity.current} available.`;
    }).join("\n");
  } else if (!assigning && /\b(tasks?|backlog|board|sprint)\b/.test(text)) {
    reply.message = backlog.length
      ? `There are ${backlog.length} unassigned tasks:\n${backlog.map((t) => `${t.title} · ${t.points} points`).join("\n")}\n\nTell me which tasks to assign, or ask me to plan a balanced sprint.`
      : "All tasks are assigned. You can review them in the Sprint board tab.";
  } else if (assigning) {
    const all = /\b(all|remaining|everything|entire)\b/.test(text) || balanced;
    if (!requestedTasks.length && all) requestedTasks = backlog;
    if (!requestedTasks.length) {
      reply.message = `Which tasks would you like to assign? Choose from ${backlog.map((t) => t.title).join(", ") || "the sprint board"}, and tell me the member or ask for a balanced plan.`;
    } else if (requestedMembers.length > 1 && !balanced) {
      reply.message = "Which tasks should go to each member? Send one task/member group at a time, or ask me to spread the tasks across the team.";
    } else if (!requestedMembers.length && !balanced && (/\b(remaining|all|everything)\b/.test(text) || /\bto\b/.test(text))) {
      reply.message = `Who should receive ${requestedTasks.map((t) => t.title).join(", ")}? Choose ${board.members.map((m) => m.name).join(", ")}, or say “spread them across the team”.`;
    } else {
      const pending = proposals.list();
      const reserved = new Map<string, number>();
      const pendingTasks = new Set<string>();
      for (const proposal of pending) {
        if (pendingTasks.has(proposal.taskId)) continue;
        pendingTasks.add(proposal.taskId);
        reserved.set(proposal.memberId, (reserved.get(proposal.memberId) ?? 0) + proposal.points);
      }
      for (const task of requestedTasks) {
        const existing = pending.find((p) => p.taskId === task.id);
        if (existing) {
          if (!requestedMembers.length || requestedMembers.some((member) => member.id === existing.memberId)) {
            reply.proposals.push(existing);
          } else {
            reply.refusals.push({ taskTitle: task.title, memberName: existing.memberName, code: "task_pending",
              reason: `${task.title} already has a proposal for ${existing.memberName}. Review or dismiss it before requesting another assignee.` });
          }
          continue;
        }
        const candidates = [...(requestedMembers.length ? requestedMembers : board.members)]
          .sort((a, b) => (a.points + (reserved.get(a.id) ?? 0)) - (b.points + (reserved.get(b.id) ?? 0)));
        const member = candidates.find((candidate) => checkCapacity(candidate.id, (reserved.get(candidate.id) ?? 0) + task.points).ok);
        if (!member) {
          const name = candidates[0]?.name ?? "the team";
          reply.refusals.push({ taskTitle: task.title, memberName: name, code: "rule:max-8-points",
            reason: `rule:max-8-points — ${task.title} does not fit ${requestedMembers.length ? name + "'s" : "the team's"} remaining capacity, including pending proposals.` });
          continue;
        }
        const result = proposals.create(task.id, member.id);
        if ("status" in result) {
          reply.proposals.push(result);
          reserved.set(member.id, (reserved.get(member.id) ?? 0) + task.points);
        } else {
          reply.refusals.push({ taskTitle: task.title, memberName: member.name, reason: result.reason, code: result.code });
        }
      }
      reply.message = reply.proposals.length
        ? `I've prepared ${reply.proposals.length} assignment proposal${reply.proposals.length === 1 ? "" : "s"} for your review. Nothing has been saved. Review the details below, then click Approve for each assignment.`
        : "I couldn't prepare an assignment for this request.";
      if (reply.refusals.length) reply.message += `\n\n${reply.refusals.length} task${reply.refusals.length === 1 ? " was" : "s were"} refused. Each refusal is listed below. Try spreading the remaining tasks across other members.`;
    }
  } else {
    reply.message = "I can help plan your sprint, check team capacity, and propose task assignments. Try “Assign Login and Payment for this sprint”, “Who has capacity?”, or “Plan a balanced sprint”. Every assignment needs your approval.";
  }
  return reply;
}
