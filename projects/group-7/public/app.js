const $ = (id) => document.getElementById(id);

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error?.message ?? 'Request failed');
    err.code = body.error?.code;
    throw err;
  }
  return body;
}

function say(text, kind) {
  const box = $('message');
  box.hidden = !text;
  box.textContent = text ?? '';
  box.className = kind ?? '';
}

function sayError(err) {
  say(err.code ? `${err.code}: ${err.message}` : err.message, 'error');
}

const money = (n, currency) => `${n.toLocaleString()} ${currency}`;

async function refresh() {
  const [{ vendors, currency }, budget, proposals] = await Promise.all([
    api('/vendors'),
    api('/budget'),
    api('/proposals'),
  ]);

  $('event').textContent = budget.event;
  $('bar-spent').style.width = `${(budget.spent / budget.cap) * 100}%`;
  $('bar-pending').style.width = `${(budget.pending / budget.cap) * 100}%`;
  $('budget-text').textContent =
    `Saved ${money(budget.spent, currency)} + pending ${money(budget.pending, currency)} of ${money(budget.cap, currency)} cap. ` +
    `${money(budget.remaining, currency)} left.`;

  const vendorList = $('vendors');
  vendorList.replaceChildren();
  for (const v of vendors) {
    const li = el('li');
    li.append(el('strong', v.name), el('div', `${v.item}: ${money(v.unitPrice, currency)} ${v.unit}`));
    li.append(el('p', v.terms, 'terms'));
    const qty = el('input');
    qty.type = 'number';
    qty.min = '1';
    qty.value = '1';
    qty.setAttribute('aria-label', `Quantity for ${v.name}`);
    const btn = el('button', 'Propose');
    btn.addEventListener('click', async () => {
      try {
        await api('/proposals', { method: 'POST', body: { vendorId: v.id, quantity: Number(qty.value) } });
        say(`Proposed ${qty.value} x ${v.item} from ${v.name}. Approve it to save.`, 'ok');
      } catch (err) {
        sayError(err);
      }
      await refresh();
    });
    const row = el('div', undefined, 'row');
    row.append(qty, btn);
    li.append(row);
    vendorList.append(li);
  }

  const proposalList = $('proposals');
  proposalList.replaceChildren();
  if (proposals.length === 0) proposalList.append(el('li', 'No proposals yet.', 'muted'));
  for (const p of proposals) {
    const li = el('li');
    li.append(el('strong', `${p.quantity} x ${p.item}`), el('div', `${p.vendorName}: ${money(p.amount, currency)}`));
    if (p.status === 'pending') {
      const approve = el('button', 'Approve', 'primary');
      approve.addEventListener('click', async () => {
        try {
          await api(`/proposals/${p.id}/approve`, { method: 'POST' });
          say('Expense saved.', 'ok');
        } catch (err) {
          sayError(err);
        }
        await refresh();
      });
      const reject = el('button', 'Reject');
      reject.addEventListener('click', async () => {
        await api(`/proposals/${p.id}/reject`, { method: 'POST' });
        await refresh();
      });
      const row = el('div', undefined, 'row');
      row.append(approve, reject);
      li.append(row);
    } else {
      li.append(el('div', p.status, 'status'));
    }
    proposalList.append(li);
  }

  const expenseList = $('expenses');
  expenseList.replaceChildren();
  for (const e of budget.expenses) {
    const li = el('li');
    li.append(el('strong', `${e.quantity} x ${e.item}`), el('div', `${e.vendorName}: ${money(e.amount, currency)}`));
    expenseList.append(li);
  }
}

refresh().catch(sayError);
