import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTaskOnDate, missedDates, type Task } from './tasks.ts';

const ts = (d: Date) => ({ toDate: () => d }) as any;
const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);
const task = (t: Partial<Task>): Task =>
  ({ id: 'x', title: 't', status: 'todo', priority: 'medium', userId: 'u', createdAt: ts(day(2026, 1, 1)), ...t }) as Task;

test('monthly on the 16th', () => {
  const t = task({ recurrence: { type: 'monthly', dayOfMonth: 16 } });
  assert.equal(isTaskOnDate(t, day(2026, 11, 16)), true);
  assert.equal(isTaskOnDate(t, day(2026, 11, 15)), false);
});

test('day 31 falls on the last day of shorter months', () => {
  const t = task({ recurrence: { type: 'monthly', dayOfMonth: 31 } });
  assert.equal(isTaskOnDate(t, day(2027, 2, 28)), true);
  assert.equal(isTaskOnDate(t, day(2026, 11, 30)), true);
  assert.equal(isTaskOnDate(t, day(2026, 10, 30)), false);
  assert.equal(isTaskOnDate(t, day(2026, 10, 31)), true);
});

test('old monthly tasks without dayOfMonth keep the creation day', () => {
  const t = task({ createdAt: ts(day(2026, 1, 5)), recurrence: { type: 'monthly' } });
  assert.equal(isTaskOnDate(t, day(2026, 3, 5)), true);
});

const today = day(2026, 10, 21);

test('missed weekly routine shows the unticked Tuesday', () => {
  const t = task({ recurrence: { type: 'weekly', daysOfWeek: [2] }, completedDates: ['2026-10-13'] });
  assert.deepEqual(missedDates(t, today), [day(2026, 10, 20)]);
});

test('ticked routine is not missed, today does not count', () => {
  const t = task({ recurrence: { type: 'daily' }, createdAt: ts(day(2026, 10, 20, 9)), completedDates: ['2026-10-20'] });
  assert.deepEqual(missedDates(t, today), []);
});

test('routine looks back two weeks at most, never before it was created', () => {
  assert.equal(missedDates(task({ recurrence: { type: 'daily' } }), today).length, 14);
  assert.equal(missedDates(task({ recurrence: { type: 'daily' }, createdAt: ts(day(2026, 10, 18, 12)) }), today).length, 3);
});

test('single overdue task stays missed until done, however old', () => {
  const due = day(2026, 3, 1, 12);
  assert.deepEqual(missedDates(task({ dueDate: ts(due) }), today), [due]);
  assert.deepEqual(missedDates(task({ dueDate: ts(due), status: 'done' }), today), []);
  assert.deepEqual(missedDates(task({ dueDate: ts(day(2026, 10, 21, 18)) }), today), []);
});

test('multi-date task: only past unticked dates', () => {
  const t = task({ dueDates: [ts(day(2026, 10, 16, 12)), ts(day(2026, 11, 16, 12))], completedDates: [] });
  assert.deepEqual(missedDates(t, today), [day(2026, 10, 16)]);
});

test('undated task is never missed', () => {
  assert.deepEqual(missedDates(task({}), today), []);
});
