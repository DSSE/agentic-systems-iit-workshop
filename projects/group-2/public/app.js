// SprintBoard UI. Task text is untrusted: render it with textContent only.
const $ = (id) => document.getElementById(id);
let state = { tasks: [], members: [] };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const memberName = (id) => state.members.find((m) => m.id === id)?.name ?? id;
const taskTitle = (id) => state.tasks.find((t) => t.id === id)?.title ?? id;

function describeError({ code, details = {} }) {
  switch (code) {
    case 'MAX_POINTS_EXCEEDED':
      return `${memberName(details.memberId)} would have ${details.total} points (has ${details.current}, adding ${details.adding}); the limit is ${details.limit}. Spread the tasks across the team.`;
    case 'TASK_ALREADY_ASSIGNED':
      return `${taskTitle(details.taskId)} is already assigned to ${memberName(details.assignee)}.`;
    case 'PROPOSAL_NOT_FOUND':
      return 'That proposal is gone. Propose again.';
    case 'INVALID_INPUT':
      return 'Pick a member for at least one task.';
    default:
      return JSON.stringify(details);
  }
}

function showMessage(kind, title, text = '') {
  const box = $('message');
  box.hidden = false;
  box.className = `message ${kind}`;
  box.replaceChildren(el('strong', { textContent: title }), text ? ' ' + text : '');
}

function renderMembers() {
  $('members').replaceChildren(
    ...state.members.map((m) => {
      const pct = Math.min(100, (m.points / m.limit) * 100);
      return el(
        'div',
        { className: 'member' + (m.remaining === 0 ? ' full' : '') },
        el('div', { className: 'member-head' }, el('span', { textContent: m.name }), el('span', { className: 'pts', textContent: `${m.points} / ${m.limit}` })),
        el('div', { className: 'bar' }, el('div', { className: 'fill', style: `width:${pct}%` })),
      );
    }),
  );
}

function renderTasks() {
  $('tasks').replaceChildren(
    ...state.tasks.map((t) => {
      let cell;
      if (t.assignee) {
        cell = el('span', { className: 'assigned', textContent: memberName(t.assignee) });
      } else {
        cell = el('select', { name: t.id, ariaLabel: `Assign ${t.title}` }, el('option', { value: '', textContent: '—' }));
        for (const m of state.members) cell.append(el('option', { value: m.id, textContent: `${m.name} (${m.remaining} left)` }));
      }
      // Flagged by the guardrail: the text reads like an instruction. Show it, but as suspect data.
      const flagged = t.flags?.includes('instruction');
      const warning = flagged
        ? el('div', { className: 'flag', textContent: '⚠ Reads like an instruction. Treated as data; hidden from AI agents.' })
        : '';
      return el(
        'tr',
        { className: flagged ? 'flagged' : '' },
        el('td', {}, el('div', { className: 'title', textContent: `${t.id} · ${t.title}` }), el('div', { className: 'desc', textContent: t.description ?? '' }), warning),
        el('td', { className: 'num', textContent: String(t.points) }),
        el('td', {}, cell),
      );
    }),
  );
}

function renderProposals(proposals) {
  if (!proposals.length) return $('proposals').replaceChildren(el('p', { className: 'empty', textContent: 'No pending proposals.' }));
  $('proposals').replaceChildren(
    ...proposals.map((p) => {
      const list = el('ul', {}, ...p.assignments.map((a) => el('li', { textContent: `${taskTitle(a.taskId)} → ${memberName(a.memberId)}` })));
      const after = p.loads.filter((l) => p.assignments.some((a) => a.memberId === l.id)).map((l) => `${l.name} ${l.points}/${l.limit}`).join(' · ');
      const approve = el('button', { textContent: 'Approve', onclick: () => decide(p.id, 'approve') });
      const reject = el('button', { className: 'secondary', textContent: 'Reject', onclick: () => decide(p.id, 'reject') });
      return el('div', { className: 'proposal' }, list, el('p', { className: 'after', textContent: `After approve: ${after}` }), el('div', { className: 'actions' }, approve, reject));
    }),
  );
}

async function refresh() {
  const [board, pending] = await Promise.all([api('GET', '/api/tasks'), api('GET', '/api/proposals')]);
  state = board;
  renderMembers();
  renderTasks();
  renderProposals(pending.proposals);
}

function selectedAssignments() {
  return [...$('assign-form').querySelectorAll('select')].filter((s) => s.value).map((s) => ({ taskId: s.name, memberId: s.value }));
}

$('check-btn').addEventListener('click', async () => {
  const result = await api('POST', '/api/check', { assignments: selectedAssignments() });
  if (result.ok) showMessage('ok', 'Fits.', 'Nothing saved; click Propose to create a proposal.');
  else showMessage('error', result.code, describeError(result));
});

$('assign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await api('POST', '/api/proposals', { assignments: selectedAssignments() });
  if (result.ok) showMessage('ok', 'Proposal created.', 'Review it below and click Approve to save.');
  else showMessage('error', result.code, describeError(result));
  await refresh();
});

async function decide(id, action) {
  const result = await api('POST', `/api/proposals/${id}/${action}`);
  if (result.ok) showMessage('ok', action === 'approve' ? 'Saved.' : 'Rejected.', action === 'approve' ? '' : 'Nothing was saved.');
  else showMessage('error', result.code, describeError(result));
  await refresh();
}

// Chat: history is user/assistant text only; the agent can propose, never approve.
const chatHistory = [];

function addBubble(role, text) {
  const log = $('chat-log');
  log.querySelector('.empty')?.remove();
  log.append(el('div', { className: `bubble ${role}`, textContent: text }));
  log.scrollTop = log.scrollHeight;
}

$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addBubble('user', text);
  chatHistory.push({ role: 'user', content: text });
  $('chat-send').disabled = true;
  addBubble('thinking', 'Thinking…');
  try {
    const result = await api('POST', '/api/chat', { messages: chatHistory.slice(-20) });
    $('chat-log').querySelector('.thinking')?.remove();
    if (result.ok) {
      addBubble('assistant', result.reply);
      chatHistory.push({ role: 'assistant', content: result.reply });
      if (result.proposals.length) showMessage('ok', 'Agent created a proposal.', 'Review it under Pending proposals and click Approve to save.');
    } else {
      addBubble('error', `${result.code}: ${result.details?.message ?? result.details?.reason ?? ''}`);
    }
  } catch (err) {
    $('chat-log').querySelector('.thinking')?.remove();
    addBubble('error', err.message);
  } finally {
    $('chat-send').disabled = false;
    await refresh();
  }
});

refresh();
