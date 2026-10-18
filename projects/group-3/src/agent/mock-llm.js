// Offline stand-in for an LLM, used by tests, CI and demos without a key.
// It is a small rule-based planner that speaks the same interface as a real model.
// It proves the plumbing (agent -> MCP -> domain). It does NOT measure prompt quality: run evals with a real model for that.

const ITEM_WORDS = [
  ['snack', 'snack-box', 'person'],
  ['catering', 'full-meal', 'person'],
  ['speaker', 'speaker-fee', 'flat'],
  ['sound', 'sound-kit', 'flat'],
  ['mic', 'sound-kit', 'flat'],
  ['banner', 'banner', 'flat'],
];

const toolCall = (name, args) => ({ id: `call_${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const parse = (m) => { try { return JSON.parse(m.content); } catch { return null; } };

export function createMockLLM() {
  return {
    name: 'mock',
    async chat({ messages }) {
      const lastUser = messages.map((m) => m.role).lastIndexOf('user');
      const text = String(messages[lastUser].content).toLowerCase();
      const results = messages.slice(lastUser + 1).filter((m) => m.role === 'tool').map(parse);

      const headcount = Number(text.match(/(\d+)\s*(people|persons|attendees|guests)/)?.[1]) || null;
      const hasMoney = /\d[\d,]*\s*(bdt|taka|tk)\b/.test(text);
      const named = ITEM_WORDS.filter(([w]) => text.includes(w));
      const vague = /\b(food|lunch|dinner|meal|refreshments?)\b/.test(text) && !named.some(([w]) => w === 'snack' || w === 'catering') && !headcount && !hasMoney;

      if (vague) return { content: 'How many people should the food cover, and how much would you like to spend (in BDT)?', tool_calls: [] };
      if (named.length === 0) return { content: 'I can plan snacks, catering, a speaker, sound equipment or a banner. What would you like to add?', tool_calls: [] };

      if (results.length === 0) return { content: '', tool_calls: [toolCall('list_vendors', {})] };
      const { event, vendors } = results[0];
      const wanted = [...new Map(named.map(([, id, unit]) => [id, { id, unit }])).values()].map((w) => {
        const vendor = vendors.find((v) => v.items.some((i) => i.id === w.id));
        const item = vendor.items.find((i) => i.id === w.id);
        const quantity = w.unit === 'person' ? (headcount ?? event.expected_attendees) : 1;
        return { vendor_id: vendor.id, item_id: w.id, name: item.name, quantity, amount: item.unit_price * quantity };
      });

      const step = results.length - 1; // 0..: check, add, check, add...
      if (step < wanted.length * 2) {
        const w = wanted[Math.floor(step / 2)];
        return { content: '', tool_calls: [step % 2 === 0 ? toolCall('check_budget', { amount: w.amount }) : toolCall('add_expense', { vendor_id: w.vendor_id, item_id: w.item_id, quantity: w.quantity })] };
      }

      const adds = results.slice(1).filter((_, i) => i % 2 === 1); // every second result is an add_expense
      const lines = adds.map((r, i) => {
        if (r.ok) return `Proposed ${r.proposal.description} x ${r.proposal.quantity} for ${r.proposal.amount} BDT.`;
        const hint = r.suggestion ? ` I can suggest up to ${r.suggestion.max_quantity} (${r.suggestion.max_amount} BDT) instead.` : '';
        return `I can't add ${wanted[i]?.name ?? 'that'}: ${r.code}. It would be ${r.over_by} BDT over the cap.${hint}`;
      });
      const anyOk = adds.some((r) => r?.ok);
      return { content: `${lines.join(' ')}${anyOk ? ' Nothing is saved until you press Approve.' : ''}`, tool_calls: [] };
    },
  };
}
