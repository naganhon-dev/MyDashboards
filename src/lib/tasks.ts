import type { Timestamp } from 'firebase/firestore';
import { addDays, format, getDaysInMonth, isSameDay, startOfToday } from 'date-fns';

export interface Subtask {
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  userId: string;
  createdAt: Timestamp;
  dueDate?: Timestamp | null;
  dueDates?: Timestamp[];
  recurrence?: {
    type: 'none' | 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    dayOfMonth?: number; // 31 means "last day" in shorter months
    time?: string; // 'HH:mm'
  } | null;
  completedDates?: string[];
  completedAt?: Timestamp | null; // one-off tasks only; missing on tasks finished before 2026-10-21
  tags?: string[];
  subtasks?: Subtask[];
  workspace?: 'work' | 'personal';
}

const isRepeating = (task: Task) =>
  !!(task.recurrence && task.recurrence.type !== 'none') || !!(task.dueDates && task.dueDates.length > 0);

export const isTaskOnDate = (task: Task, date: Date) => {
  // 1. Check custom list of dates
  if (task.dueDates && task.dueDates.length > 0) {
    return task.dueDates.some(ts => isSameDay(ts.toDate(), date));
  }

  // 2. Check recurrence
  if (task.recurrence && task.recurrence.type && task.recurrence.type !== 'none') {
    const type = task.recurrence.type;

    const creationDate = task.createdAt ? task.createdAt.toDate() : new Date();
    const testDateStart = new Date(date);
    testDateStart.setHours(23, 59, 59, 999);
    if (testDateStart < creationDate) {
      return false;
    }

    if (type === 'daily') {
      return true;
    }
    if (type === 'weekly') {
      const dayOfWeek = date.getDay();
      if (task.recurrence.daysOfWeek && task.recurrence.daysOfWeek.length > 0) {
        return task.recurrence.daysOfWeek.includes(dayOfWeek);
      }
      const baseDate = task.dueDate ? task.dueDate.toDate() : creationDate;
      return baseDate.getDay() === dayOfWeek;
    }
    if (type === 'monthly') {
      const baseDate = task.dueDate ? task.dueDate.toDate() : creationDate;
      const day = task.recurrence.dayOfMonth || baseDate.getDate();
      return date.getDate() === Math.min(day, getDaysInMonth(date));
    }
  }

  // 3. Check single dueDate
  if (task.dueDate) {
    return isSameDay(task.dueDate.toDate(), date);
  }

  // 4. If no dates are set, show only on today
  return isSameDay(date, startOfToday());
};

export const isTaskCompletedOnDate = (task: Task, date: Date) => {
  if (isRepeating(task)) {
    return !!task.completedDates?.includes(format(date, 'yyyy-MM-dd'));
  }
  return task.status === 'done';
};

// shortcut: a dated task stored at 00:00 means "no time" (a real midnight task shows as untimed); add a hasTime flag if that ever matters
const NO_TIME = '00:00';

/** 'HH:mm' the task is due on this date, or null when it has no time */
export const taskTimeOn = (task: Task, date: Date): string | null => {
  if (task.recurrence && task.recurrence.type !== 'none' && !task.dueDates?.length) return task.recurrence.time || null;
  const due = task.dueDates?.length ? task.dueDates.find(ts => isSameDay(ts.toDate(), date))?.toDate() : task.dueDate?.toDate();
  const time = due ? format(due, 'HH:mm') : null;
  return time === NO_TIME ? null : time;
};

// shortcut: repeating tasks look back only this far, so a long-forgotten daily routine doesn't flood the list
export const MISSED_LOOKBACK_DAYS = 14;

/** Days before today on which the task was due and not done, newest first */
export const missedDates = (task: Task, today = startOfToday()): Date[] => {
  if (!isRepeating(task)) {
    const due = task.dueDate?.toDate();
    return due && due < today && task.status !== 'done' ? [due] : [];
  }
  const missed: Date[] = [];
  for (let i = 1; i <= MISSED_LOOKBACK_DAYS; i++) {
    const day = addDays(today, -i);
    if (isTaskOnDate(task, day) && !isTaskCompletedOnDate(task, day)) missed.push(day);
  }
  return missed;
};
