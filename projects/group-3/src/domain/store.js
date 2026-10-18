// The ONE place that reads and writes data. Every client calls these functions:
//   UI -> API -> store    MCP server -> store    agent -> MCP -> store
// Nothing becomes an expense until approveProposal() runs, and that only happens from a person's action.

import fs from 'node:fs';
import path from 'node:path';
import { checkBudget, maxAffordableQuantity, sum } from './budget.js';
import { screenUntrustedText, cleanNote } from './guardrails.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

export function createStore({
  dataFile = process.env.DATA_FILE || path.join(root, 'data.json'),
  stateFile = process.env.STATE_FILE || path.join(root, '.state.json'),
} = {}) {
  const seed = () => {
    const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { ...d, pending: d.pending ?? [], security_events: [], seq: 1 };
  };
  const load = () => {
    if (!fs.existsSync(stateFile)) save(seed());
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  };
  const save = (state) => {
    const tmp = `${stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, stateFile); // atomic: other processes never see half a file
  };
  const figures = (s) => ({ cap: s.budget_cap, spent: sum(s.expenses), pending: sum(s.pending) });

  function findItem(s, vendorId, itemId) {
    const vendor = s.vendors.find((v) => v.id === vendorId);
    const item = vendor?.items.find((i) => i.id === itemId);
    return { vendor, item };
  }

  return {
    reset() { save(seed()); return this.getState(); },

    getState() {
      const s = load();
      const f = figures(s);
      return {
        event: s.event, cap: f.cap, spent: f.spent, pending_total: f.pending,
        remaining: f.cap - f.spent - f.pending,
        expenses: s.expenses, pending: s.pending, security_events: s.security_events,
      };
    },

    /** Tool: list_vendors. Vendor free text is screened here, so every client gets the safe version. */
    listVendors() {
      const s = load();
      let changed = false;
      const vendors = s.vendors.map((v) => {
        const screened = screenUntrustedText(v.terms);
        if (screened.flagged && !s.security_events.some((e) => e.vendor_id === v.id)) {
          s.security_events.push({
            at: new Date().toISOString(), vendor_id: v.id, vendor_name: v.name,
            kind: 'prompt_injection_blocked', reasons: screened.reasons, original: v.terms,
          });
          changed = true;
        }
        return { id: v.id, name: v.name, category: v.category, terms: screened.text, items: v.items };
      });
      if (changed) save(s);
      return { event: s.event, vendors };
    },

    /** Tool: check_budget. Read only. With no amount it reports the current position. */
    checkBudget(amount = 0) {
      return checkBudget(figures(load()), amount);
    },

    /** Tool: add_expense. Creates a PROPOSAL only. Price comes from vendor data, never from the caller. */
    proposeExpense({ vendor_id, item_id, quantity = 1, note = '' }) {
      const s = load();
      const { vendor, item } = findItem(s, vendor_id, item_id);
      if (!vendor || !item) {
        return { ok: false, code: 'UNKNOWN_ITEM', message: `No such vendor item: ${vendor_id}/${item_id}. Call list_vendors first.` };
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
        return { ok: false, code: 'INVALID_QUANTITY', message: 'Quantity must be a whole number of at least 1.' };
      }
      if (item.unit === 'flat' && quantity !== 1) {
        return { ok: false, code: 'INVALID_QUANTITY', message: `${item.name} is a flat fee; quantity must be 1.` };
      }
      const amount = item.unit_price * quantity;
      const check = checkBudget(figures(s), amount);
      if (!check.ok) {
        const out = { ...check, item: item.name, quantity };
        if (item.unit === 'person') {
          const max = maxAffordableQuantity(check.remaining, item.unit_price);
          out.suggestion = { max_quantity: max, max_amount: max * item.unit_price, note: 'A smaller order that fits the remaining budget.' };
        }
        return out;
      }
      const proposal = {
        id: `p${s.seq++}`, vendor_id, vendor_name: vendor.name, item_id,
        description: item.name, quantity, unit_price: item.unit_price, amount,
        note: cleanNote(note), created_at: new Date().toISOString(),
      };
      s.pending.push(proposal);
      save(s);
      return {
        ok: true, status: 'pending_approval', proposal,
        message: 'Proposal created. NOT saved: a person must press Approve in the UI.',
        budget_after_if_approved: check.total_after, cap: check.cap,
      };
    },

    /** Called only by the Approve button (UI -> API). The rule is checked AGAIN here. */
    approveProposal(id) {
      const s = load();
      const idx = s.pending.findIndex((p) => p.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND', message: `No pending proposal ${id}.` };
      const p = s.pending[idx];
      const check = checkBudget({ cap: s.budget_cap, spent: sum(s.expenses), pending: 0 }, p.amount);
      if (!check.ok) return { ...check, proposal_id: id };
      s.pending.splice(idx, 1);
      const expense = { id: `e${s.seq++}`, vendor_id: p.vendor_id, item_id: p.item_id, description: p.description,
        quantity: p.quantity, amount: p.amount, approved_at: new Date().toISOString() };
      s.expenses.push(expense);
      save(s);
      return { ok: true, expense };
    },

    rejectProposal(id) {
      const s = load();
      const before = s.pending.length;
      s.pending = s.pending.filter((p) => p.id !== id);
      if (s.pending.length === before) return { ok: false, code: 'NOT_FOUND', message: `No pending proposal ${id}.` };
      save(s);
      return { ok: true };
    },
  };
}
