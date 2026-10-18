const $ = (id) => document.getElementById(id);
const state = { csrf: '', equipment: [], proposal: null, busy: false };
let shelfRevision = 0;
const text = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.ok) {
    const error = new Error('Request could not be completed.');
    error.violations = result.violations;
    throw error;
  }
  return result;
}

function message(content, kind = '') {
  const region = $('message');
  region.replaceChildren();
  region.className = `message ${kind}`;
  region.hidden = false;
  if (Array.isArray(content)) {
    region.append(text('strong', 'This request needs a change.'));
    const list = document.createElement('ul');
    for (const entry of content) {
      const row = document.createElement('li');
      row.append(text('code', entry.code), document.createTextNode(` — ${entry.message}`));
      list.append(row);
    }
    region.append(list);
    if (content.some((entry) => ['ITEM_LIMIT_EXCEEDED', 'DURATION_LIMIT_EXCEEDED'].includes(entry.code))) {
      region.append(text('p', 'Try at most 2 units for up to 7 days, subject to existing loans and stock. Update the request and check again.'));
    }
  } else region.append(text('span', content));
}
const showError = (error) => message(error.violations ?? 'Unable to reach LabLend. Check the server and try again.', 'error');
function busy(value) {
  state.busy = value;
  for (const button of document.querySelectorAll('button')) button.disabled = value;
  $('request-form').setAttribute('aria-busy', String(value));
}
const run = async (operation) => {
  if (state.busy) return;
  busy(true);
  try { await operation(); } catch (error) { showError(error); }
  finally { busy(false); }
};

function renderEquipment() {
  $('equipment-count').textContent = `${state.equipment.length} types`;
  $('equipment').replaceChildren();
  state.equipment.forEach((item, index) => {
    const card = text('article', '', 'equipment-card');
    const mark = text('span', ['{ }', '≋', '°C'][index % 3], 'equipment-mark');
    mark.setAttribute('aria-hidden', 'true');
    const info = text('div', '', 'equipment-info');
    const stock = text('span', `${item.available_quantity} available · ${item.total_quantity} total`, 'equipment-stock');
    stock.dataset.stockId = item.id;
    info.append(text('h3', item.name), text('p', item.description), stock);
    const quantity = text('div', '', 'quantity-wrap');
    const label = text('label', 'Quantity');
    const input = document.createElement('input');
    input.id = `quantity-${index}`;
    input.type = 'number'; input.min = '0'; input.step = '1'; input.value = '0';
    input.dataset.equipmentId = item.id;
    input.setAttribute('form', 'request-form');
    input.setAttribute('aria-label', `${item.name} quantity`);
    label.htmlFor = input.id;
    input.addEventListener('input', updateCount);
    quantity.append(label, input);
    card.append(mark, info, quantity);
    $('equipment').append(card);
  });
}

async function loadEquipment() {
  const revision = ++shelfRevision;
  const start_date = $('start-date').value;
  const due_date = $('due-date').value;
  const labels = document.querySelectorAll('[data-stock-id]');
  if (!start_date || !due_date || start_date < $('start-date').min || due_date <= start_date) {
    for (const label of labels) label.textContent = 'Choose valid dates to see availability';
    return;
  }
  for (const label of labels) label.textContent = 'Checking availability…';
  try {
    const result = await api(`/api/equipment?${new URLSearchParams({ start_date, due_date })}`);
    if (revision !== shelfRevision) return;
    state.equipment = result.equipment;
    if (!$('equipment').children.length) renderEquipment();
    else for (const label of labels) {
      const item = result.equipment.find((entry) => entry.id === label.dataset.stockId);
      label.textContent = item ? `${item.available_quantity} available · ${item.total_quantity} total` : 'Equipment unavailable';
    }
  } catch (error) {
    if (revision !== shelfRevision) return;
    for (const label of labels) label.textContent = 'Availability unavailable — try refreshing';
    throw error;
  }
}

function selected() {
  return [...document.querySelectorAll('[data-equipment-id]')].map((input) => ({
    equipment_id: input.dataset.equipmentId, quantity: Number(input.value),
  })).filter((item) => item.quantity !== 0);
}
function updateCount() {
  const count = selected().reduce((sum, item) => sum + item.quantity, 0);
  $('selected-count').textContent = `${count} ${count === 1 ? 'unit' : 'units'}`;
}
async function identify() {
  return api('/api/session', { student_id: $('student-id').value.trim() });
}
async function loadLoans() {
  const result = await api('/api/loans');
  $('loans').replaceChildren();
  $('loan-note').textContent = result.loans.length
    ? `Loans for ${$('student-id').value.trim()}. Active and overdue loans count toward your limit.`
    : `No existing loans for ${$('student-id').value.trim()}.`;
  for (const loan of result.loans) {
    const card = text('article', '', 'loan-card');
    const names = loan.items.map((item) => `${item.quantity} × ${result.equipment.find((entry) => entry.id === item.equipment_id)?.name ?? item.equipment_id}`).join(', ');
    card.append(text('h3', names), text('span', loan.status === 'returned' ? 'Returned' : 'Active · return required', 'loan-status'),
      text('p', `${loan.start_date} → ${loan.due_date}`), text('p', `Loan ID: ${loan.id}`));
    $('loans').append(card);
  }
}

function renderProposal(result) {
  state.proposal = result;
  const proposal = result.proposal;
  const details = $('proposal-details');
  details.replaceChildren();
  for (const [key, value] of [['Student', proposal.student_id], ['Borrow from', proposal.start_date], ['Return by', proposal.due_date], ['Duration', `${proposal.duration_days} days`]]) {
    details.append(text('dt', key), text('dd', value));
  }
  $('proposal-items').replaceChildren(...proposal.items.map((item) => {
    const stock = result.availability.find((entry) => entry.equipment_id === item.equipment_id);
    return text('li', `${item.quantity} × ${item.name} · ${stock.available_quantity} available for these dates`);
  }));
  $('proposal-dialog').showModal();
}

async function cancel() {
  const proposal = state.proposal;
  state.proposal = null;
  $('proposal-dialog').close();
  if (proposal) await api('/api/cancel', { proposal_id: proposal.proposal_id });
  message('Proposal canceled. Nothing was saved.');
}
$('request-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    $('message').hidden = true;
    await identify();
    await loadLoans();
    await loadEquipment();
    const result = await api('/api/tools/check_stock', {
      student_id: $('student-id').value.trim(), items: selected(),
      start_date: $('start-date').value, due_date: $('due-date').value,
    });
    renderProposal(result);
  });
});
$('refresh-loans').addEventListener('click', () => run(async () => { await identify(); await Promise.all([loadLoans(), loadEquipment()]); }));
for (const id of ['start-date', 'due-date']) $(id).addEventListener('change', () => { loadEquipment().catch(showError); });
for (const id of ['cancel-proposal', 'close-proposal']) $(id).addEventListener('click', () => run(cancel));
$('proposal-dialog').addEventListener('cancel', (event) => { event.preventDefault(); run(cancel); });
$('approve-proposal').addEventListener('click', () => run(async () => {
  const proposal = state.proposal;
  if (!proposal) return;
  state.proposal = null;
  try {
    const result = await api('/api/approve', { proposal_id: proposal.proposal_id });
    message(`Loan saved. Return by ${result.loan.due_date}. Loan ID: ${result.loan.id}`, 'success');
  } finally { $('proposal-dialog').close(); }
  await Promise.all([loadLoans(), loadEquipment()]);
}));

await run(async () => {
  const session = await api('/api/session');
  state.csrf = session.csrf_token;
  $('student-id').value = session.student_id;
  $('start-date').min = session.today;
  $('start-date').value = session.today;
  const due = new Date(`${session.today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 7);
  $('due-date').value = due.toISOString().slice(0, 10);
  $('date-note').textContent = `Dates use ${session.timezone}. Return date is exclusive: the same weekday next week is 7 days.`;
  await loadEquipment();
  if (session.student_id) await loadLoans();
});
