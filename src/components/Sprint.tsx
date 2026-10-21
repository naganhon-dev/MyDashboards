import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, isAfter, isSameDay, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '../lib/tasks';
import { reportDraft, sprintOf, sprintReport, type SprintLine } from '../lib/sprint';
import { useStoredState } from './brand';
import { fieldClass } from './TaskDialog';

type Props = { tasks: Task[]; onOpen: (task: Task) => void; onCopied: () => void };

function List({ title, tone, items, empty, onOpen }: { title: string; tone: 'done' | 'missed' | 'next'; items: SprintLine[]; empty: string; onOpen: Props['onOpen'] }) {
  const dot = { done: 'bg-accent-2', missed: 'bg-rust', next: 'bg-line-2' }[tone];
  return (
    <section className="card flex min-w-0 flex-col p-5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-faint">
        {title} <span className="rounded-full bg-track px-2 py-0.5 text-xs text-ink-2">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[14px] text-faint">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {items.map(({ task, count }) => (
            <li key={task.id}>
              <button onClick={() => onOpen(task)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-1.5 text-left text-[14px] hover:bg-track">
                <span className={cn('size-2 shrink-0 rounded-full', dot)} />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {count > 1 && <span className="shrink-0 text-[12px] font-medium text-faint">×{count}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Sprint({ tasks, onOpen, onCopied }: Props) {
  const [shift, setShift] = useState(0);
  const [header, setHeader] = useStoredState<string>('planner.sprintHeader', '@Faleksei  по спринту:');
  const [copied, setCopied] = useState(false);
  const today = startOfToday();
  const sprint = sprintOf(today, shift);
  const report = useMemo(() => sprintReport(tasks, sprint), [tasks, sprint.start.getTime()]);
  const draft = reportDraft(header, report);

  const day = Math.min(14, Math.max(0, differenceInCalendarDays(today, sprint.start) + 1));
  const toReport = differenceInCalendarDays(sprint.report, today);
  const due = isSameDay(sprint.report, today) ? 'отчёт сегодня' : toReport > 0 ? `до отчёта ${toReport} ${toReport === 1 ? 'день' : toReport < 5 ? 'дня' : 'дней'}` : isAfter(today, sprint.end) ? 'спринт закрыт' : 'отчёт сдан';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      onCopied();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (iframe, old browser): select the text so Ctrl+C works
      (document.getElementById('sprint-draft') as HTMLTextAreaElement | null)?.select();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-2xl font-semibold">Спринт</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {format(sprint.start, 'd MMMM', { locale: ru })} — {format(sprint.end, 'd MMMM', { locale: ru })} · отчёт в пятницу, {format(sprint.report, 'd MMMM', { locale: ru })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShift(shift - 1)} aria-label="Прошлый спринт" className="grid size-10 place-items-center rounded-xl hover:bg-paper"><ChevronLeft className="size-5" /></button>
          <button onClick={() => setShift(0)} disabled={shift === 0} className="h-10 rounded-xl border border-line-2 bg-paper px-3.5 text-[14px] font-medium hover:border-accent-2 disabled:opacity-50">Текущий</button>
          <button onClick={() => setShift(shift + 1)} aria-label="Следующий спринт" className="grid size-10 place-items-center rounded-xl hover:bg-paper"><ChevronRight className="size-5" /></button>
        </div>
      </header>

      {shift === 0 && (
        <div className="card flex items-center gap-4 p-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={14} aria-valuenow={day} aria-label="День спринта">
            <div className="route-gradient h-full rounded-full" style={{ width: `${(day / 14) * 100}%` }} />
          </div>
          <span className="shrink-0 text-[14px] font-medium">День {day} из 14 · {due}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <List title="Сделано" tone="done" items={report.done} empty="Пока ничего не отмечено." onOpen={onOpen} />
        <List title="Не сделано" tone="missed" items={report.missed} empty="Ничего не пропущено." onOpen={onOpen} />
        <List title="Следующий спринт" tone="next" items={report.planned} empty="На следующий спринт ничего не запланировано." onOpen={onOpen} />
      </div>

      <section className="card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-[13px] font-semibold uppercase tracking-wide text-faint">Черновик отчёта</h2>
          <button onClick={copy} className="route-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold text-white">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Скопировано' : 'Скопировать'}
          </button>
        </div>
        <input value={header} onChange={(e) => setHeader(e.target.value)} aria-label="Первая строка отчёта" className={cn(fieldClass, 'h-10 text-[14px]')} />
        <textarea id="sprint-draft" readOnly value={draft} rows={Math.min(24, draft.split('\n').length + 1)} className="w-full resize-y rounded-xl border border-line-2 bg-track/50 p-3 font-mono text-[13px] leading-relaxed outline-none" />
        <p className="text-[13px] text-faint">Список для отчёта: вставьте в сообщение и перепишите пункты своими словами.</p>
      </section>
    </div>
  );
}
