const DAY = 86_400_000;
export const LIMITS = Object.freeze({ items: 2, days: 7 });
export const violation = (code, message) => ({ code, message });
export const failure = (code, message) => ({ ok: false, violations: [violation(code, message)] });

export function labToday(now = new Date(), timezone = 'Asia/Dhaka') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name) => parts.find((entry) => entry.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const positive = (value) => Number.isSafeInteger(value) && value > 0;

export function normalizeRequest(input) {
  if (!input || !text(input.student_id) || !Array.isArray(input.items)
      || !input.items.length || input.items.length > 100
      || !validDate(input.start_date) || !validDate(input.due_date)
      || input.due_date <= input.start_date) {
    return failure('INVALID_INPUT', 'Provide a student ID, equipment, positive quantities, and a due date after the start date.');
  }
  const quantities = new Map();
  for (const item of input.items) {
    if (!item || !text(item.equipment_id) || !positive(item.quantity)) {
      return failure('INVALID_INPUT', 'Equipment IDs and positive whole-number quantities are required.');
    }
    const total = (quantities.get(item.equipment_id) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(total)) return failure('INVALID_INPUT', 'Quantity is too large.');
    quantities.set(item.equipment_id, total);
  }
  const items = [...quantities].map(([equipment_id, quantity]) => ({ equipment_id, quantity }));
  if (!Number.isSafeInteger(items.reduce((sum, item) => sum + item.quantity, 0))) {
    return failure('INVALID_INPUT', 'Total quantity is too large.');
  }
  return { ok: true, proposal: {
    student_id: input.student_id.trim(), items,
    start_date: input.start_date, due_date: input.due_date,
    duration_days: (Date.parse(input.due_date) - Date.parse(input.start_date)) / DAY,
  } };
}

// Returned loans release inventory. Overdue, unreturned loans have no assumed return date.
function interval(loan, today) {
  return { start: loan.start_date, end: loan.due_date <= today ? '9999-12-31' : loan.due_date };
}

function maximumUsage(loans, start, end, today, units) {
  const relevant = loans.filter((loan) => {
    const range = interval(loan, today);
    return loan.status === 'active' && range.start < end && range.end > start;
  });
  const points = new Set([start, ...relevant.map((loan) => loan.start_date).filter((date) => date >= start)]);
  let maximum = 0;
  for (const date of points) {
    const used = relevant.reduce((sum, loan) => {
      const range = interval(loan, today);
      return sum + (range.start <= date && date < range.end ? units(loan) : 0);
    }, 0);
    maximum = Math.max(maximum, used);
  }
  return maximum;
}

export function availableQuantity(equipment, data, start, end, today) {
  const used = maximumUsage(data.loans, start, end, today,
    (loan) => loan.items.filter((entry) => entry.equipment_id === equipment.id)
      .reduce((sum, entry) => sum + entry.quantity, 0));
  return Math.max(0, equipment.total_quantity - used);
}

export function validateLoan(input, data, today) {
  const result = normalizeRequest(input);
  if (!result.ok) return result;
  const proposal = result.proposal;
  const violations = [];
  if (proposal.start_date < today) violations.push(violation('INVALID_INPUT', 'The start date must be today or later.'));
  if (proposal.duration_days > LIMITS.days) {
    violations.push(violation('DURATION_LIMIT_EXCEEDED', 'A loan may last at most 7 days.'));
  }
  const units = proposal.items.reduce((sum, item) => sum + item.quantity, 0);
  const existing = maximumUsage(data.loans.filter((loan) => loan.student_id === proposal.student_id),
    proposal.start_date, proposal.due_date, today,
    (loan) => loan.items.reduce((sum, item) => sum + item.quantity, 0));
  if (units + existing > LIMITS.items) {
    violations.push(violation('ITEM_LIMIT_EXCEEDED', `At most 2 units may be on loan at once. You already have up to ${existing} during these dates.`));
  }
  const availability = [];
  for (const item of proposal.items) {
    const equipment = data.equipment.find((entry) => entry.id === item.equipment_id);
    if (!equipment) {
      violations.push(violation('EQUIPMENT_NOT_FOUND', `Unknown equipment: ${item.equipment_id}.`));
      continue;
    }
    const available = availableQuantity(equipment, data, proposal.start_date, proposal.due_date, today);
    availability.push({ equipment_id: equipment.id, name: equipment.name, available_quantity: available });
    if (item.quantity > available) {
      violations.push(violation('INSUFFICIENT_STOCK', `${equipment.name}: only ${available} units available throughout these dates.`));
    }
  }
  return { ok: violations.length === 0, violations, proposal, availability };
}

// Structural validation of persisted data happens before any tool can use it.
export function validateData(data) {
  if (!data || !Array.isArray(data.equipment) || !Array.isArray(data.loans)) throw new Error('Invalid data arrays');
  const ids = new Set();
  for (const item of data.equipment) {
    if (!item || !text(item.id) || ids.has(item.id) || !text(item.name)
        || typeof item.description !== 'string'
        || !Number.isSafeInteger(item.total_quantity) || item.total_quantity < 0) throw new Error('Invalid equipment record');
    ids.add(item.id);
  }
  const loanIds = new Set();
  for (const loan of data.loans) {
    const normalized = normalizeRequest(loan);
    if (!normalized.ok || !text(loan.id) || loanIds.has(loan.id)
        || !['active', 'returned'].includes(loan.status)
        || normalized.proposal.duration_days > LIMITS.days
        || normalized.proposal.items.reduce((sum, item) => sum + item.quantity, 0) > LIMITS.items
        || normalized.proposal.items.some((item) => !ids.has(item.equipment_id))
        || !['approved_at', 'created_at'].every((key) => typeof loan[key] === 'string' && Number.isFinite(Date.parse(loan[key])))) {
      throw new Error('Invalid loan record');
    }
    loanIds.add(loan.id);
  }
  return data;
}
