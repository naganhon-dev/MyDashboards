import { useEffect, useRef, useState } from 'react';
import { format, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTaskCompletedOnDate, isTaskOnDate, taskTimeOn, type Task } from '../lib/tasks';

const HOUR_PX = 52;
const BLOCK_PX = 46;
const ROW_PX = 26;
const DAY_START = 7;

type Props = {
  days: Date[];
  tasks: Task[];
  onToggle: (task: Task, date: Date) => void;
  onOpen: (task: Task, date: Date) => void;
  onCreateAt: (day: Date, time: string | null) => void;
};

const priorityBar = { high: 'bg-rust', medium: 'bg-accent-2', low: 'bg-line-2' } as const;

function Tick({ task, day, done, onToggle }: { task: Task; day: Date; done: boolean; onToggle: Props['onToggle'] }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(task, day); }}
      aria-label={done ? `Вернуть «${task.title}» в работу` : `Отметить «${task.title}» выполненной`}
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-md border-[1.5px] transition-colors',
        done ? 'border-accent-2 bg-accent-2 text-white' : 'border-control bg-paper hover:border-accent-2'
      )}
    >
      {done && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}

function TaskBlock({ task, day, time, compact, wrap, onToggle, onOpen }: { task: Task; day: Date; time: string | null; compact?: boolean; wrap?: boolean } & Pick<Props, 'onToggle' | 'onOpen'>) {
  const done = isTaskCompletedOnDate(task, day);
  const repeating = !!(task.recurrence && task.recurrence.type !== 'none');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onOpen(task, day); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task, day); }}
      className={cn(
        'group relative flex h-full min-w-0 cursor-pointer gap-2 overflow-hidden rounded-xl border border-line bg-paper pl-3 pr-2 text-left shadow-[0_1px_2px_rgba(29,26,38,0.06)] transition hover:border-accent-1 hover:shadow-md',
        compact && !wrap ? 'items-center py-0.5' : 'items-start py-1.5',
        done && 'bg-track opacity-70'
      )}
    >
      <span className={cn('absolute inset-y-1.5 left-1 w-[3px] rounded-full', done ? 'bg-line-2' : priorityBar[task.priority])} />
      <Tick task={task} day={day} done={done} onToggle={onToggle} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={cn('text-[13px] font-medium', wrap ? 'line-clamp-2 break-words' : 'truncate', done && 'text-faint line-through')} title={task.title}>{task.title}</div>
        {!compact && (time || repeating) && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-faint">
            {time}
            {repeating && <Repeat className="size-3" aria-label="Повторяется" />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TimeGrid({ days, tasks, onToggle, onOpen, onCreateAt }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const single = days.length === 1;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const columns = days.map((day) => {
    const onDay = tasks.filter((t) => isTaskOnDate(t, day));
    const untimed = onDay.filter((t) => !taskTimeOn(t, day));
    const timed = onDay
      .map((t) => ({ task: t, time: taskTimeOn(t, day)! }))
      .filter((x) => x.time)
      .sort((a, b) => a.time.localeCompare(b.time));
    // Tasks in the same hour stack as thin full-width rows (side by side was unreadable in a week column)
    const byHour = new Map<string, typeof timed>();
    for (const x of timed) byHour.set(x.time.slice(0, 2), [...(byHour.get(x.time.slice(0, 2)) || []), x]);
    return { day, untimed, timed, byHour };
  });

  // Nights are empty for most people: start at 7:00 unless a task is earlier
  const first = Math.min(DAY_START, ...columns.flatMap((c) => c.timed.map((x) => Number(x.time.slice(0, 2)))));
  const hours = Array.from({ length: 24 - first }, (_, i) => first + i);
  const y = (h: number, m = 0) => (h - first + m / 60) * HOUR_PX;

  // Today opens an hour before now; other days open at the top (7:00)
  useEffect(() => {
    const today = days.some((d) => isToday(d));
    scroller.current?.scrollTo({ top: today ? Math.max(0, y(new Date().getHours() - 1)) : 0 });
  }, [days[0]?.getTime()]);

  const gridCols = { gridTemplateColumns: `3.75rem repeat(${days.length}, minmax(0, 1fr))` };
  const hasUntimed = columns.some((c) => c.untimed.length > 0);

  return (
    <div ref={scroller} className="relative min-h-64 flex-1 overflow-y-auto overscroll-contain rounded-3xl border border-line bg-paper">
      <div className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        {!single && (
          <div className="grid" style={gridCols}>
            <div />
            {days.map((day) => (
              <div key={day.toISOString()} className="flex flex-col items-center gap-0.5 py-2.5">
                <span className={cn('text-xs font-medium uppercase tracking-wide', isToday(day) ? 'text-accent-text' : 'text-faint')}>
                  {format(day, 'EEEEEE', { locale: ru })}
                </span>
                <span className={cn('grid size-8 place-items-center rounded-full font-display text-[15px] font-semibold', isToday(day) ? 'route-gradient text-white' : 'text-ink')}>
                  {format(day, 'd')}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="grid border-t border-line first:border-t-0" style={gridCols}>
          <div className="px-1 py-2 text-right text-xs leading-tight text-faint">без<br />времени</div>
          {columns.map(({ day, untimed }) => (
            <div
              key={day.toISOString()}
              onClick={() => onCreateAt(day, null)}
              className={cn('flex min-h-11 cursor-pointer flex-col gap-1 border-l border-line p-1 hover:bg-track/60', !hasUntimed && 'min-h-9')}
            >
              {untimed.map((t) => (
                <TaskBlock key={t.id} task={t} day={day} time={null} compact wrap onToggle={onToggle} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="relative grid" style={{ ...gridCols, height: hours.length * HOUR_PX }}>
        <div className="relative">
          {hours.map((h) => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-xs text-faint" style={{ top: y(h) }}>
              {h > first && `${String(h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>
        {columns.map(({ day, byHour }) => (
          <div
            key={day.toISOString()}
            className={cn('relative cursor-pointer border-l border-line', isToday(day) && !single && 'bg-accent-wash/60')}
            onClick={(e) => {
              const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
              onCreateAt(day, `${String(Math.min(23, first + Math.floor(offset / HOUR_PX))).padStart(2, '0')}:00`);
            }}
          >
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: y(h) }} />
            ))}
            {[...byHour.values()].flatMap((group) =>
              group.map(({ task, time }, i) => {
                const [h, m] = time.split(':').map(Number);
                const stacked = group.length > 1;
                return (
                  <div
                    key={task.id}
                    className="absolute inset-x-0 z-10 px-0.5"
                    style={{ top: y(h, m) + 2 + (stacked ? i * ROW_PX : 0), height: stacked ? ROW_PX - 2 : BLOCK_PX }}
                  >
                    <TaskBlock task={task} day={day} time={time} compact={stacked} onToggle={onToggle} onOpen={onOpen} />
                  </div>
                );
              })
            )}
            {isToday(day) && now.getHours() >= first && (
              <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: y(now.getHours(), now.getMinutes()) }}>
                <span className="-ml-1 size-2 rounded-full bg-rust" />
                <span className="h-[1.5px] flex-1 bg-rust" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
