import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLoan, labToday } from '../src/domain.js';
import { request, loan } from './helpers.js';

const data = (loans = [], total = 6) => ({ equipment: [{ id: 'arduino-uno-kit', name: 'Arduino', total_quantity: total }], loans });
const check = (input, state = data()) => validateLoan(input, state, '2026-10-18');
const codes = (result) => result.violations.map((entry) => entry.code);

test('case 1 and exact boundary: two units for seven days are valid', () => {
  assert.equal(check(request()).ok, true);
  assert.equal(check(request()).proposal.duration_days, 7);
});
test('case 2: third concurrent unit and eighth day are refused', () => {
  assert(codes(check(request(), data([loan()]))).includes('ITEM_LIMIT_EXCEEDED'));
  assert(codes(check(request({ items: [{ equipment_id: 'arduino-uno-kit', quantity: 1 }] }),
    data([loan(), loan({ id: 'existing-2' })]))).includes('ITEM_LIMIT_EXCEEDED'));
  assert(codes(check(request({ due_date: '2026-10-27' }))).includes('DURATION_LIMIT_EXCEEDED'));
});
test('case 3 reports both item and duration codes', () => {
  const result = check(request({ items: [{ equipment_id: 'arduino-uno-kit', quantity: 4 }], due_date: '2026-11-02' }));
  assert.deepEqual(new Set(codes(result)), new Set(['ITEM_LIMIT_EXCEEDED', 'DURATION_LIMIT_EXCEEDED']));
});
test('duplicate equipment rows combine before enforcing capacity', () => {
  const result = check(request({ items: [{ equipment_id: 'arduino-uno-kit', quantity: 1 }, { equipment_id: 'arduino-uno-kit', quantity: 2 }] }));
  assert(codes(result).includes('ITEM_LIMIT_EXCEEDED'));
  assert.equal(result.proposal.items[0].quantity, 3);
});
test('counts concurrent peak, not sum of separate non-overlapping existing loans', () => {
  const state = data([loan({ due_date: '2026-10-22' }), loan({ id: 'existing-2', start_date: '2026-10-22' })]);
  assert.equal(check(request({ items: [{ equipment_id: 'arduino-uno-kit', quantity: 1 }] }), state).ok, true);
});
test('non-overlapping future loans do not consume capacity or stock', () => {
  assert.equal(check(request(), data([loan({ start_date: '2026-10-26', due_date: '2026-11-02' })], 2)).ok, true);
});
test('overdue unreturned loans consume future capacity until returned', () => {
  const overdue = loan({ start_date: '2026-10-10', due_date: '2026-10-17' });
  assert(codes(check(request(), data([overdue]))).includes('ITEM_LIMIT_EXCEEDED'));
  assert.equal(check(request(), data([{ ...overdue, status: 'returned' }])).ok, true);
});
test('other students consume stock but not student capacity', () => {
  const result = check(request(), data([loan({ student_id: 'another' })], 2));
  assert.deepEqual(codes(result), ['INSUFFICIENT_STOCK']);
  assert.equal(result.availability[0].available_quantity, 1);
});
test('invalid, empty, fractional, negative, and impossible input is refused', () => {
  for (const input of [null, {}, request({ items: [] }), request({ start_date: '2026-02-30' }),
    request({ start_date: '2026-10-17' }), request({ due_date: '2026-10-19' }), request({ student_id: '' }),
    ...[0, -1, 1.5, '2', Infinity].map((quantity) => request({ items: [{ equipment_id: 'arduino-uno-kit', quantity }] }))]) {
    assert(codes(check(input)).includes('INVALID_INPUT'), JSON.stringify(input));
  }
});
test('unknown equipment does not silently become a valid item', () => {
  assert(codes(check(request({ items: [{ equipment_id: 'unknown', quantity: 1 }] }))).includes('EQUIPMENT_NOT_FOUND'));
});
test('calendar dates use the lab timezone rather than the host date', () => {
  assert.equal(labToday(new Date('2026-10-18T20:00:00Z')), '2026-10-19');
});
