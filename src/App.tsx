/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { addDays, eachDayOfInterval, endOfWeek, format, isSameDay, isToday, startOfToday, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertCircle, BookOpen, CalendarDays, ChevronLeft, ChevronRight, LogOut, Plus, Search, StickyNote } from 'lucide-react';
import { db, auth } from './lib/firebase';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type Task, missedDates, parseQuickAdd } from './lib/tasks';
import { Logo, useMediaQuery, useStoredState } from './components/brand';
import TimeGrid from './components/TimeGrid';
import TaskDialog, { emptyTaskForm, fieldClass } from './components/TaskDialog';
import Inbox, { type Note } from './components/Inbox';
import KnowledgeBase, { type Algorithm } from './components/KnowledgeBase';

type Workspace = 'work' | 'personal';
type View = 'plan' | 'inbox' | 'kb';
type Owned<T> = T & { userId: string; createdAt: Timestamp; workspace?: Workspace };

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught error:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div className="card max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-3 size-8 text-rust" />
          <h1 className="font-display text-lg font-semibold">Что-то пошло не так</h1>
          <p className="mt-2 break-words font-mono text-xs text-faint">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="route-gradient mt-5 h-11 w-full rounded-xl font-semibold text-white">Перезагрузить</button>
        </div>
      </div>
    );
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function Login() {
  const [error, setError] = useState<string | null>(null);
  const login = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user') return;
      setError(e.code === 'auth/unauthorized-domain' ? 'Этот адрес не разрешён в Firebase для входа.' : 'Не удалось войти. Попробуйте ещё раз.');
    }
  };
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto w-fit"><Logo size={56} /></div>
        <h1 className="mt-5 font-display text-2xl font-semibold">Планер</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Задачи, рутины и заметки — чтобы ничего не проебать.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rust-wash p-3 text-sm text-rust-text">{error}</p>}
        <button onClick={login} className="route-gradient mt-6 h-12 w-full rounded-xl text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_var(--accent-2)]">Войти через Google</button>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [workspace, setWorkspace] = useStoredState<Workspace>('planner.workspace', 'work');
  const [view, setView] = useStoredState<View>('planner.view', 'plan');
  const [range, setRange] = useStoredState<'week' | 'day'>('planner.range', 'week');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [allTasks, setAllTasks] = useState<Owned<Task>[]>([]);
  const [allAlgorithms, setAllAlgorithms] = useState<Owned<Algorithm>[]>([]);
  const [allNotes, setAllNotes] = useState<Owned<Note>[]>([]);
  const inWs = <T extends { workspace?: Workspace }>(items: T[]) => items.filter((i) => (i.workspace || 'work') === workspace);
  const tasks = useMemo(() => inWs(allTasks), [allTasks, workspace]);
  const algorithms = useMemo(() => inWs(allAlgorithms), [allAlgorithms, workspace]);
  const notes = useMemo(() => inWs(allNotes), [allNotes, workspace]);

  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // Set when the open task form came from a note; the note is deleted once the task is saved
  const [convertingNoteId, setConvertingNoteId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.ws = workspace;
  }, [workspace]);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setIsAuthReady(true); }), []);

  const showError = (text: string) => setToast({ text });

  // --- Data ---
  useEffect(() => {
    if (!user) {
      setAllTasks([]); setAllAlgorithms([]); setAllNotes([]);
      return;
    }
    const watch = <T,>(name: string, set: (rows: T[]) => void) =>
      onSnapshot(
        query(collection(db, name), where('userId', '==', user.uid), orderBy('createdAt', 'desc')),
        (s) => set(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
        (err) => showError(`Не удалось загрузить данные: ${err.message}`)
      );
    const unsubs = [watch('tasks', setAllTasks), watch('algorithms', setAllAlgorithms), watch('notes', setAllNotes)];
    return () => unsubs.forEach((u) => u());
  }, [user?.uid]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // "N" jumps to quick add, like in most planners ("т" is the same key on a Russian layout)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!['n', 'т'].includes(e.key.toLowerCase())) return;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      e.preventDefault();
      setView('plan');
      setTimeout(() => quickAddRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tryWrite = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return true;
    } catch (e: any) {
      showError(`Не сохранилось: ${e?.message || 'нет связи'}. Попробуйте ещё раз.`);
      return false;
    }
  };

  // Deleting keeps a copy for a few seconds so "Отменить" can put the document back as it was
  const removeWithUndo = async (name: string, item: { id: string }, label: string) => {
    const { id, ...data } = item;
    if (await tryWrite(() => deleteDoc(doc(db, name, id)))) {
      setToast({ text: `${label} удалена`, undo: () => tryWrite(() => setDoc(doc(db, name, id), data)) });
    }
  };

  // --- Tasks ---
  const withTime = (date: Date, time: string) => {
    const d = new Date(date);
    const [h, m] = (time || '00:00').split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return Timestamp.fromDate(d);
  };

  const closeTaskDialog = () => {
    setIsTaskModalOpen(false);
    setEditingTaskId(null);
    setConvertingNoteId(null);
    setTaskForm(emptyTaskForm());
  };

  const saveTask = async () => {
    const f = taskForm;
    if (!f.title.trim() || !user) return;
    const taskData = {
      title: f.title.trim(),
      description: f.description || '',
      priority: f.priority,
      tags: f.tags,
      subtasks: f.subtasks,
      dueDate: f.dateMode === 'single' && f.dueDate ? withTime(f.dueDate, f.dueTime) : null,
      dueDates: f.dateMode === 'multiple' ? f.dueDates.map((d) => withTime(d, f.dueTime)) : [],
      recurrence: f.dateMode === 'routine' && f.recurrenceType !== 'none'
        ? {
            type: f.recurrenceType,
            daysOfWeek: f.recurrenceType === 'weekly' ? f.recurrenceDays : [],
            ...(f.recurrenceType === 'monthly' && { dayOfMonth: f.recurrenceDayOfMonth }),
            ...(f.dueTime && { time: f.dueTime }),
          }
        : null,
    };
    const ok = await tryWrite(async () => {
      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), { ...taskData, status: 'todo', userId: user.uid, createdAt: serverTimestamp(), workspace });
        if (convertingNoteId) await deleteDoc(doc(db, 'notes', convertingNoteId));
      }
    });
    if (ok) closeTaskDialog();
  };

  const openTask = (task: Task) => {
    const due = task.dueDate?.toDate();
    const time = task.recurrence?.time || (due ? format(due, 'HH:mm') : task.dueDates?.[0] ? format(task.dueDates[0].toDate(), 'HH:mm') : '');
    setTaskForm({
      ...emptyTaskForm(),
      title: task.title,
      description: task.description || '',
      dueDate: due,
      dueDates: task.dueDates?.map((ts) => ts.toDate()) || [],
      dateMode: task.recurrence && task.recurrence.type !== 'none' ? 'routine' : task.dueDates?.length ? 'multiple' : 'single',
      recurrenceType: task.recurrence?.type || 'none',
      recurrenceDays: task.recurrence?.daysOfWeek || [],
      recurrenceDayOfMonth: task.recurrence?.dayOfMonth || (due ?? task.createdAt?.toDate() ?? new Date()).getDate(),
      dueTime: time === '00:00' ? '' : time,
      priority: task.priority,
      tags: task.tags || [],
      subtasks: task.subtasks || [],
    });
    setEditingTaskId(task.id);
    setIsTaskModalOpen(true);
  };

  const createAt = (day: Date, time: string | null) => {
    setTaskForm({ ...emptyTaskForm(), dueDate: day, dueTime: time || '' });
    setEditingTaskId(null);
    setIsTaskModalOpen(true);
  };

  const quickAdd = async (text: string) => {
    if (!user) return false;
    const { title, time } = parseQuickAdd(text);
    return tryWrite(() => addDoc(collection(db, 'tasks'), {
      title: title.slice(0, 200), description: '', priority: 'medium', tags: [], subtasks: [],
      dueDate: withTime(selectedDate, time || ''), dueDates: [], recurrence: null,
      status: 'todo', userId: user.uid, createdAt: serverTimestamp(), workspace,
    }));
  };

  const toggleTask = (task: Task, date: Date) => {
    const repeating = !!(task.recurrence && task.recurrence.type !== 'none') || !!task.dueDates?.length;
    if (!repeating) return tryWrite(() => updateDoc(doc(db, 'tasks', task.id), { status: task.status === 'done' ? 'todo' : 'done' }));
    const key = format(date, 'yyyy-MM-dd');
    const list = task.completedDates || [];
    return tryWrite(() => updateDoc(doc(db, 'tasks', task.id), { completedDates: list.includes(key) ? list.filter((d) => d !== key) : [...list, key] }));
  };

  // --- Notes & knowledge base ---
  const addNote = (content: string) =>
    tryWrite(() => addDoc(collection(db, 'notes'), { content, userId: user!.uid, createdAt: serverTimestamp(), workspace })).then(() => {});

  const noteToTask = (note: Note) => {
    setTaskForm({ ...emptyTaskForm(), title: note.content.slice(0, 200), description: note.content.length > 200 ? note.content : '' });
    setConvertingNoteId(note.id);
    setEditingTaskId(null);
    setIsTaskModalOpen(true);
  };

  const saveAlgorithm = (id: string | null, title: string, content: string) =>
    tryWrite(() => id
      ? updateDoc(doc(db, 'algorithms', id), { title, content })
      : addDoc(collection(db, 'algorithms'), { title, content, userId: user!.uid, createdAt: serverTimestamp(), workspace })
    ).then(() => {});

  // --- Derived ---
  const missed = useMemo(() => tasks.map((task) => ({ task, dates: missedDates(task) })).filter((m) => m.dates.length > 0), [tasks]);
  const showWeek = isDesktop && range === 'week';
  const week = eachDayOfInterval({ start: startOfWeek(selectedDate, { weekStartsOn: 1 }), end: endOfWeek(selectedDate, { weekStartsOn: 1 }) });
  const days = showWeek ? week : [selectedDate];
  const step = (dir: 1 | -1) => setSelectedDate((d) => addDays(d, dir * (showWeek ? 7 : 1)));

  if (!isAuthReady) {
    return <div className="grid min-h-dvh place-items-center"><div className="animate-pulse"><Logo size={48} /></div></div>;
  }
  if (!user) return <Login />;

  const initials = (user.displayName || user.email || '?').split(/[\s@.]/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const nav: [View, string, typeof CalendarDays, number?][] = [
    ['plan', 'План', CalendarDays, missed.length || undefined],
    ['inbox', 'Заметки', StickyNote, notes.length || undefined],
    ['kb', 'База знаний', BookOpen],
  ];
  const search = <GlobalSearch tasks={tasks} notes={notes} algorithms={algorithms} onTask={(t) => { setView('plan'); openTask(t); }} onView={setView} />;

  const workspaceSwitch = (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1" role="radiogroup" aria-label="Пространство">
      {([['work', 'Работа'], ['personal', 'Личное']] as const).map(([ws, label]) => (
        <button
          key={ws}
          role="radio"
          aria-checked={workspace === ws}
          onClick={() => setWorkspace(ws)}
          className={cn('min-h-9 rounded-[9px] px-3 text-[13px] font-semibold transition', workspace === ws ? 'route-gradient text-white shadow-sm' : 'text-muted-foreground hover:text-ink')}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const account = (
    <Popover>
      <PopoverTrigger render={
        <button aria-label="Аккаунт" className="flex min-h-11 items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-track">
          {user.photoURL
            ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
            : <span className="grid size-8 place-items-center rounded-full bg-accent-wash text-xs font-bold text-accent-text">{initials}</span>}
          <span className="hidden max-w-36 truncate text-[13px] font-semibold lg:block">{user.displayName || user.email}</span>
        </button>
      } />
      <PopoverContent className="w-56 p-2">
        <p className="truncate px-2 py-1.5 text-xs text-faint">{user.email}</p>
        <button onClick={() => signOut(auth)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-track">
          <LogOut className="size-4" /> Выйти
        </button>
      </PopoverContent>
    </Popover>
  );

  return (
    // The plan fills the screen exactly, so only the time grid scrolls
    <div className={cn('flex min-h-dvh flex-col lg:flex-row', view === 'plan' && 'h-dvh')}>
      {/* Desktop sidebar */}
      <nav aria-label="Главное меню" className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col gap-1 px-5 py-7 lg:flex">
        <div className="flex items-center gap-3 px-2 pb-6">
          <Logo />
          <span className="font-display text-[17px] font-semibold">Планер</span>
        </div>
        <div className="flex flex-col gap-3 pb-5">
          {workspaceSwitch}
          {search}
        </div>
        {nav.map(([v, label, Icon, badge]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-current={view === v ? 'page' : undefined}
            className={cn('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px]', view === v ? 'bg-paper font-semibold text-ink shadow-sm' : 'text-ink-2 hover:bg-paper/60')}
          >
            <Icon className={cn('size-[18px]', view === v ? 'text-accent-text' : 'text-faint')} />
            {label}
            {badge && <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold', v === 'plan' ? 'bg-rust-wash text-rust-text' : 'bg-track text-faint')}>{badge}</span>}
          </button>
        ))}
        <div className="flex-1" />
        <p className="px-3 pb-3 text-xs leading-relaxed text-faint">
          <kbd className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-sans">N</kbd> — новая задача
        </p>
        {account}
      </nav>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-ground/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <Logo size={30} />
          <div className="flex-1">{workspaceSwitch}</div>
          {account}
        </div>
        <div className="mt-3">{search}</div>
      </header>

      <main className={cn('mx-auto flex w-full min-w-0 max-w-[1280px] flex-1 flex-col gap-5 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-6 lg:pt-8', view === 'plan' && 'min-h-0 gap-4 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]')}>
        {view === 'plan' && (
          <>
            <header className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h1 className="font-display text-2xl font-semibold first-letter:uppercase">
                  {showWeek ? format(selectedDate, 'LLLL yyyy', { locale: ru }) : isToday(selectedDate) ? 'Сегодня' : format(selectedDate, 'EEEE', { locale: ru })}
                </h1>
                {!showWeek && <p className="text-[15px] text-muted-foreground">{format(selectedDate, 'd MMMM yyyy', { locale: ru })}</p>}
              </div>
              {isDesktop && (
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
                  {([['week', 'Неделя'], ['day', 'День']] as const).map(([r, label]) => (
                    <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={cn('min-h-9 rounded-[9px] px-3 text-[13px] font-medium', range === r ? 'bg-paper shadow-sm' : 'text-muted-foreground')}>{label}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1">
                <button onClick={() => step(-1)} aria-label="Назад" className="grid size-10 place-items-center rounded-xl hover:bg-paper"><ChevronLeft className="size-5" /></button>
                <button onClick={() => setSelectedDate(startOfToday())} className="h-10 rounded-xl border border-line-2 bg-paper px-3.5 text-[14px] font-medium hover:border-accent-2">Сегодня</button>
                <button onClick={() => step(1)} aria-label="Вперёд" className="grid size-10 place-items-center rounded-xl hover:bg-paper"><ChevronRight className="size-5" /></button>
              </div>
            </header>

            {!showWeek && (
              <div className="grid grid-cols-7 gap-1">
                {week.map((d) => {
                  const selected = isSameDay(d, selectedDate);
                  const hadMiss = d < startOfToday() && missed.some(({ dates }) => dates.some((m) => isSameDay(m, d)));
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => setSelectedDate(d)}
                      aria-pressed={selected}
                      className={cn('flex flex-col items-center gap-1 rounded-2xl py-2', selected ? 'route-gradient text-white shadow-md' : 'hover:bg-paper')}
                    >
                      <span className={cn('text-[11px] font-medium uppercase', selected ? 'text-white/85' : isToday(d) ? 'text-accent-text' : 'text-faint')}>{format(d, 'EEEEEE', { locale: ru })}</span>
                      <span className="font-display text-[15px] font-semibold">{format(d, 'd')}</span>
                      <span className={cn('size-1.5 rounded-full', hadMiss ? (selected ? 'bg-white' : 'bg-rust') : 'bg-transparent')} />
                    </button>
                  );
                })}
              </div>
            )}

            <QuickAdd inputRef={quickAddRef} date={selectedDate} onAdd={quickAdd} onMore={() => createAt(selectedDate, null)} />

            {missed.length > 0 && (
              <section aria-label="Не сделано" className="rounded-3xl border border-rust/20 bg-rust-wash/60 p-4">
                <h2 className="flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-rust-text">
                  <AlertCircle className="size-4" /> Не сделано · {missed.length}
                </h2>
                <ul className="mt-2 grid max-h-[30dvh] gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {missed.map(({ task, dates }) => (
                    <li key={task.id} className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-2.5">
                      <button
                        onClick={() => toggleTask(task, dates[0])}
                        aria-label={`Отметить «${task.title}» за ${format(dates[0], 'd MMMM', { locale: ru })}`}
                        className="size-[18px] shrink-0 rounded-md border-[1.5px] border-rust/50 hover:border-rust hover:bg-rust-wash"
                      />
                      <button onClick={() => openTask(task)} className="min-w-0 flex-1 truncate text-left text-[14px] font-medium">{task.title}</button>
                      <button onClick={() => setSelectedDate(dates[0])} className="shrink-0 text-[12px] text-rust-text hover:underline">
                        {format(dates[0], 'd MMM', { locale: ru })}{dates.length > 1 && ` · ×${dates.length}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <TimeGrid days={days} tasks={tasks} onToggle={toggleTask} onOpen={openTask} onCreateAt={createAt} />
          </>
        )}

        {view === 'inbox' && <Inbox notes={notes} onAdd={addNote} onToTask={noteToTask} onDelete={(n) => removeWithUndo('notes', n, 'Заметка')} />}
        {view === 'kb' && <KnowledgeBase items={algorithms} onSave={saveAlgorithm} onDelete={(a) => removeWithUndo('algorithms', a, 'Запись')} />}
      </main>

      {/* Mobile bottom nav */}
      <nav aria-label="Разделы" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {nav.map(([v, label, Icon, badge]) => (
          <button key={v} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined} className={cn('relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', view === v ? 'text-accent-text' : 'text-faint')}>
            <Icon className="size-[22px]" />
            {label}
            {badge && v === 'plan' && <span className="absolute right-[calc(50%-22px)] top-2.5 size-2 rounded-full bg-rust" />}
          </button>
        ))}
      </nav>

      <TaskDialog
        open={isTaskModalOpen}
        onOpenChange={(open) => (open ? setIsTaskModalOpen(true) : closeTaskDialog())}
        form={taskForm}
        setForm={setTaskForm}
        isEditing={!!editingTaskId}
        onSubmit={saveTask}
        // Same form becomes a new task; completed dates are not part of the form, so the copy starts clean
        onDuplicate={() => setEditingTaskId(null)}
        onDelete={() => {
          const task = allTasks.find((t) => t.id === editingTaskId);
          closeTaskDialog();
          if (task) removeWithUndo('tasks', task, 'Задача');
        }}
      />

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-[14px] text-white shadow-xl lg:bottom-6">
          <span className="flex-1">{toast.text}</span>
          {toast.undo && (
            <button onClick={() => { toast.undo!(); setToast(null); }} className="rounded-lg px-2 py-1 font-semibold text-accent-1 hover:bg-white/10">Отменить</button>
          )}
        </div>
      )}
    </div>
  );
}

function QuickAdd({ inputRef, date, onAdd, onMore }: { inputRef: React.RefObject<HTMLInputElement | null>; date: Date; onAdd: (text: string) => Promise<boolean>; onMore: () => void }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim() && (await onAdd(text))) setText('');
      }}
      className="card flex items-center gap-2 p-2 pl-4"
    >
      <Plus className="size-5 shrink-0 text-accent-text" />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={220}
        aria-label={`Новая задача на ${format(date, 'd MMMM', { locale: ru })}`}
        placeholder={`Задача на ${isToday(date) ? 'сегодня' : format(date, 'd MMMM', { locale: ru })} — «14:30 созвон»`}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
      />
      <button type="button" onClick={onMore} className="h-10 shrink-0 rounded-xl px-3 text-[13px] font-medium text-muted-foreground hover:bg-track hover:text-ink">Подробнее</button>
    </form>
  );
}

// Tells same-named tasks apart in search results
const taskWhen = (t: Task) =>
  t.recurrence && t.recurrence.type !== 'none' ? 'повторяется'
  : t.dueDates?.length ? `${t.dueDates.length} дат`
  : t.status === 'done' ? 'выполнена'
  : t.dueDate ? format(t.dueDate.toDate(), 'd MMM yyyy', { locale: ru })
  : 'без даты';

function GlobalSearch({ tasks, notes, algorithms, onTask, onView }: { tasks: Task[]; notes: Note[]; algorithms: Algorithm[]; onTask: (t: Task) => void; onView: (v: View) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const has = (...s: (string | undefined)[]) => s.some((x) => x?.toLowerCase().includes(term));
  const results = term.length < 2 ? [] : [
    ...tasks.filter((t) => has(t.title, t.description)).map((t) => ({ key: `t${t.id}`, kind: `Задача · ${taskWhen(t)}`, text: t.title, go: () => onTask(t) })),
    ...notes.filter((n) => has(n.content)).map((n) => ({ key: `n${n.id}`, kind: 'Заметка', text: n.content, go: () => onView('inbox') })),
    ...algorithms.filter((a) => has(a.title, a.content)).map((a) => ({ key: `a${a.id}`, kind: 'База знаний', text: a.title, go: () => onView('kb') })),
  ].slice(0, 8);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} placeholder="Поиск" aria-label="Поиск по задачам, заметкам и базе знаний" className={cn(fieldClass, 'h-10 pl-9 text-[14px]')} />
      {term.length >= 2 && (
        <ul className="absolute inset-x-0 top-12 z-40 overflow-hidden rounded-2xl border border-line bg-paper shadow-lg">
          {results.length === 0 && <li className="px-3.5 py-3 text-[14px] text-faint">Ничего не нашлось</li>}
          {results.map((r) => (
            <li key={r.key}>
              <button onClick={() => { r.go(); setQ(''); }} className="block min-h-11 w-full px-3.5 py-2 text-left hover:bg-track">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-faint">{r.kind}</span>
                <span className="block truncate text-[14px]">{r.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
