import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarDays, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { Subtask } from '../lib/tasks';

export const emptyTaskForm = () => ({
  title: '',
  description: '',
  dueDate: undefined as Date | undefined,
  dueDates: [] as Date[],
  dateMode: 'single' as 'single' | 'multiple' | 'routine',
  recurrenceType: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
  recurrenceDays: [] as number[], // [0-6] where 0 is Sunday, 1 is Monday...
  recurrenceDayOfMonth: new Date().getDate(),
  dueTime: '', // '' = no time
  priority: 'medium' as 'low' | 'medium' | 'high',
  tags: [] as string[],
  subtasks: [] as Subtask[],
});
export type TaskForm = ReturnType<typeof emptyTaskForm>;

export const fieldClass = 'h-11 w-full rounded-xl border border-line-2 bg-paper px-3 text-[15px] outline-none transition focus:border-accent-2 focus:ring-3 focus:ring-accent-2/15';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
      {label}
      {children}
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-xl bg-track p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('min-h-9 rounded-[9px] px-2 text-[13px] font-medium transition', value === v ? 'bg-paper text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const WEEKDAYS: [number, string][] = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: TaskForm;
  setForm: (f: TaskForm) => void;
  isEditing: boolean;
  onSubmit: () => void;
  onDelete?: () => void;
};

export default function TaskDialog({ open, onOpenChange, form, setForm, isEditing, onSubmit, onDelete }: Props) {
  const set = (patch: Partial<TaskForm>) => setForm({ ...form, ...patch });
  const timeInput = (
    <Field label="Время">
      <div className="relative">
        <input type="time" className={fieldClass} value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} />
        {form.dueTime && (
          <button type="button" onClick={() => set({ dueTime: '' })} aria-label="Без времени" className="absolute right-9 top-1/2 -translate-y-1/2 rounded-md p-1 text-faint hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </div>
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-[520px]">
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="flex flex-col gap-5 p-6"
        >
          <DialogTitle className="font-display text-lg font-semibold">{isEditing ? 'Задача' : 'Новая задача'}</DialogTitle>

          <input
            autoFocus
            required
            maxLength={200}
            placeholder="Что нужно сделать"
            className="border-b border-line bg-transparent pb-2 text-xl font-semibold outline-none placeholder:text-faint focus:border-accent-2"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          <textarea
            placeholder="Заметки к задаче"
            maxLength={2000}
            className="min-h-[72px] w-full resize-y rounded-xl border border-line-2 bg-paper p-3 text-[15px] outline-none focus:border-accent-2"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />

          <Segmented
            value={form.dateMode}
            options={[['single', 'Один день'], ['multiple', 'Несколько дат'], ['routine', 'Повторять']]}
            onChange={(dateMode) => set({ dateMode, recurrenceType: dateMode === 'routine' && form.recurrenceType === 'none' ? 'daily' : form.recurrenceType })}
          />

          {form.dateMode === 'single' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дата">
                <Popover>
                  <PopoverTrigger render={
                    <button type="button" className={cn(fieldClass, 'flex items-center gap-2 text-left')}>
                      <CalendarDays className="size-4 text-faint" />
                      <span className={cn('truncate', !form.dueDate && 'text-faint')}>{form.dueDate ? format(form.dueDate, 'd MMMM', { locale: ru }) : 'Без даты'}</span>
                    </button>
                  } />
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={form.dueDate} onSelect={(d) => set({ dueDate: d })} locale={ru} /></PopoverContent>
                </Popover>
              </Field>
              {timeInput}
            </div>
          )}

          {form.dateMode === 'multiple' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Даты (${form.dueDates.length})`}>
                  <Popover>
                    <PopoverTrigger render={
                      <button type="button" className={cn(fieldClass, 'flex items-center gap-2 text-left')}>
                        <CalendarDays className="size-4 text-faint" /> Выбрать даты
                      </button>
                    } />
                    <PopoverContent className="w-auto p-0"><Calendar mode="multiple" selected={form.dueDates} onSelect={(d) => set({ dueDates: (d as Date[]) || [] })} locale={ru} /></PopoverContent>
                  </Popover>
                </Field>
                {timeInput}
              </div>
              {form.dueDates.length > 0 && (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {[...form.dueDates].sort((a, b) => a.getTime() - b.getTime()).map((d) => (
                    <span key={d.toISOString()} className="inline-flex items-center gap-1 rounded-lg bg-track px-2 py-1 text-xs">
                      {format(d, 'd MMM yyyy', { locale: ru })}
                      <button type="button" aria-label="Убрать дату" onClick={() => set({ dueDates: form.dueDates.filter((x) => x !== d) })} className="text-faint hover:text-rust"><X className="size-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.dateMode === 'routine' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Как часто">
                  <select className={fieldClass} value={form.recurrenceType} onChange={(e) => set({ recurrenceType: e.target.value as TaskForm['recurrenceType'] })}>
                    <option value="daily">Каждый день</option>
                    <option value="weekly">По дням недели</option>
                    <option value="monthly">Каждый месяц</option>
                  </select>
                </Field>
                {timeInput}
              </div>
              {form.recurrenceType === 'monthly' && (
                <Field label="Число месяца">
                  <select className={fieldClass} value={form.recurrenceDayOfMonth} onChange={(e) => set({ recurrenceDayOfMonth: Number(e.target.value) })}>
                    {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}-е</option>)}
                    <option value={31}>Последний день месяца</option>
                  </select>
                </Field>
              )}
              {form.recurrenceType === 'weekly' && (
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map(([day, label]) => {
                    const on = form.recurrenceDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ recurrenceDays: on ? form.recurrenceDays.filter((d) => d !== day) : [...form.recurrenceDays, day] })}
                        className={cn('h-10 rounded-xl text-[13px] font-medium transition', on ? 'route-gradient text-white' : 'bg-track text-ink-2 hover:bg-wash')}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Field label="Приоритет">
            <Segmented value={form.priority} options={[['low', 'Низкий'], ['medium', 'Обычный'], ['high', 'Высокий']]} onChange={(priority) => set({ priority })} />
          </Field>

          {form.subtasks.length > 0 && (
            <Field label="Подзадачи">
              <ul className="flex flex-col gap-1 rounded-xl bg-track p-3 text-sm font-normal">
                {form.subtasks.map((st, i) => <li key={i}>• {st.title}</li>)}
              </ul>
            </Field>
          )}

          <div className="flex items-center gap-2 pt-1">
            {isEditing && onDelete && (
              <button type="button" onClick={onDelete} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-medium text-rust hover:bg-rust-wash">
                <Trash2 className="size-4" /> Удалить
              </button>
            )}
            <div className="flex-1" />
            <button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-4 text-[15px] font-medium text-ink-2 hover:bg-track">Отмена</button>
            <button type="submit" className="route-gradient h-11 rounded-xl px-5 text-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_var(--accent-2)] transition hover:brightness-105">Сохранить</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
