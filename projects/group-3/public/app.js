const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('en-US');
const history = [];
const icons = { food: 'FD', speaker: 'SP', equipment: 'AV', printing: 'PR', venue: 'VN' };
let initializedProposalForm = false;
let activeEvent = false;

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function setBusy(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  try { return await action(); }
  catch (error) { return { status: 500, data: { message: error.message || 'Could not reach ClubOps. Please try again.' } }; }
  finally { button.disabled = false; }
}

function render(state) {
  activeEvent = Boolean(state.event);
  $('event-dashboard').hidden = !activeEvent;
  $('chat-toggle').hidden = !activeEvent;
  if (!activeEvent) closeChat();
  $('empty-state').hidden = activeEvent;
  $('event-status').hidden = !activeEvent;
  $('reset').hidden = !activeEvent;
  $('nav-approvals-link').hidden = !activeEvent;
  $('nav-expenses-link').hidden = !activeEvent;
  $('nav-vendors-link').hidden = !activeEvent;
  $('event-title').textContent = state.event?.name || 'Create your first event';
  $('breadcrumb-event').textContent = state.event?.name || 'No active event';
  if (state.event) {
    const date = new Date(`${state.event.date}T12:00:00`).toLocaleDateString('en-BD', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('event').textContent = `${date} · ${fmt(state.event.expected_attendees)} expected attendees`;
    $('new-event').textContent = '＋ New event';
    $('reset').textContent = 'Reset workspace';
  } else {
    $('event').textContent = 'Start with an empty budget. Add expenses only when you plan them.';
    $('new-event').textContent = '＋ Create event';
  }
  $('meter-cap').textContent = fmt(state.cap);
  $('nav-pending').textContent = state.pending.length;
  $('pending-count').textContent = state.pending.length;
  $('f-spent').textContent = fmt(state.spent);
  $('f-pending').textContent = fmt(state.pending_total);
  $('f-remaining').textContent = fmt(state.remaining);
  $('f-cap').textContent = fmt(state.cap);
  updateQuotePreview();
  const safeCap = Math.max(1, state.cap);
  $('seg-spent').style.width = `${Math.min(100, (state.spent / safeCap) * 100)}%`;
  $('seg-pending').style.width = `${Math.min(100, (state.pending_total / safeCap) * 100)}%`;
  $('bar').setAttribute('aria-label', `${fmt(state.spent)} approved and ${fmt(state.pending_total)} waiting, out of a ${fmt(state.cap)} BDT cap`);

  $('pending').innerHTML = state.pending.length ? state.pending.map((p) => `
    <li><div class="proposal-main"><span class="item-icon">${icons[p.category] || 'OT'}</span><div class="proposal-info"><strong>${esc(p.description)} × ${fmt(p.quantity)}</strong><small>${esc(p.vendor_name)}${p.note ? ` · ${esc(p.note)}` : ''}</small></div></div>
    <div class="proposal-value"><strong>BDT ${fmt(p.amount)}</strong><small>Quoted total</small></div>
    <div class="actions"><button class="button button-approve" data-approve="${esc(p.id)}">Approve</button><button class="button button-reject" data-reject="${esc(p.id)}">Reject</button></div></li>`).join('')
    : '<li class="empty-state"><span>✓</span><div><strong>You’re all caught up</strong><br>No proposals are waiting. Add one here or ask the assistant.</div></li>';

  $('ledger').innerHTML = state.expenses.map((e) =>
    `<tr><td>${esc(e.description)}</td><td>${fmt(e.quantity)}</td><td class="num">BDT ${fmt(e.amount)}</td></tr>`).join('')
    + `<tr class="total-row"><td>Total approved</td><td></td><td class="num">BDT ${fmt(state.spent)}</td></tr>`;
}

function renderVendors(data) {
  $('vendor-list').innerHTML = data.vendors.map((v) => `<li><div class="vendor-title"><span class="vendor-symbol">${icons[v.category] || 'OT'}</span><span>${esc(v.name)}</span></div>
    <small>${v.items.map((i) => `${esc(i.name)} · BDT ${fmt(i.unit_price)} ${i.unit === 'person' ? 'per person' : 'flat'}`).join('; ')}</small></li>`).join('');
  $('item').innerHTML = data.vendors.flatMap((v) => v.items.map((i) =>
    `<option value="${esc(v.id)}|${esc(i.id)}" data-price="${i.unit_price}" data-unit="${esc(i.unit)}">${esc(v.name)} — ${esc(i.name)}</option>`)).join('');
  if (!initializedProposalForm && data.event) {
    const perPerson = [...$('item').options].find((option) => option.dataset.unit === 'person');
    if (perPerson) {
      $('item').value = perPerson.value;
      $('qty').value = String(data.event.expected_attendees);
    }
    initializedProposalForm = true;
  }
  updateQuotePreview();
}

function updateQuotePreview() {
  const option = $('item').selectedOptions[0];
  if (!option) return;
  const isPerPerson = option.dataset.unit === 'person';
  const quantity = isPerPerson ? Math.max(1, Number($('qty').value) || 1) : 1;
  const rate = Number(option.dataset.price);
  const total = rate * quantity;
  const remaining = Number($('f-remaining').textContent.replace(/,/g, '')) || 0;
  $('qty').disabled = !isPerPerson;
  if (!isPerPerson) $('qty').value = '1';
  const preview = $('quote-preview');
  preview.classList.toggle('over-limit', total > remaining);
  preview.textContent = `${isPerPerson ? `BDT ${fmt(rate)} per person × ${fmt(quantity)} people` : `One-time fee · BDT ${fmt(rate)}`} · Estimated total BDT ${fmt(total)}${total > remaining ? ` — BDT ${fmt(total - remaining)} over available budget` : ''}`;
}

async function refresh() {
  try {
    const [{ status: stateStatus, data: state }, { status: vendorStatus, data: vendors }] = await Promise.all([api('/api/state'), api('/api/vendors')]);
    if (stateStatus >= 400 || vendorStatus >= 400 || !Array.isArray(vendors.vendors)) throw new Error('Workspace data is unavailable. Refresh to try again.');
    renderVendors(vendors);
    render(state);
  } catch (error) {
    $('event').textContent = error.message || 'Could not load the event workspace. Check that the server is running, then refresh.';
  }
}

document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]');
  if (a) {
    const result = await setBusy(a, () => api(`/api/proposals/${a.dataset.approve}/approve`, {}));
    const { status, data } = result;
    if (status >= 400) {
      $('form-msg').className = 'msg err';
      $('form-msg').textContent = `${data.code || 'ERROR'}: ${data.message || 'Approval could not be completed.'}`;
    }
    await refresh();
  }
  if (r) {
    const { status, data } = await setBusy(r, () => api(`/api/proposals/${r.dataset.reject}/reject`, {}));
    if (status >= 400) { $('form-msg').className = 'msg err'; $('form-msg').textContent = `${data.code || 'ERROR'}: ${data.message || 'Rejection could not be completed.'}`; }
    await refresh();
  }
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [vendor_id, item_id] = $('item').value.split('|');
  const button = e.submitter || e.currentTarget.querySelector('[type="submit"]');
  const { status, data } = await setBusy(button, () => api('/api/proposals', { vendor_id, item_id, quantity: Number($('qty').value) }));
  const msg = $('form-msg');
  if (status >= 400) {
    msg.className = 'msg err';
    msg.textContent = `${data.code}: ${data.message}${data.suggestion ? ` Try up to ${data.suggestion.max_quantity}.` : ''}`;
  } else { msg.className = 'msg'; msg.textContent = 'Added to your approval queue. It is not saved until you approve it.'; }
  await refresh();
});

$('item').addEventListener('change', updateQuotePreview);
$('qty').addEventListener('input', updateQuotePreview);

$('reset').addEventListener('click', async () => {
  if (activeEvent && !window.confirm('Reset this workspace? This clears the event, approved expenses, and pending proposals.')) return;
  const button = $('reset');
  const { status, data } = await setBusy(button, () => api('/api/reset', {}));
  if (status >= 400) { $('event').textContent = data.message || 'Could not reset the workspace.'; return; }
  $('log').innerHTML = '';
  history.length = 0;
  await refresh();
});

function openEventDialog() {
  if (activeEvent && !window.confirm('Start a new event? This replaces the current event and clears its approved expenses and pending proposals.')) return;
  const form = $('event-create-form');
  form.reset();
  $('event-form-msg').textContent = '';
  $('event-dialog').dataset.replace = activeEvent ? 'true' : 'false';
  $('event-dialog').showModal();
  $('new-event-name').focus();
}
$('new-event').addEventListener('click', openEventDialog);
$('start-event').addEventListener('click', openEventDialog);

function closeEventDialog() { $('event-dialog').close(); }
$('cancel-event').addEventListener('click', closeEventDialog);
$('close-event-dialog').addEventListener('click', closeEventDialog);
$('event-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const { status, data } = await setBusy(button, () => api('/api/event', {
    name: $('new-event-name').value,
    date: $('new-event-date').value,
    expected_attendees: Number($('new-event-attendees').value),
    budget_cap: Number($('new-event-cap').value),
    replace: $('event-dialog').dataset.replace === 'true',
  }));
  if (status >= 400) {
    $('event-form-msg').className = 'msg err';
    $('event-form-msg').textContent = `${data.code || 'ERROR'}: ${data.message || 'Could not create the event.'}`;
    return;
  }
  closeEventDialog();
  history.length = 0;
  $('log').innerHTML = '<div class="assistant-welcome"><span>✳</span><p>Hi there! I can help plan expenses for your new event.</p></div>';
  await refresh();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function openChat() { $('assistant-card').hidden = false; $('chat-toggle').setAttribute('aria-expanded', 'true'); $('chat-input').focus(); }
function closeChat() { $('assistant-card').hidden = true; $('chat-toggle').setAttribute('aria-expanded', 'false'); }
$('chat-toggle').addEventListener('click', () => $('assistant-card').hidden ? openChat() : closeChat());
$('chat-close').addEventListener('click', closeChat);

function bubble(cls, text) { const d = document.createElement('div'); d.className = `bubble ${cls}`; d.textContent = text; $('log').append(d); $('log').scrollTop = 1e9; return d; }

$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = $('chat-input').value.trim();
  if (!message) return;
  $('chat-input').value = '';
  bubble('user', message);
  const wait = bubble('bot', 'Putting a plan together…');
  const send = e.submitter || e.currentTarget.querySelector('[type="submit"]');
  send.disabled = true;
  let result;
  try { result = await api('/api/chat', { message, history }); }
  catch { result = { status: 500, data: { error: 'Could not reach ClubOps. Check that the server is running and try again.' } }; }
  send.disabled = false;
  const { status, data } = result;
  wait.remove();
  if (status >= 400) { bubble('bot', data.error || 'Something went wrong.'); return; }
  if (data.events?.length) {
    const t = document.createElement('div'); t.className = 'tools';
    t.innerHTML = data.events.map((ev) => `${esc(ev.tool)}${ev.result?.ok === false ? ` <span class="refused">refused ${esc(ev.result.code)}</span>` : ''}`).join(', ');
    $('log').append(t);
  }
  bubble('bot', data.reply);
  if (data.review) bubble('review', `Budget reviewer: ${data.review}`);
  history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
  refresh();
});

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
refresh();
