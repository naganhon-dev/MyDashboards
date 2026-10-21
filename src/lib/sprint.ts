import { addDays, differenceInCalendarDays, eachDayOfInterval, isAfter, isWithinInterval, startOfToday } from 'date-fns';
import { isTaskCompletedOnDate, isTaskOnDate, type Task } from './tasks';

// Sprints are 14 days Monday→Sunday; the report is due on the Friday of week two (weekends are off)
export const SPRINT_ANCHOR = new Date(2026, 9, 19); // Mon 19.10.2026
const SPRINT_DAYS = 14;
const REPORT_OFFSET = 11;

export type Sprint = { start: Date; end: Date; report: Date };

export const sprintOf = (date: Date, shift = 0): Sprint => {
  const index = Math.floor(differenceInCalendarDays(date, SPRINT_ANCHOR) / SPRINT_DAYS) + shift;
  const start = addDays(SPRINT_ANCHOR, index * SPRINT_DAYS);
  return { start, end: addDays(start, SPRINT_DAYS - 1), report: addDays(start, REPORT_OFFSET) };
};

export type SprintLine = { task: Task; count: number };

const isRepeating = (t: Task) => !!(t.recurrence && t.recurrence.type !== 'none') || !!t.dueDates?.length;

/** Done, missed and next-sprint tasks for the report. Only days up to today count as done or missed. */
export function sprintReport(tasks: Task[], sprint: Sprint, today = startOfToday()) {
  const lastDay = isAfter(sprint.end, today) ? today : sprint.end;
  const past = isAfter(sprint.start, lastDay) ? [] : eachDayOfInterval({ start: sprint.start, end: lastDay });
  const range = { start: sprint.start, end: addDays(sprint.end, 1) };
  const next = sprintOf(sprint.start, 1);
  const nextDays = eachDayOfInterval({ start: next.start, end: next.end });

  const done: SprintLine[] = [];
  const missed: SprintLine[] = [];
  const planned: SprintLine[] = [];

  for (const task of tasks) {
    if (isRepeating(task)) {
      const doneCount = past.filter((d) => isTaskOnDate(task, d) && isTaskCompletedOnDate(task, d)).length;
      // Today isn't missed yet: it can still be done
      const missedCount = past.filter((d) => d < today && isTaskOnDate(task, d) && !isTaskCompletedOnDate(task, d)).length;
      if (doneCount) done.push({ task, count: doneCount });
      if (missedCount) missed.push({ task, count: missedCount });
    } else {
      // Tasks finished before completedAt existed fall back to their due date
      const when = (task.completedAt || task.dueDate)?.toDate();
      const due = task.dueDate?.toDate();
      if (task.status === 'done' && when && isWithinInterval(when, range)) done.push({ task, count: 1 });
      if (task.status !== 'done' && due && due < today && isWithinInterval(due, range)) missed.push({ task, count: 1 });
    }
    // Routines are the same every sprint, so "Фокус" lists only one-off and multi-date work
    const routine = !!(task.recurrence && task.recurrence.type !== 'none');
    if (!routine && task.status !== 'done' && nextDays.some((d) => isTaskOnDate(task, d) && !isTaskCompletedOnDate(task, d))) {
      if (task.dueDate || task.dueDates?.length) planned.push({ task, count: 1 });
    }
  }
  return { done, missed, planned, next };
}

const line = ({ task, count }: SprintLine) => `${task.title.trim()}${count > 1 ? ` (×${count})` : ''};`;

export const reportDraft = (header: string, r: ReturnType<typeof sprintReport>) =>
  [
    header.trim(),
    '',
    'Достижения:',
    '',
    ...(r.done.length ? r.done.map(line) : ['—']),
    '',
    'Проблемы:',
    '',
    ...(r.missed.length ? r.missed.map(line) : ['—']),
    '',
    'Фокус:',
    '',
    ...(r.planned.length ? r.planned.map(line) : ['—']),
  ].join('\n');
