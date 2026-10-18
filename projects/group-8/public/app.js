import { renderAssistantContent } from './chat-format.js';

const $ = (id) => document.getElementById(id);
const state = { csrf: '', equipment: [], proposal: null, busy: false, studentId: '', filter: 'all', availabilityReady: false, editing: null };
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
  $('request-form')?.setAttribute('aria-busy', String(value));
  if (!value) syncEquipmentControls();
}
const run = async (operation) => {
  if (state.busy) return;
  busy(true);
  try { await operation(); } catch (error) { showError(error); }
  finally { busy(false); }
};

function equipmentCategory(item) {
  const name = `${item.id} ${item.name}`.toLowerCase();
  if (/sensor|thermometer|detector/.test(name)) return 'sensors';
  if (/kit|arduino|raspberry|breadboard/.test(name)) return 'kits';
  if (/tool|multimeter|solder|pliers|screwdriver|oscilloscope|wrench/.test(name)) return 'tools';
  return 'other';
}

function equipmentIcon(item) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  const category = equipmentCategory(item);
  const paths = /temperature|thermometer/i.test(`${item.id} ${item.name}`)
    ? ['M20 28V12a4 4 0 0 1 8 0v16a9 9 0 1 1-8 0Z', 'M24 18v16', 'M24 34h.01', 'M33 14h5m-5 7h3']
    : category === 'sensors' ? ['M8 14h32v22H8z', 'M18 25a5 5 0 1 0-10 0 5 5 0 0 0 10 0', 'M40 25a5 5 0 1 0-10 0 5 5 0 0 0 10 0', 'M18 36v5m6-5v5m6-5v5', 'M18 8q6-6 12 0']
    : category === 'kits' ? ['M10 10h28v28H10z', 'M18 18h12v12H18z', 'M16 5v5m8-5v5m8-5v5M16 38v5m8-5v5m8-5v5M5 16h5m-5 8h5m-5 8h5m28-16h5m-5 8h5m-5 8h5', 'M14 34h.01M34 14h.01']
    : category === 'tools' ? ['M29 8a10 10 0 0 0-12 12L6 31a6 6 0 0 0 8 8l11-11A10 10 0 0 0 39 16l-8 7-6-6 7-8Z']
    : ['M10 14l14-7 14 7v21l-14 7-14-7Z', 'M10 14l14 7 14-7M24 21v21'];
  for (const d of paths) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}

function filterEquipment() {
  let count = 0;
  for (const card of document.querySelectorAll('.equipment-card')) {
    card.hidden = state.filter !== 'all' && card.dataset.category !== state.filter;
    if (!card.hidden) count++;
  }
  if ($('equipment-count')) $('equipment-count').textContent = `${count} of ${state.equipment.length} types`;
  if ($('equipment-empty')) $('equipment-empty').hidden = count !== 0;
  for (const button of document.querySelectorAll('[data-category-filter]')) button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === state.filter));
}

function syncEquipmentControls() {
  for (const button of document.querySelectorAll('[data-add-equipment]')) {
    const item = state.equipment.find((entry) => entry.id === button.dataset.addEquipment);
    const selectedQuantity = Number(button.closest('.equipment-card').querySelector('input').value);
    button.disabled = state.busy || !state.availabilityReady || (!item?.available_quantity && !selectedQuantity);
    button.textContent = selectedQuantity ? 'Edit' : item?.available_quantity ? 'Add +' : 'Unavailable';
  }
  if ($('equipment-dialog')?.open) syncQuantityModal();
}

function renderEquipment() {
  $('equipment-count').textContent = `${state.equipment.length} types`;
  $('equipment').replaceChildren();
  state.equipment.forEach((item, index) => {
    const card = text('article', '', 'equipment-card');
    card.dataset.category = equipmentCategory(item);
    const mark = text('span', '', `equipment-mark mark-${equipmentCategory(item)}`);
    mark.append(equipmentIcon(item));
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
    input.max = String(item.available_quantity); input.readOnly = true;
    input.dataset.equipmentId = item.id;
    input.setAttribute('form', 'request-form');
    input.setAttribute('aria-label', `${item.name} quantity`);
    label.htmlFor = input.id;
    input.addEventListener('input', updateCount);
    const add = text('button', 'Add +', 'secondary add-equipment');
    add.type = 'button'; add.dataset.addEquipment = item.id;
    add.setAttribute('aria-label', `Choose quantity for ${item.name}`);
    add.addEventListener('click', () => run(async () => {
      await loadEquipment();
      if (!state.availabilityReady) return;
      const current = state.equipment.find((entry) => entry.id === item.id);
      if (!current || (!current.available_quantity && input.value === '0')) return;
      state.editing = item.id;
      $('equipment-modal-heading').textContent = current.name;
      $('equipment-modal-description').textContent = current.description;
      $('equipment-modal-icon').replaceChildren(equipmentIcon(current));
      $('equipment-quantity').value = input.value === '0' ? '1' : input.value;
      $('equipment-dialog').showModal();
      syncQuantityModal();
    }));
    quantity.append(label, input, add);
    card.append(mark, info, quantity);
    $('equipment').append(card);
  });
  filterEquipment();
  syncEquipmentControls();
}

async function loadEquipment() {
  if (!$('equipment')) return;
  const revision = ++shelfRevision;
  state.availabilityReady = false;
  syncEquipmentControls();
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
    state.availabilityReady = true;
    if (!$('equipment').children.length) renderEquipment();
    else for (const label of labels) {
      const item = result.equipment.find((entry) => entry.id === label.dataset.stockId);
      label.textContent = item ? `${item.available_quantity} available · ${item.total_quantity} total` : 'Equipment unavailable';
    }
    for (const input of document.querySelectorAll('[data-equipment-id]')) {
      input.max = String(result.equipment.find((item) => item.id === input.dataset.equipmentId)?.available_quantity ?? 0);
    }
    syncEquipmentControls();
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
  if ($('selected-count')) $('selected-count').textContent = `${count} ${count === 1 ? 'unit' : 'units'}`;
  for (const button of document.querySelectorAll('[data-add-equipment]')) {
    const input = [...document.querySelectorAll('[data-equipment-id]')].find((entry) => entry.dataset.equipmentId === button.dataset.addEquipment);
    button.textContent = Number(input?.value) > 0 ? 'Edit' : 'Add +';
    button.closest('.equipment-card').classList.toggle('is-selected', Number(input?.value) > 0);
  }
}

function syncQuantityModal() {
  const item = state.equipment.find((entry) => entry.id === state.editing);
  if (!item) return;
  const input = $('equipment-quantity');
  input.max = String(item.available_quantity);
  const quantity = Number(input.value);
  const existing = selected().find((entry) => entry.equipment_id === state.editing)?.quantity ?? 0;
  $('remove-equipment').hidden = !existing;
  $('save-equipment').textContent = existing ? 'Update request' : 'Add to request +';
  const valid = state.availabilityReady && Number.isInteger(quantity) && quantity >= 1 && quantity <= item.available_quantity;
  $('equipment-modal-stock').textContent = state.availabilityReady
    ? `${item.available_quantity} available for ${$('start-date').value} → ${$('due-date').value}` : 'Choose valid dates to check availability.';
  $('equipment-quantity-error').textContent = valid ? '' : item.available_quantity ? `Enter a whole number from 1 to ${item.available_quantity}.` : 'No units available. Remove this selection or choose different dates.';
  $('save-equipment').disabled = state.busy || !valid;
  $('decrease-quantity').disabled = state.busy || quantity <= 1;
  $('increase-quantity').disabled = state.busy || quantity >= item.available_quantity;
}

for (const button of document.querySelectorAll('[data-category-filter]')) button.addEventListener('click', () => {
  state.filter = button.dataset.categoryFilter; filterEquipment();
});
$('equipment-quantity')?.addEventListener('input', syncQuantityModal);
for (const [id, delta] of [['decrease-quantity', -1], ['increase-quantity', 1]]) $(id)?.addEventListener('click', () => {
  $('equipment-quantity').value = String(Number($('equipment-quantity').value) + delta); syncQuantityModal();
});
for (const id of ['close-equipment', 'cancel-equipment']) $(id)?.addEventListener('click', () => $('equipment-dialog').close());
$('equipment-quantity-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    await loadEquipment();
    const item = state.equipment.find((entry) => entry.id === state.editing);
    const quantity = Number($('equipment-quantity').value);
    if (!state.availabilityReady || !Number.isInteger(quantity) || quantity < 1 || quantity > item.available_quantity) return;
    const input = [...document.querySelectorAll('[data-equipment-id]')].find((entry) => entry.dataset.equipmentId === state.editing);
    input.value = String(quantity); updateCount(); $('equipment-dialog').close();
  });
});
$('remove-equipment')?.addEventListener('click', () => {
  const input = [...document.querySelectorAll('[data-equipment-id]')].find((entry) => entry.dataset.equipmentId === state.editing);
  if (input) input.value = '0'; updateCount(); $('equipment-dialog').close();
});
async function identify() {
  const result = await api('/api/session', { student_id: $('student-id').value.trim() });
  if (state.studentId !== result.student_id) {
    $('chat-log')?.replaceChildren(text('p', `Using student ID ${result.student_id}. Which equipment, how many units, and which dates?`, 'chat-assistant'));
    state.studentId = result.student_id;
  }
  return result;
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

function chatMessage(role, content) {
  const bubble = text(role === 'assistant' ? 'div' : 'p', '', `chat-message chat-${role}`);
  if (role === 'assistant') renderAssistantContent(bubble, content);
  else bubble.textContent = content;
  $('chat-log').append(bubble);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
}
function chatLoading(loading) {
  $('chat-loading').hidden = !loading;
  $('chat-form').setAttribute('aria-busy', String(loading));
  $('chat-input').disabled = loading;
  $('chat-send').textContent = loading ? 'Waiting for reply…' : 'Send message ↗';
}
function applyProposal(result) {
  if ($('start-date')) $('start-date').value = result.proposal.start_date;
  if ($('due-date')) $('due-date').value = result.proposal.due_date;
  for (const input of document.querySelectorAll('[data-equipment-id]')) {
    input.value = result.proposal.items.find((item) => item.equipment_id === input.dataset.equipmentId)?.quantity ?? 0;
  }
  updateCount();
  renderProposal(result);
}
$('chat-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    const content = $('chat-input').value.trim();
    if (!content) return;
    chatLoading(true);
    try {
      await identify();
      chatMessage('user', content);
      $('chat-input').value = '';
      let result;
      try { result = await api('/api/chat', { message: content }); }
      catch (error) {
        chatMessage('assistant', error.violations?.map((entry) => `${entry.code}: ${entry.message}`).join('\n')
          || 'Unable to reach the assistant. Please check the server and try again.');
        return;
      }
      chatMessage('assistant', result.message);
      if (result.trace.length) {
        const activity = text('details', '', 'chat-trace');
        activity.append(text('summary', 'Tool activity'), text('span', result.trace.map((entry) =>
          `${entry.name}: ${entry.ok ? 'OK' : entry.codes.join(', ')}`).join(' → ')));
        $('chat-log').append(activity);
      }
      if (result.proposal) applyProposal(result.proposal);
      await Promise.all([loadLoans(), loadEquipment()]);
    } finally { chatLoading(false); }
  });
});
for (const [id, content] of [['chat-example-normal', 'I need two Arduino kits for my project next week.'], ['chat-example-unclear', 'I need some sensors.']]) {
  $(id)?.addEventListener('click', () => { $('chat-input').value = content; $('chat-form').requestSubmit(); });
}
$('review-linked-proposal')?.addEventListener('click', () => run(async () => {
  await identify();
  const proposal_id = new URLSearchParams(location.search).get('proposal');
  const result = await api('/api/review', { proposal_id });
  applyProposal(result);
  await loadEquipment();
}));

async function cancel() {
  const proposal = state.proposal;
  state.proposal = null;
  $('proposal-dialog').close();
  if (proposal) await api('/api/cancel', { proposal_id: proposal.proposal_id });
  message('Proposal canceled. Nothing was saved.');
}
$('request-form')?.addEventListener('submit', (event) => {
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
for (const id of ['start-date', 'due-date']) $(id)?.addEventListener('change', () => { loadEquipment().catch(showError); });
for (const link of document.querySelectorAll('[data-chat-link]')) link.addEventListener('click', () => {
  const student = $('student-id').value.trim();
  link.href = student ? `/chat?${new URLSearchParams({ student })}` : '/chat';
});
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
  state.studentId = session.student_id;
  $('student-id').value = session.student_id;
  if ($('agent-mode')) $('agent-mode').textContent = session.agent_mode === 'model' ? 'Model configured' : 'Demo mode · no LLM';
  if ($('chat-mode-note')) $('chat-mode-note').textContent = session.agent_mode === 'model'
    ? 'The model uses the shared MCP tools. Review every proposal; only Approve loan saves it.'
    : 'Demo mode uses a limited local parser through MCP. Configure LLM_BASE_URL and LLM_MODEL in .env for an AI model. Only Approve loan saves a loan.';
  const linked = new URLSearchParams(location.search);
  if ($('chat-form') && linked.get('student')) $('student-id').value = linked.get('student');
  if (linked.get('proposal') && $('external-review')) {
    $('external-review').hidden = false;
    if (linked.get('student')) $('student-id').value = linked.get('student');
  }
  if ($('start-date')) {
    $('start-date').min = session.today;
    $('start-date').value = session.today;
    const due = new Date(`${session.today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 7);
    $('due-date').value = due.toISOString().slice(0, 10);
    $('date-note').textContent = `Dates use ${session.timezone}. Return date is exclusive: the same weekday next week is 7 days.`;
  }
  await loadEquipment();
  if (session.student_id && session.student_id === $('student-id').value) await loadLoans();
});
