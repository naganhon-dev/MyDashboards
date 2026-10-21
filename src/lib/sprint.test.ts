import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportDraft, sprintOf, sprintReport } from './sprint.ts';
import type { Task } from './tasks.ts';

const ts = (d: Date) => ({ toDate: () => d }) as any;
const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);
const task = (t: Partial<Task>): Task =>
  ({ id: Math.random().toString(), title: 't', status: 'todo', priority: 'medium', userId: 'u', createdAt: ts(day(2026, 9, 1)), ...t }) as Task;

test('sprint dates follow the 14-day cycle from 19.10.2026', () => {
  const s = sprintOf(day(2026, 10, 21));
  assert.deepEqual([s.start, s.end, s.report], [day(2026, 10, 19), day(2026, 11, 1), day(2026, 10, 30)]);
  const next = sprintOf(day(2026, 11, 2));
  assert.deepEqual([next.start, next.end, next.report], [day(2026, 11, 2), day(2026, 11, 15), day(2026, 11, 13)]);
  assert.deepEqual(sprintOf(day(2026, 11, 1)).start, day(2026, 10, 19)); // Sunday still belongs to the sprint
  assert.deepEqual(sprintOf(day(2026, 10, 18)).start, day(2026, 10, 5)); // and the day before it to the previous one
  assert.deepEqual(sprintOf(day(2026, 10, 21), -1).start, day(2026, 10, 5));
});

test('report: routines counted, one-offs by completion date, next sprint as focus', () => {
  const s = sprintOf(day(2026, 10, 21));
  const today = day(2026, 10, 23);
  const r = sprintReport([
    task({ title: 'Выгрузка ретеншн', recurrence: { type: 'weekly', daysOfWeek: [3] }, completedDates: ['2026-10-21'] }),
    task({ title: 'Отзывы ТО', recurrence: { type: 'weekly', daysOfWeek: [2] }, completedDates: [] }),
    task({ title: 'Пуш на старт ТО', status: 'done', completedAt: ts(day(2026, 10, 22, 15)), dueDate: ts(day(2026, 10, 1)) }),
    task({ title: 'Старое сделанное', status: 'done', dueDate: ts(day(2026, 10, 20, 12)) }),
    task({ title: 'Сделано в прошлом спринте', status: 'done', completedAt: ts(day(2026, 10, 10)) }),
    task({ title: 'Запись ТД', dueDate: ts(day(2026, 10, 20, 12)) }),
    task({ title: 'Сегодняшнее', dueDate: ts(day(2026, 10, 23, 18)) }),
    task({ title: 'Бонусные материалы — ТО 66 поток', dueDate: ts(day(2026, 11, 4, 11)) }),
    task({ title: 'Окончание потока', dueDates: [ts(day(2026, 11, 4, 11)), ts(day(2026, 11, 18, 11))] }),
  ], s, today);
  const titles = (l: { task: Task; count: number }[]) => l.map((x) => `${x.task.title}${x.count > 1 ? ` ×${x.count}` : ''}`);
  assert.deepEqual(titles(r.done), ['Выгрузка ретеншн', 'Пуш на старт ТО', 'Старое сделанное']);
  assert.deepEqual(titles(r.missed), ['Отзывы ТО', 'Запись ТД']);
  assert.deepEqual(titles(r.planned), ['Бонусные материалы — ТО 66 поток', 'Окончание потока']);
});

test('draft follows the report template', () => {
  const r = { done: [{ task: task({ title: 'Пуш ' }), count: 2 }], missed: [], planned: [], next: sprintOf(day(2026, 11, 2)) };
  assert.equal(reportDraft('@Faleksei  по спринту:', r), '@Faleksei  по спринту:\n\nДостижения:\n\nПуш (×2);\n\nПроблемы:\n\n—\n\nФокус:\n\n—');
});
