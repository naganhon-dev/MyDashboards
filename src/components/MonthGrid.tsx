import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfToday, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { isTaskCompletedOnDate, isTaskOnDate, taskTimeOn, type Task } from '../lib/tasks';

const MAX_CHIPS = 3;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Props = {
  month: Date;
  tasks: Task[];
  onPickDay: (day: Date) => void;
  onOpen: (task: Task, date: Date) => void;
};

export default function MonthGrid({ month, tasks, onPickDay, onOpen }: Props) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const today = startOfToday();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-paper">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2.5 text-center text-xs font-medium uppercase tracking-wide text-faint">{d}</div>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {days.map((day) => {
          // Untimed first, then by time — same order as the day view
          const items = tasks
            .filter((t) => isTaskOnDate(t, day))
            .map((t) => ({ task: t, time: taskTimeOn(t, day), done: isTaskCompletedOnDate(t, day) }))
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          const missed = day < today && items.some((i) => !i.done);
          const inMonth = isSameMonth(day, month);
          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onPickDay(day)}
              onKeyDown={(e) => e.key === 'Enter' && onPickDay(day)}
              aria-label={`${format(day, 'd MMMM', { locale: ru })}: задач ${items.length}`}
              className={cn('flex min-h-20 min-w-0 cursor-pointer flex-col gap-1 border-b border-l border-line p-1.5 transition hover:bg-track/60 [&:nth-child(7n+1)]:border-l-0', !inMonth && 'bg-ground/50')}
            >
              <div className="flex items-center gap-1">
                <span className={cn('grid size-7 place-items-center rounded-full font-display text-[13px] font-semibold', isToday(day) ? 'route-gradient text-white' : inMonth ? 'text-ink' : 'text-faint')}>
                  {format(day, 'd')}
                </span>
                {missed && <span className="hidden size-1.5 rounded-full bg-rust sm:block" aria-label="Есть несделанное" />}
              </div>
              {/* Phones: a cell is too narrow for titles, dots show how busy the day is */}
              <div className="flex gap-0.5 px-1 sm:hidden" aria-hidden>
                {missed && <span className="size-1.5 rounded-full bg-rust" />}
                {items.slice(0, missed ? 2 : 3).map(({ task }) => <span key={task.id} className="size-1.5 rounded-full bg-accent-2" />)}
              </div>
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {items.slice(0, MAX_CHIPS).map(({ task, time, done }) => (
                  <button
                    key={task.id}
                    onClick={(e) => { e.stopPropagation(); onOpen(task, day); }}
                    className={cn('flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[12px] hover:bg-accent-wash', done ? 'text-faint line-through' : 'text-ink')}
                  >
                    <span className={cn('size-1.5 shrink-0 rounded-full', done ? 'bg-line-2' : task.priority === 'high' ? 'bg-rust' : 'bg-accent-2')} />
                    {time && <span className="shrink-0 text-faint">{time}</span>}
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
                {items.length > MAX_CHIPS && <span className="px-1.5 text-xs font-medium text-accent-text">ещё {items.length - MAX_CHIPS}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
