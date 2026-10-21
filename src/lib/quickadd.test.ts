import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bumpCohort, parseQuickAdd } from './quickadd.ts';

const today = new Date(2026, 9, 21); // Wednesday
const day = (m: number, d: number, y = 2026) => new Date(y, m - 1, d);
const p = (s: string) => {
  const r = parseQuickAdd(s, today);
  return { title: r.title, time: r.time, date: r.date, recurrence: r.recurrence };
};

test('time with a colon, anywhere in the text', () => {
  assert.deepEqual(p('14:30 позвонить Пете'), { title: 'позвонить Пете', time: '14:30', date: null, recurrence: null });
  assert.deepEqual(p('созвон в 9:05'), { title: 'созвон', time: '09:05', date: null, recurrence: null });
  assert.equal(p('25:00 нет').time, null);
});

test('relative days', () => {
  assert.deepEqual(p('завтра 10:00 созвон с Лёшей'), { title: 'созвон с Лёшей', time: '10:00', date: day(10, 22), recurrence: null });
  assert.deepEqual(p('сегодня купить хлеб').date, today);
  assert.deepEqual(p('послезавтра отчёт').date, day(10, 23));
  assert.deepEqual(p('через 3 дня проверить висяки'), { title: 'проверить висяки', time: null, date: day(10, 24), recurrence: null });
  assert.deepEqual(p('через неделю ревью').date, day(10, 28));
});

test('weekdays: the nearest one, today included', () => {
  assert.deepEqual(p('пт отчёт по спринту'), { title: 'отчёт по спринту', time: null, date: day(10, 23), recurrence: null });
  assert.deepEqual(p('созвон в понедельник').date, day(10, 26));
  assert.deepEqual(p('в среду выгрузка').date, today);
  assert.equal(p('отчёт по спринту').date, null); // "по" alone is not a weekday
  assert.equal(p('среди задач найти').date, null);
});

test('dates: 30.10, 30 окт, past dates roll to next year, impossible dates ignored', () => {
  assert.deepEqual(p('30.10 сдать отчёт'), { title: 'сдать отчёт', time: null, date: day(10, 30), recurrence: null });
  assert.deepEqual(p('сдать отчёт 30 окт').date, day(10, 30));
  assert.deepEqual(p('5 января планёрка').date, day(1, 5, 2027));
  assert.deepEqual(p('1.10 что-то').date, day(10, 1, 2027));
  assert.deepEqual(p('на 4.11.2026 бонусы').date, day(11, 4));
  assert.equal(p('31.02 нет').date, null);
});

test('routines', () => {
  assert.deepEqual(p('каждый вт 11:00 отзывы ТО'), { title: 'отзывы ТО', time: '11:00', date: null, recurrence: { type: 'weekly', daysOfWeek: [2], time: '11:00' } });
  assert.deepEqual(p('по вторникам и четвергам выгрузка').recurrence, { type: 'weekly', daysOfWeek: [2, 4] });
  assert.deepEqual(p('каждый пн, ср, пт зарядка').recurrence, { type: 'weekly', daysOfWeek: [1, 3, 5] });
  assert.deepEqual(p('каждое 16 число обработка собаке'), { title: 'обработка собаке', time: null, date: null, recurrence: { type: 'monthly', daysOfWeek: [], dayOfMonth: 16 } });
  assert.deepEqual(p('в конце месяца показания счётчика'), { title: 'показания счётчика', time: null, date: null, recurrence: { type: 'monthly', daysOfWeek: [], dayOfMonth: 31 } });
  assert.deepEqual(p('ежедневно 9:00 почта').recurrence, { type: 'daily', daysOfWeek: [], time: '09:00' });
});

test('nothing but a date is not a task', () => {
  assert.deepEqual(p('завтра'), { title: 'завтра', time: null, date: null, recurrence: null });
});

test('duplicate bumps the cohort number only', () => {
  assert.equal(bumpCohort('Бонусные материалы — ТО 66 поток'), 'Бонусные материалы — ТО 67 поток');
  assert.equal(bumpCohort('Про ТО 61-й поток'), 'Про ТО 62-й поток');
  assert.equal(bumpCohort('Проверка висяков (дедлайн 24.11)'), 'Проверка висяков (дедлайн 24.11)');
});
