import { addDays, addWeeks, startOfToday } from 'date-fns';
import type { Task } from './tasks';

type Recurrence = NonNullable<Task['recurrence']>;
export type QuickAdd = { title: string; time: string | null; date: Date | null; recurrence: Recurrence | null; matched: string[] };

// \b doesn't work for Cyrillic, so word edges are spelled out
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const WD = '(пн|вт|ср|чт|пт|сб|вс|понедельник\\p{L}*|вторник\\p{L}*|сред[ауы]|четверг\\p{L}*|пятниц\\p{L}*|суббот\\p{L}*|воскресень\\p{L}*)';
const WD_STEMS: [string, number][] = [['пн', 1], ['пон', 1], ['вт', 2], ['ср', 3], ['чт', 4], ['чет', 4], ['пт', 5], ['пят', 5], ['сб', 6], ['суб', 6], ['вс', 0], ['вос', 0]];
const weekday = (w: string) => WD_STEMS.find(([s]) => w.toLowerCase().startsWith(s))![1];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const re = (src: string) => new RegExp(src, 'iu');

/** Next date (today included) that falls on this weekday */
const nextWeekday = (day: number, today: Date) => addDays(today, (day - today.getDay() + 7) % 7);

/** A day/month without a year means the nearest one that isn't in the past */
const upcoming = (d: number, m: number, y: number | null, today: Date) => {
  const date = new Date(y ?? today.getFullYear(), m, d);
  if (date.getMonth() !== m) return null; // 31.02 and the like
  return y === null && date < today ? new Date(today.getFullYear() + 1, m, d) : date;
};

/**
 * Quick add in plain Russian, no AI: "завтра 10:00 созвон", "пт отчёт", "30.10 сдать",
 * "каждый вт 11:00 отзывы", "каждое 16 число собака", "в конце месяца счётчик".
 */
export function parseQuickAdd(text: string, today = startOfToday()): QuickAdd {
  let rest = ` ${text} `;
  const matched: string[] = [];
  let time: string | null = null;
  let date: Date | null = null;
  let recurrence: Recurrence | null = null;

  // Each rule cuts what it understood out of the text, so the rest becomes the title
  const take = (pattern: string, use: (m: RegExpMatchArray) => boolean | void) => {
    const m = rest.match(re(pattern));
    if (!m || use(m) === false) return;
    matched.push(m[0].trim());
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index! + m[0].length);
  };

  take(`${B}(?:каждый|каждую|каждое|каждые|по)\\s+${WD}((?:\\s*(?:,|и)\\s*${WD})*)${E}`, (m) => {
    const days = [m[1], ...[...m[2].matchAll(new RegExp(WD, 'giu'))].map((x) => x[1])];
    recurrence = { type: 'weekly', daysOfWeek: [...new Set(days.map(weekday))] };
  });
  if (!recurrence) take(`${B}(?:каждый\\s+день|ежедневно)${E}`, () => { recurrence = { type: 'daily', daysOfWeek: [] }; });
  if (!recurrence) take(`${B}(?:каждый\\s+|в\\s+)?(?:последний\\s+день\\s+месяца|конец\\s+месяца|конце\\s+месяца)${E}`, () => { recurrence = { type: 'monthly', daysOfWeek: [], dayOfMonth: 31 }; });
  if (!recurrence) take(`${B}(?:каждое|каждый\\s+месяц|ежемесячно)\\s+(\\d{1,2})(?:-?(?:е|го))?(?:\\s+числ\\p{L}*)?${E}`, (m) => {
    const day = Number(m[1]);
    if (day < 1 || day > 31) return false;
    recurrence = { type: 'monthly', daysOfWeek: [], dayOfMonth: day };
  });

  take(`${B}(?:в\\s+)?([01]?\\d|2[0-3]):([0-5]\\d)${E}`, (m) => { time = `${m[1].padStart(2, '0')}:${m[2]}`; });

  if (!recurrence) {
    take(`${B}(?:на\\s+)?(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{4}|\\d{2}))?${E}`, (m) => {
      const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
      date = upcoming(Number(m[1]), Number(m[2]) - 1, y, today);
      if (!date) return false;
    });
    if (!date) take(`${B}(?:на\\s+)?(\\d{1,2})\\s+(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)\\p{L}*${E}`, (m) => {
      date = upcoming(Number(m[1]), MONTHS.findIndex((s) => m[2].toLowerCase().startsWith(s)), null, today);
      if (!date) return false;
    });
    if (!date) take(`${B}(?:на\\s+)?(сегодня|завтра|послезавтра)${E}`, (m) => {
      date = addDays(today, { сегодня: 0, завтра: 1, послезавтра: 2 }[m[1].toLowerCase() as 'сегодня']);
    });
    if (!date) take(`${B}через\\s+(?:(\\d+)\\s+)?(день|дня|дней|неделю|недели|недель)${E}`, (m) => {
      const n = Number(m[1] || 1);
      date = m[2].startsWith('нед') ? addWeeks(today, n) : addDays(today, n);
    });
    if (!date) take(`${B}(?:(?:в|во|на)\\s+)?${WD}${E}`, (m) => { date = nextWeekday(weekday(m[1]), today); });
  }

  const title = rest.replace(/\s+/g, ' ').replace(/^[\s,.—–-]+|[\s,—–-]+$/g, '').trim();
  if (!title) return { title: text.trim(), time: null, date: null, recurrence: null, matched: [] };
  if (recurrence && time) (recurrence as Recurrence).time = time;
  return { title, time, date, recurrence, matched };
}

/** Next cohort for "Дублировать": "Бонусные материалы — ТО 66 поток" → "… ТО 67 поток" */
export const bumpCohort = (title: string) => title.replace(/(\d+)(-?й)?(\s+поток)/iu, (_, n, suffix = '', rest) => `${Number(n) + 1}${suffix}${rest}`);
