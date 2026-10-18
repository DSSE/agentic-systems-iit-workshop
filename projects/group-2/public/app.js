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

// Theme: light/dark toggle, remembered per browser. index.html sets the first value before paint.
const root = document.documentElement;
function applyTheme(theme) {
  root.dataset.theme = theme;
  $('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
}
$('theme-toggle').addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('sprintboard-theme', next); } catch {}
});
applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');

// A stable colour per member, from their id.
const hues = [250, 330, 170, 30, 200, 120, 280, 10];
const hueFor = (id) => hues[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
const avatar = (id, small = false) =>
  el('span', {
    className: small ? 'avatar sm' : 'avatar',
    textContent: memberName(id).slice(0, 2).toUpperCase(),
    style: `background:hsl(${hueFor(id)} 62% 52%)`,
    ariaHidden: 'true',
  });

function renderMembers() {
  $('members').replaceChildren(
    ...state.members.map((m) => {
      const pct = Math.min(100, (m.points / m.limit) * 100);
      const level = m.remaining <= 0 ? ' full' : pct >= 75 ? ' near' : '';
      return el(
        'div',
        { className: 'member' + level },
        avatar(m.id),
        el(
          'div',
          { className: 'member-body' },
          el('div', { className: 'member-head' }, el('span', { textContent: m.name }), el('span', { className: 'pts', textContent: `${m.points} / ${m.limit}` })),
          el('div', { className: 'bar' }, el('div', { className: 'fill', style: `width:${pct}%` })),
          el('div', { className: 'member-foot', textContent: m.remaining <= 0 ? 'At the limit' : `${m.remaining} points free` }),
        ),
      );
    }),
  );
}

function renderStats(proposals) {
  const open = state.tasks.filter((t) => !t.assignee);
  $('stat-unassigned').textContent = String(open.length);
  $('stat-points').textContent = String(open.reduce((s, t) => s + t.points, 0));
  $('stat-capacity').textContent = String(state.members.reduce((s, m) => s + Math.max(0, m.remaining), 0));
  $('stat-pending').textContent = String(proposals.length);
  $('pending-count').textContent = String(proposals.length);
}

function renderTasks() {
  $('tasks').replaceChildren(
    ...state.tasks.map((t) => {
      let cell;
      if (t.assignee) {
        cell = el('span', { className: 'assigned' }, avatar(t.assignee, true), memberName(t.assignee));
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
        el(
          'td',
          {},
          el('div', { className: 'title' }, el('span', { className: 'task-id', textContent: t.id }), t.title),
          el('div', { className: 'desc', textContent: t.description ?? '' }),
          warning,
        ),
        el('td', { className: 'num' }, el('span', { className: 'points', textContent: String(t.points) })),
        el('td', {}, cell),
      );
    }),
  );
}

function renderProposals(proposals) {
  if (!proposals.length) return $('proposals').replaceChildren(el('p', { className: 'empty', textContent: 'No pending proposals.' }));
  $('proposals').replaceChildren(
    ...proposals.map((p) => {
      const list = el(
        'ul',
        {},
        ...p.assignments.map((a) =>
          el('li', {}, avatar(a.memberId, true), el('span', { textContent: taskTitle(a.taskId) }), el('span', { className: 'arrow', textContent: '→' }), memberName(a.memberId)),
        ),
      );
      const after = p.loads.filter((l) => p.assignments.some((a) => a.memberId === l.id)).map((l) => `${l.name} ${l.points}/${l.limit}`).join(' · ');
      const approve = el('button', { className: 'btn approve', textContent: 'Approve', onclick: () => decide(p.id, 'approve') });
      const reject = el('button', { className: 'btn secondary', textContent: 'Reject', onclick: () => decide(p.id, 'reject') });
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
  renderStats(pending.proposals);
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

// Suggestion chips fill the input with a demo request.
$('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $('chat-input').value = chip.textContent;
  $('chat-input').focus();
});

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
