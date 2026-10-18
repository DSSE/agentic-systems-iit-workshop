const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('en-US');
let vendorsData = null;
const history = [];

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function render(state) {
  $('event').textContent = state.planning_inputs_set
    ? `${state.event.name}, ${state.event.date}, capacity ${state.event.expected_attendees} people`
    : `${state.event.name}, ${state.event.date} · Tell the assistant your total budget and attendee capacity to start planning.`;
  $('f-spent').textContent = fmt(state.spent);
  $('f-pending').textContent = fmt(state.pending_total);
  $('f-remaining').textContent = fmt(state.remaining);
  $('f-cap').textContent = fmt(state.cap);
  $('f-cap').parentElement.querySelector('.l').textContent = state.planning_inputs_set ? 'budget, BDT' : 'demo budget, BDT';
  $('seg-spent').style.width = `${(state.spent / state.cap) * 100}%`;
  $('seg-pending').style.width = `${(state.pending_total / state.cap) * 100}%`;
  $('bar').setAttribute('aria-label', `${fmt(state.spent)} approved and ${fmt(state.pending_total)} waiting, out of a ${fmt(state.cap)} BDT cap`);

  $('alerts').innerHTML = state.security_events.map((e) =>
    `<div class="alert err"><strong>Blocked text in ${esc(e.vendor_name)}'s terms.</strong> It ${esc(e.reasons.join(' and '))}. It was removed before any assistant saw it.<small>Original: ${esc(e.original)}</small></div>`).join('');

  $('pending').innerHTML = state.pending.length ? state.pending.map((p) => `
    <li><div class="what">${esc(p.description)} x ${p.quantity}<small>${esc(p.vendor_name)}${p.note ? ', ' + esc(p.note) : ''}</small></div>
    <div class="actions"><strong>${fmt(p.amount)}</strong>
      <button class="approve" data-approve="${p.id}">Approve</button>
      <button class="ghost" data-reject="${p.id}">Reject</button></div></li>`).join('')
    : '<li class="empty">No proposals yet. Propose one below or ask the assistant.</li>';

  $('ledger').innerHTML = state.expenses.map((e) =>
    `<tr><td>${esc(e.description)}</td><td class="num">${e.quantity}</td><td class="num">${fmt(e.amount)}</td></tr>`).join('')
    + `<tr><td><strong>Total approved</strong></td><td></td><td class="num"><strong>${fmt(state.spent)}</strong></td></tr>`;
}

function renderVendors(data) {
  vendorsData = data;
  $('vendors').innerHTML = data.vendors.map((v) => `<li><strong>${esc(v.name)}</strong>
    <small>${v.items.map((i) => `${esc(i.name)}: ${fmt(i.unit_price)} BDT ${i.unit === 'person' ? 'per person' : 'flat'}`).join('; ')}</small>
    <small>${esc(v.terms)}</small></li>`).join('');
  $('item').innerHTML = data.vendors.flatMap((v) => v.items.map((i) =>
    `<option value="${v.id}|${i.id}">${esc(v.name)}: ${esc(i.name)} (${fmt(i.unit_price)})</option>`)).join('');
}

async function refresh() {
  const [{ data: state }, { data: vendors }] = await Promise.all([api('/api/state'), api('/api/vendors')]);
  renderVendors(vendors);
  render((await api('/api/state')).data); // vendors call may add a security event
}

document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-approve]'), r = e.target.closest('[data-reject]');
  if (a) {
    const { status, data } = await api(`/api/proposals/${a.dataset.approve}/approve`, {});
    if (status >= 400) alert(`${data.code}: ${data.message}`);
    refresh();
  }
  if (r) { await api(`/api/proposals/${r.dataset.reject}/reject`, {}); refresh(); }
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const [vendor_id, item_id] = $('item').value.split('|');
  const { status, data } = await api('/api/proposals', { vendor_id, item_id, quantity: Number($('qty').value) });
  const msg = $('form-msg');
  if (status >= 400) {
    msg.className = 'msg err';
    msg.textContent = `${data.code}: ${data.message}${data.suggestion ? ` Try up to ${data.suggestion.max_quantity}.` : ''}`;
  } else { msg.className = 'msg ok'; msg.textContent = 'Proposed. Approve it above to save it.'; }
  refresh();
});

$('reset').addEventListener('click', async () => { await api('/api/reset', {}); $('log').innerHTML = ''; history.length = 0; refresh(); });

function bubble(cls, text) { const d = document.createElement('div'); d.className = `bubble ${cls}`; d.textContent = text; $('log').append(d); $('log').scrollTop = 1e9; return d; }

$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = $('chat-input').value.trim();
  if (!message) return;
  $('chat-input').value = '';
  bubble('user', message);
  const wait = bubble('bot', 'Working on it');
  const { status, data } = await api('/api/chat', { message, history });
  wait.remove();
  if (status >= 400) { bubble('bot', data.error || 'Something went wrong.'); return; }
  if (data.events?.length) {
    const t = document.createElement('div'); t.className = 'tools';
    t.innerHTML = data.events.map((ev) => `${esc(ev.tool)}${ev.result?.ok === false ? ` <span class="refused">refused ${esc(ev.result.code)}</span>` : ''}`).join(', ');
    $('log').append(t);
  }
  bubble('bot', data.reply);
  history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
  refresh();
});

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
refresh();
