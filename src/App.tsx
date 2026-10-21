/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  serverTimestamp,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Mic,
  MicOff,
  MessageSquare,
  Send,
  AlertCircle,
  Moon,
  Sun,
  Menu,
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  BookOpen, 
  LayoutDashboard, 
  LogOut, 
  LogIn,
  Clock,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  StickyNote,
  X,
  Tag as TagIcon,
  BrainCircuit,
  Pencil,
  Copy,
  ListTodo,
  Repeat
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format, addDays, startOfToday, isSameDay, eachDayOfInterval, isToday, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { type Subtask, type Task, isTaskOnDate, isTaskCompletedOnDate, missedDates } from './lib/tasks';

// --- Types ---

interface Algorithm {
  id: string;
  title: string;
  content: string;
  userId: string;
  createdAt: Timestamp;
  tags?: string[];
  workspace?: 'work' | 'personal';
}

interface Note {
  id: string;
  content: string;
  userId: string;
  createdAt: Timestamp;
  workspace?: 'work' | 'personal';
}

const emptyTaskForm = () => ({
  title: '',
  description: '',
  dueDate: undefined as Date | undefined,
  dueDates: [] as Date[],
  dateMode: 'single' as 'single' | 'multiple' | 'routine',
  recurrenceType: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
  recurrenceDays: [] as number[], // [0-6] where 0 is Sunday, 1 is Monday...
  recurrenceDayOfMonth: new Date().getDate(),
  dueTime: '12:00',
  priority: 'medium' as 'low' | 'medium' | 'high',
  tags: [] as string[],
  subtasks: [] as Subtask[]
});

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-swamp-50 p-4 text-center">
          <Card className="max-w-md border-red-200">
            <CardHeader>
              <div className="mx-auto bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mb-2">
                <AlertCircle className="text-red-600 w-6 h-6" />
              </div>
              <CardTitle className="text-red-600">Что-то пошло не так</CardTitle>
              <CardDescription>Приложение столкнулось с неожиданной ошибкой.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-swamp-100 p-3 rounded text-xs font-mono text-left overflow-auto max-h-40">
                {this.state.error?.message}
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => window.location.reload()} className="w-full">Перезагрузить страницу</Button>
            </CardFooter>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<'work' | 'personal'>('work');
  
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allAlgorithms, setAllAlgorithms] = useState<Algorithm[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);

  const tasks = useMemo(() => allTasks.filter(t => (t.workspace || 'work') === activeWorkspace), [allTasks, activeWorkspace]);
  const algorithms = useMemo(() => allAlgorithms.filter(a => (a.workspace || 'work') === activeWorkspace), [allAlgorithms, activeWorkspace]);
  const notes = useMemo(() => allNotes.filter(n => (n.workspace || 'work') === activeWorkspace), [allNotes, activeWorkspace]);
  
  // UI states
  const [activeTab, setActiveTab] = useState('tasks');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [searchQuery, setSearchQuery] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') || 
             window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  const [isRecording, setIsRecording] = useState(false);

  const activeUid = user?.uid || null;
  const isResolvingUser = !isAuthReady;

  // Error Handler
  const handleFirestoreError = (error: any, operationType: string, path: string | null) => {
    const errInfo = {
      error: error?.message || String(error),
      operationType,
      path,
      userId: auth.currentUser?.uid,
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
  };

  const handleLogout = () => signOut(auth);

  // Theme effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  
  // Form states
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // Set when the open task form came from a note; the note is deleted once the task is saved
  const [convertingNoteId, setConvertingNoteId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  
  const [newAlgoTitle, setNewAlgoTitle] = useState('');
  const [newAlgoContent, setNewAlgoContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  
  const [editingAlgoId, setEditingAlgoId] = useState<string | null>(null);
  const [editAlgoTitle, setEditAlgoTitle] = useState('');
  const [editAlgoContent, setEditAlgoContent] = useState('');

  // Weekly Calendar
  const currentWeekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const handlePrevWeek = () => setSelectedDate(prev => subWeeks(prev, 1));
  const handleNextWeek = () => setSelectedDate(prev => addWeeks(prev, 1));
  const handleToday = () => setSelectedDate(startOfToday());

  // --- Auth ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to prevent auto-closing if there's a session conflict
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError(`Домен не авторизован в Firebase. Добавьте ваш URL в консоль Firebase.`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Ignore this one, user just closed it
      } else {
        setLoginError(`Ошибка входа: ${error.message}`);
      }
    }
  };

  // --- Data Fetching ---

  useEffect(() => {
    // Determine which UID to use for data fetching
    const currentUid = activeUid;

    if (isResolvingUser) return;

    if (!currentUid) {
      setAllTasks([]);
      setAllAlgorithms([]);
      setAllNotes([]);
      return;
    }

    const unsubTasks = onSnapshot(query(collection(db, 'tasks'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')), (s) => {
      setAllTasks(s.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    }, (err) => handleFirestoreError(err, 'LIST', 'tasks'));

    const unsubAlgos = onSnapshot(query(collection(db, 'algorithms'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')), (s) => {
      setAllAlgorithms(s.docs.map(d => ({ id: d.id, ...d.data() } as Algorithm)));
    }, (err) => handleFirestoreError(err, 'LIST', 'algorithms'));

    const unsubNotes = onSnapshot(query(collection(db, 'notes'), where('userId', '==', currentUid), orderBy('createdAt', 'desc')), (s) => {
      setAllNotes(s.docs.map(d => ({ id: d.id, ...d.data() } as Note)));
    }, (err) => handleFirestoreError(err, 'LIST', 'notes'));

    return () => { unsubTasks(); unsubAlgos(); unsubNotes(); };
  }, [activeUid, isResolvingUser]);

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Ваш браузер не поддерживает голосовой ввод.");
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim() && activeUid) {
        try {
          await addDoc(collection(db, 'notes'), {
            content: transcript,
            userId: activeUid,
            createdAt: serverTimestamp(),
            workspace: activeWorkspace,
          });
        } catch (error) {
          handleFirestoreError(error, 'WRITE', 'notes');
        }
      }
    };
    recognition.start();
  };

  // --- Linking Actions ---


  // --- CRUD Actions ---

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !activeUid) return;
    try {
      let finalDueDate: Timestamp | null = null;
      if (taskForm.dateMode === 'single' && taskForm.dueDate) {
        const d = new Date(taskForm.dueDate);
        if (taskForm.dueTime) {
          const [hours, minutes] = taskForm.dueTime.split(':');
          if (hours && minutes) {
            d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
          }
        }
        finalDueDate = Timestamp.fromDate(d);
      }

      let finalDueDates: Timestamp[] = [];
      if (taskForm.dateMode === 'multiple' && taskForm.dueDates && taskForm.dueDates.length > 0) {
        finalDueDates = taskForm.dueDates.map(dDate => {
          const d = new Date(dDate);
          if (taskForm.dueTime) {
            const [hours, minutes] = taskForm.dueTime.split(':');
            if (hours && minutes) {
              d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
            }
          }
          return Timestamp.fromDate(d);
        });
      }

      let finalRecurrence = null;
      if (taskForm.dateMode === 'routine' && taskForm.recurrenceType !== 'none') {
        finalRecurrence = {
          type: taskForm.recurrenceType,
          daysOfWeek: taskForm.recurrenceType === 'weekly' ? taskForm.recurrenceDays : [],
          ...(taskForm.recurrenceType === 'monthly' && { dayOfMonth: taskForm.recurrenceDayOfMonth }),
          time: taskForm.dueTime,
        };
      }

      const taskData = {
        title: taskForm.title,
        description: taskForm.description || '',
        priority: taskForm.priority,
        tags: taskForm.tags || [],
        subtasks: taskForm.subtasks || [],
        dueDate: finalDueDate,
        dueDates: finalDueDates,
        recurrence: finalRecurrence,
      };

      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          status: 'todo',
          userId: activeUid,
          createdAt: serverTimestamp(),
          workspace: activeWorkspace,
        });
        if (convertingNoteId) await deleteDoc(doc(db, 'notes', convertingNoteId));
      }
      setTaskForm(emptyTaskForm());
      setEditingTaskId(null);
      setConvertingNoteId(null);
      setIsTaskModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingTaskId ? 'UPDATE' : 'WRITE', 'tasks');
    }
  };

  // asCopy opens the same form but saves a new task (for "Дублировать")
  const startEditingTask = (task: Task, asCopy = false) => {
    let dDate: Date | undefined = undefined;
    let dTime = task.recurrence?.time || '12:00';
    if (task.dueDate) {
      dDate = task.dueDate.toDate();
      dTime = format(dDate, 'HH:mm');
    }
    const dDates = task.dueDates ? task.dueDates.map(ts => ts.toDate()) : [];
    const dMode = task.recurrence && task.recurrence.type !== 'none'
      ? 'routine'
      : (task.dueDates && task.dueDates.length > 0 ? 'multiple' : 'single');

    setTaskForm({
      title: task.title,
      description: task.description || '',
      dueDate: dDate,
      dueDates: dDates,
      dateMode: dMode,
      recurrenceType: task.recurrence?.type || 'none',
      recurrenceDays: task.recurrence?.daysOfWeek || [],
      recurrenceDayOfMonth: task.recurrence?.dayOfMonth || (dDate ?? task.createdAt?.toDate() ?? new Date()).getDate(),
      dueTime: dTime,
      priority: task.priority,
      tags: task.tags || [],
      subtasks: task.subtasks || []
    });
    setEditingTaskId(asCopy ? null : task.id);
    setIsTaskModalOpen(true);
  };

  // Opens the new-task form prefilled from a note; a long note keeps its full text in the description
  const startNoteToTask = (note: Note) => {
    setTaskForm({ ...emptyTaskForm(), title: note.content.slice(0, 200), description: note.content.length > 200 ? note.content : '' });
    setConvertingNoteId(note.id);
    setActiveTab('tasks');
    setIsTaskModalOpen(true);
  };

  const toggleTaskStatus = async (task: Task, date: Date = selectedDate) => {
    const isRecurringOrMulti = !!(task.recurrence && task.recurrence.type !== 'none') || !!(task.dueDates && task.dueDates.length > 0);
    try {
      if (isRecurringOrMulti) {
        const dateStr = format(date, 'yyyy-MM-dd');
        const completedList = task.completedDates || [];
        let newCompletedList: string[];
        if (completedList.includes(dateStr)) {
          newCompletedList = completedList.filter(d => d !== dateStr);
        } else {
          newCompletedList = [...completedList, dateStr];
        }
        await updateDoc(doc(db, 'tasks', task.id), { completedDates: newCompletedList });
      } else {
        await updateDoc(doc(db, 'tasks', task.id), { status: task.status === 'done' ? 'todo' : 'done' });
      }
    } catch (error) {
      handleFirestoreError(error, 'UPDATE', 'tasks');
    }
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !activeUid) return;
    try {
      await addDoc(collection(db, 'notes'), {
        content: newNoteContent,
        userId: activeUid,
        createdAt: serverTimestamp(),
        workspace: activeWorkspace,
      });
      setNewNoteContent('');
    } catch (error) {
      handleFirestoreError(error, 'WRITE', 'notes');
    }
  };

  const addAlgorithm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlgoTitle.trim() || !newAlgoContent.trim() || !activeUid) return;
    try {
      await addDoc(collection(db, 'algorithms'), {
        title: newAlgoTitle,
        content: newAlgoContent,
        userId: activeUid,
        createdAt: serverTimestamp(),
        workspace: activeWorkspace,
      });
      setNewAlgoTitle('');
      setNewAlgoContent('');
    } catch (error) {
      handleFirestoreError(error, 'WRITE', 'algorithms');
    }
  };

  const updateAlgorithm = async (id: string) => {
    if (!editAlgoTitle.trim() || !editAlgoContent.trim()) return;
    try {
      await updateDoc(doc(db, 'algorithms', id), {
        title: editAlgoTitle,
        content: editAlgoContent,
      });
      setEditingAlgoId(null);
    } catch (error) {
      handleFirestoreError(error, 'UPDATE', 'algorithms');
    }
  };

  const startEditingAlgo = (algo: Algorithm) => {
    setEditingAlgoId(algo.id);
    setEditAlgoTitle(algo.title);
    setEditAlgoContent(algo.content);
  };

  // --- Filtering ---

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           t.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDate = isTaskOnDate(t, selectedDate);
      return matchesSearch && matchesDate;
    });
  }, [tasks, selectedDate, searchQuery]);

  const missedTasks = useMemo(() => tasks
    .map(task => ({ task, dates: missedDates(task) }))
    .filter(m => m.dates.length > 0), [tasks]);

  const upcomingTasks = useMemo(() => {
    const today = startOfToday();
    return tasks
      .filter(t => {
        const isRecurring = t.recurrence && t.recurrence.type !== 'none';
        const hasFutureDueDates = t.dueDates && t.dueDates.some(d => d.toDate() >= today);
        const hasFutureDueDate = t.dueDate && t.dueDate.toDate() >= today && t.status !== 'done';
        return hasFutureDueDate || hasFutureDueDates || isRecurring;
      })
      .sort((a, b) => {
        const getNextDate = (t: Task) => {
          if (t.dueDate) return t.dueDate.toDate().getTime();
          if (t.dueDates && t.dueDates.length > 0) {
            const futureDates = t.dueDates.map(d => d.toDate()).filter(d => d >= today);
            if (futureDates.length > 0) return Math.min(...futureDates.map(d => d.getTime()));
          }
          return today.getTime();
        };
        return getNextDate(a) - getNextDate(b);
      })
      .slice(0, 10);
  }, [tasks]);

  const filteredAlgos = useMemo(() => {
    return algorithms.filter(a => 
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      a.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [algorithms, searchQuery]);

  // --- Render ---

  // Loading state
  if (isResolvingUser) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-swamp-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Инициализация данных...</p>
      </div>
    );
  }

  if (!user) return (
    <div className="flex h-screen items-center justify-center bg-swamp-50">
      <Card className="w-[400px] shadow-2xl border-none">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <BrainCircuit className="text-white w-10 h-10" />
          </div>
          <CardTitle className="text-3xl font-bold">Планер проебщика</CardTitle>
          <CardDescription>Ваш интеллектуальный помощник, чтобы ничего не забыть</CardDescription>
        </CardHeader>
        <CardContent>
          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}
          <Button onClick={handleLogin} className="w-full h-12 text-lg gap-2">
            <LogIn className="w-5 h-5" /> Войти через Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const currentPhotoURL = user?.photoURL;

  return (
    <div className="min-h-screen bg-swamp-50/50 dark:bg-swamp-950 flex flex-col font-sans transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 dark:bg-swamp-900/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 sm:h-16 sm:py-0">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <div className="bg-primary p-1.5 rounded-lg shadow-sm">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight dark:text-white hidden sm:block">Планер проебщика</h1>
            </div>
            
            <div className="flex items-center gap-2 sm:hidden">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setActiveWorkspace(prev => prev === 'work' ? 'personal' : 'work')}
                className="flex rounded-full text-xs font-medium px-2 h-8"
              >
                {activeWorkspace === 'work' ? '💼' : '🏠'}
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full h-8 w-8">
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-swamp-600" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full h-8 w-8" aria-label="Выйти">
                <LogOut className="w-4 h-4 text-red-500" />
              </Button>
              {currentPhotoURL ? (
                <img src={currentPhotoURL} className="w-8 h-8 rounded-full border shadow-sm" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                  <span className="text-[10px] font-bold text-primary">{user?.displayName?.[0] || 'U'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="w-full sm:flex-1 sm:max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Поиск..." 
              className="pl-10 bg-swamp-100/50 dark:bg-swamp-800/50 border-none focus-visible:ring-1 h-9 sm:h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setActiveWorkspace(prev => prev === 'work' ? 'personal' : 'work')}
              className="flex rounded-full text-xs font-medium"
            >
              {activeWorkspace === 'work' ? '💼 Рабочий' : '🏠 Личный'}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
              {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-swamp-600" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full" aria-label="Выйти">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </Button>
            {currentPhotoURL ? (
              <img src={currentPhotoURL} className="w-8 h-8 rounded-full border shadow-sm" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                <span className="text-[10px] font-bold text-primary">{user?.displayName?.[0] || 'U'}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
        {/* Sidebar */}
        <aside className="lg:col-span-3 space-y-6 order-2 lg:order-1">
          <Card className="border-none shadow-sm dark:bg-swamp-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 dark:text-white">
                <StickyNote className="w-4 h-4 text-amber-500" />
                Быстрые заметки
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addNote} className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    placeholder="Записать..." 
                    className="text-xs h-8 pr-8 dark:bg-swamp-800 dark:border-swamp-700"
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                  />
                  <button 
                    type="button"
                    onClick={startVoiceInput}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 transition-colors",
                      isRecording ? "text-red-500 animate-pulse" : "text-swamp-400 hover:text-primary"
                    )}
                  >
                    {isRecording ? <Mic className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  </button>
                </div>
                <Button type="submit" size="icon" className="h-8 w-8 shrink-0"><Plus className="w-4 h-4" /></Button>
              </form>
              <ScrollArea className="h-[200px] lg:h-[300px]">
                <div className="space-y-2 pr-3">
                  {notes.map(note => (
                    <div key={note.id} className="p-2 pr-12 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs border border-amber-100 dark:border-amber-900/30 dark:text-amber-200 group relative">
                      {note.content}
                      <div className="absolute top-1 right-1 flex gap-1.5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100">
                        <button onClick={() => startNoteToTask(note)} className="text-amber-500 hover:text-primary" aria-label="Сделать задачей" title="Сделать задачей">
                          <ListTodo className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteDoc(doc(db, 'notes', note.id))} className="text-amber-400 hover:text-red-500" aria-label="Удалить заметку">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-6 space-y-6 order-1 lg:order-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
              <TabsList className="bg-swamp-200/50 dark:bg-swamp-800/50 p-1 flex flex-wrap h-auto">
                <TabsTrigger value="tasks" className="gap-2 flex-1 sm:flex-none py-2"><CheckCircle2 className="w-4 h-4" /> <span className="hidden sm:inline">Задачи</span></TabsTrigger>
                <TabsTrigger value="algorithms" className="gap-2 flex-1 sm:flex-none py-2"><BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">База знаний</span></TabsTrigger>              </TabsList>

              {activeTab === 'tasks' && (
                <Dialog open={isTaskModalOpen} onOpenChange={(open) => {
                  setIsTaskModalOpen(open);
                  if (!open) {
                    setEditingTaskId(null);
                    setConvertingNoteId(null);
                    setTaskForm(emptyTaskForm());
                  }
                }}>
                  <DialogTrigger render={<Button className="gap-2 shadow-lg shadow-primary/20 w-full sm:w-auto overflow-hidden"><Plus className="w-4 h-4" /> Создать задачу</Button>} />
                  <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto dark:bg-swamp-900 dark:border-swamp-800">
                    <form onSubmit={handleCreateTask}>
                      <DialogHeader><DialogTitle className="dark:text-white">{editingTaskId ? 'Редактировать' : 'Новая'} задача</DialogTitle></DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label className="dark:text-swamp-300">Название</Label>
                          <Input className="dark:bg-swamp-800 dark:border-swamp-700" value={taskForm.title} onChange={(e) => setTaskForm({...taskForm, title: e.target.value})} required />
                        </div>
                        <div className="grid gap-2">
                          <Label className="dark:text-swamp-300">Описание (необязательно)</Label>
                          <Textarea className="min-h-[70px] dark:bg-swamp-800 dark:border-swamp-700" value={taskForm.description} onChange={(e) => setTaskForm({...taskForm, description: e.target.value})} />
                        </div>

                        {/* Planning Mode Selector */}
                        <div className="grid gap-2">
                          <Label className="dark:text-swamp-300">Режим планирования</Label>
                          <div className="grid grid-cols-3 gap-1.5 p-1 bg-swamp-100 dark:bg-swamp-800 rounded-lg text-xs">
                            <button
                              type="button"
                              onClick={() => setTaskForm({ ...taskForm, dateMode: 'single' })}
                              className={cn(
                                "py-1.5 px-2 rounded-md font-medium transition-all text-center",
                                taskForm.dateMode === 'single' ? "bg-white dark:bg-swamp-700 shadow-sm text-primary dark:text-white" : "text-swamp-600 dark:text-swamp-400 hover:text-swamp-900"
                              )}
                            >
                              Один день
                            </button>
                            <button
                              type="button"
                              onClick={() => setTaskForm({ ...taskForm, dateMode: 'multiple' })}
                              className={cn(
                                "py-1.5 px-2 rounded-md font-medium transition-all text-center",
                                taskForm.dateMode === 'multiple' ? "bg-white dark:bg-swamp-700 shadow-sm text-primary dark:text-white" : "text-swamp-600 dark:text-swamp-400 hover:text-swamp-900"
                              )}
                            >
                              Несколько дат
                            </button>
                            <button
                              type="button"
                              onClick={() => setTaskForm({ ...taskForm, dateMode: 'routine', recurrenceType: taskForm.recurrenceType === 'none' ? 'daily' : taskForm.recurrenceType })}
                              className={cn(
                                "py-1.5 px-2 rounded-md font-medium transition-all text-center",
                                taskForm.dateMode === 'routine' ? "bg-white dark:bg-swamp-700 shadow-sm text-primary dark:text-white" : "text-swamp-600 dark:text-swamp-400 hover:text-swamp-900"
                              )}
                            >
                              Рутина
                            </button>
                          </div>
                        </div>

                        {/* Dynamic Date & Recurrence Controls */}
                        {taskForm.dateMode === 'single' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label className="dark:text-swamp-300">Дата</Label>
                              <Popover>
                                <PopoverTrigger render={<Button variant="outline" className="w-full justify-start dark:border-swamp-700 dark:text-swamp-300"><CalendarIcon className="mr-2 h-4 w-4 shrink-0" /> <span className="truncate">{taskForm.dueDate ? format(taskForm.dueDate, "dd.MM.yyyy") : "Выбрать дату"}</span></Button>} />
                                <PopoverContent className="w-auto p-0 dark:bg-swamp-900 dark:border-swamp-800"><Calendar mode="single" selected={taskForm.dueDate} onSelect={(d) => setTaskForm({...taskForm, dueDate: d})} locale={ru} /></PopoverContent>
                              </Popover>
                            </div>
                            <div className="grid gap-2">
                              <Label className="dark:text-swamp-300">Время</Label>
                              <Input type="time" className="w-full dark:bg-swamp-800 dark:border-swamp-700" value={taskForm.dueTime} onChange={(e) => setTaskForm({...taskForm, dueTime: e.target.value})} />
                            </div>
                          </div>
                        )}

                        {taskForm.dateMode === 'multiple' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label className="dark:text-swamp-300">Календарь дат ({taskForm.dueDates.length})</Label>
                                <Popover>
                                  <PopoverTrigger render={<Button variant="outline" className="w-full justify-start dark:border-swamp-700 dark:text-swamp-300"><CalendarIcon className="mr-2 h-4 w-4 shrink-0" /> <span className="truncate">{taskForm.dueDates.length > 0 ? `Выбрано: ${taskForm.dueDates.length}` : "Выбрать даты..."}</span></Button>} />
                                  <PopoverContent className="w-auto p-0 dark:bg-swamp-900 dark:border-swamp-800">
                                    <Calendar 
                                      mode="multiple" 
                                      selected={taskForm.dueDates} 
                                      onSelect={(dates) => setTaskForm({ ...taskForm, dueDates: (dates as Date[]) || [] })} 
                                      locale={ru} 
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="grid gap-2">
                                <Label className="dark:text-swamp-300">Время</Label>
                                <Input type="time" className="w-full dark:bg-swamp-800 dark:border-swamp-700" value={taskForm.dueTime} onChange={(e) => setTaskForm({...taskForm, dueTime: e.target.value})} />
                              </div>
                            </div>
                            {taskForm.dueDates.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 p-2 bg-swamp-50 dark:bg-swamp-800/50 rounded-lg border border-swamp-100 dark:border-swamp-700 max-h-28 overflow-y-auto">
                                {taskForm.dueDates.map((d, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 text-[11px] bg-white dark:bg-swamp-700 text-swamp-800 dark:text-swamp-200 px-2 py-0.5 rounded-md border border-swamp-200 dark:border-swamp-600">
                                    {format(d, "dd.MM.yyyy")}
                                    <button 
                                      type="button" 
                                      onClick={() => setTaskForm({ ...taskForm, dueDates: taskForm.dueDates.filter((_, i) => i !== idx) })}
                                      className="text-muted-foreground hover:text-destructive"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {taskForm.dateMode === 'routine' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label className="dark:text-swamp-300">Повторение</Label>
                                <select 
                                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm dark:border-swamp-700 dark:text-swamp-300" 
                                  value={taskForm.recurrenceType} 
                                  onChange={(e) => setTaskForm({...taskForm, recurrenceType: e.target.value as any})}
                                >
                                  <option value="daily">Каждый день</option>
                                  <option value="weekly">Каждую неделю</option>
                                  <option value="monthly">Каждый месяц</option>
                                </select>
                              </div>
                              <div className="grid gap-2">
                                <Label className="dark:text-swamp-300">Время</Label>
                                <Input type="time" className="w-full dark:bg-swamp-800 dark:border-swamp-700" value={taskForm.dueTime} onChange={(e) => setTaskForm({...taskForm, dueTime: e.target.value})} />
                              </div>
                            </div>

                            {taskForm.recurrenceType === 'monthly' && (
                              <div className="grid gap-2">
                                <Label className="dark:text-swamp-300 text-xs">Число месяца</Label>
                                <select
                                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm dark:border-swamp-700 dark:text-swamp-300"
                                  value={taskForm.recurrenceDayOfMonth}
                                  onChange={(e) => setTaskForm({ ...taskForm, recurrenceDayOfMonth: Number(e.target.value) })}
                                >
                                  {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}-е</option>)}
                                  <option value={31}>Последний день месяца</option>
                                </select>
                              </div>
                            )}

                            {taskForm.recurrenceType === 'weekly' && (
                              <div className="grid gap-2">
                                <Label className="dark:text-swamp-300 text-xs">Дни недели</Label>
                                <div className="flex gap-1">
                                  {[
                                    { label: 'Пн', day: 1 },
                                    { label: 'Вт', day: 2 },
                                    { label: 'Ср', day: 3 },
                                    { label: 'Чт', day: 4 },
                                    { label: 'Пт', day: 5 },
                                    { label: 'Сб', day: 6 },
                                    { label: 'Вс', day: 0 }
                                  ].map(({ label, day }) => {
                                    const isSelected = taskForm.recurrenceDays.includes(day);
                                    return (
                                      <button
                                        key={day}
                                        type="button"
                                        onClick={() => {
                                          const nextDays = isSelected 
                                            ? taskForm.recurrenceDays.filter(d => d !== day)
                                            : [...taskForm.recurrenceDays, day];
                                          setTaskForm({ ...taskForm, recurrenceDays: nextDays });
                                        }}
                                        className={cn(
                                          "flex-1 py-1.5 rounded text-xs font-medium transition-colors border",
                                          isSelected 
                                            ? "bg-primary text-primary-foreground border-primary" 
                                            : "bg-swamp-100 dark:bg-swamp-800 text-swamp-700 dark:text-swamp-300 border-transparent hover:border-swamp-300"
                                        )}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label className="dark:text-swamp-300">Приоритет</Label>
                            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm dark:border-swamp-700 dark:text-swamp-300" value={taskForm.priority} onChange={(e) => setTaskForm({...taskForm, priority: e.target.value as any})}>
                              <option value="low">Низкий</option>
                              <option value="medium">Средний</option>
                              <option value="high">Высокий</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label className="dark:text-swamp-300">Подзадачи</Label>
                          <div className="space-y-2 max-h-[120px] overflow-y-auto p-2 border rounded-md bg-swamp-50 dark:bg-swamp-800 dark:border-swamp-700">
                            {taskForm.subtasks.map((st, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm dark:text-swamp-300">
                                <Circle className="w-3 h-3 text-swamp-400 shrink-0" /> {st.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <DialogFooter><Button type="submit" className="w-full">Сохранить</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <TabsContent value="tasks" className="space-y-6 outline-none">
              {tasks.length === 0 && (
                <Card className="border-dashed border-2 py-12 flex flex-col items-center justify-center text-center bg-transparent">
                  <div className="bg-primary/10 p-4 rounded-full mb-4">
                    <CheckCircle2 className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Задач пока нет</h3>
                  <p className="text-sm text-muted-foreground max-w-[250px]">
                    Создайте свою первую задачу.
                  </p>
                </Card>
              )}
              {/* Weekly Calendar View */}
              <div className="bg-white dark:bg-swamp-900 rounded-xl border border-swamp-200 dark:border-swamp-800 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-swamp-100 dark:border-swamp-800">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-swamp-800 dark:text-swamp-100 capitalize">
                      {format(selectedDate, 'LLLL yyyy', { locale: ru })}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevWeek}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs font-medium" onClick={handleToday}>
                      Сегодня
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextWeek}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 divide-x divide-swamp-100 dark:divide-swamp-800">
                  {currentWeekDays.map((day) => {
                    const isSelected = isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);
                    
                    const dayTasks = tasks.filter(t => isTaskOnDate(t, day));
                    const hasUncompleted = dayTasks.some(t => !isTaskCompletedOnDate(t, day));
                    const isOverdue = hasUncompleted && day < startOfToday();

                    return (
                      <button 
                        key={day.toISOString()} 
                        onClick={() => setSelectedDate(day)} 
                        className={cn(
                          "flex flex-col items-center justify-center py-3 transition-colors hover:bg-swamp-50 dark:hover:bg-swamp-800/50 relative",
                          isSelected && "bg-swamp-50 dark:bg-swamp-800/50"
                        )}
                      >
                        <span className={cn(
                          "text-[10px] uppercase font-medium mb-1",
                          isOverdue ? "text-red-500 dark:text-red-400 font-bold" : "text-swamp-500 dark:text-swamp-400"
                        )}>
                          {format(day, 'EEEEEE', { locale: ru })}
                        </span>
                        <div className={cn(
                          "w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium",
                          isSelected ? "bg-primary text-primary-foreground" : 
                          isTodayDate ? "text-primary bg-primary/10" : 
                          isOverdue ? "text-red-600 dark:text-red-400" : "text-swamp-700 dark:text-swamp-300"
                        )}>
                          {format(day, 'd')}
                        </div>
                        <div className="h-1 mt-0.5 flex gap-1 absolute bottom-1.5">
                          {isOverdue && <div className="w-1 h-1 rounded-full bg-red-500" />}
                          {!isOverdue && hasUncompleted && <div className="w-1 h-1 rounded-full bg-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isToday(selectedDate) && missedTasks.length > 0 && (
                <Card className="border-l-4 border-l-red-500 dark:bg-swamp-900 dark:border-swamp-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" /> Не сделано
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {missedTasks.map(({ task, dates }) => (
                      <div key={task.id} className="flex items-start gap-3">
                        <Checkbox checked={false} onCheckedChange={() => toggleTaskStatus(task, dates[0])} className="mt-0.5" aria-label={`Отметить «${task.title}» за ${format(dates[0], 'd MMMM', { locale: ru })}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium dark:text-white leading-tight">{task.title}</p>
                          <button type="button" onClick={() => setSelectedDate(dates[0])} className="text-xs text-red-500 hover:underline">
                            {format(dates[0], 'd MMMM', { locale: ru })}{dates.length > 1 && ` · пропусков за 2 недели: ${dates.length}`}
                          </button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-swamp-800 dark:text-swamp-200 flex items-center gap-2"><Circle className="w-4 h-4 text-amber-500" /> В работе</h3>
                  <div className="space-y-3">
                    {filteredTasks.filter(t => !isTaskCompletedOnDate(t, selectedDate)).map(task => (
                      <Card key={task.id} className="group hover:shadow-md transition-all border-l-4 border-l-primary dark:bg-swamp-900 dark:border-swamp-800">
                        <CardContent className="p-4 flex items-start gap-3">
                          <Checkbox checked={false} onCheckedChange={() => toggleTaskStatus(task, selectedDate)} className="mt-1 dark:border-swamp-700" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm dark:text-white leading-tight">{task.title}</h4>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 dark:text-swamp-500">{task.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {task.dueDate && !task.dueDates?.length && (!task.recurrence || task.recurrence.type === 'none') && (
                                <span className={cn("flex items-center gap-1 text-[10px] font-medium", 
                                  task.dueDate.toDate() < startOfToday() ? "text-red-500" : "text-swamp-500"
                                )}>
                                  <Clock className="w-3 h-3" /> {format(task.dueDate.toDate(), 'dd MMM HH:mm', { locale: ru })}
                                </span>
                              )}
                              {task.dueDates && task.dueDates.length > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
                                  <CalendarIcon className="w-3 h-3" /> {task.dueDates.length} дат
                                </span>
                              )}
                              {task.recurrence && task.recurrence.type && task.recurrence.type !== 'none' && (
                                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                  <Repeat className="w-3 h-3" /> {
                                    task.recurrence.type === 'daily' ? 'Каждый день' :
                                    task.recurrence.type === 'weekly' 
                                      ? (task.recurrence.daysOfWeek && task.recurrence.daysOfWeek.length > 0 
                                          ? `Еженедельно (${task.recurrence.daysOfWeek.map(d => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d]).join(', ')})` 
                                          : 'Еженедельно')
                                      : task.recurrence.dayOfMonth === 31 ? 'Ежемесячно (последний день)'
                                      : task.recurrence.dayOfMonth ? `Ежемесячно (${task.recurrence.dayOfMonth}-го)` : 'Ежемесячно'
                                  }
                                </span>
                              )}
                              <span className={cn("text-[10px] font-medium px-2 hover:bg-opacity-80 transition-colors uppercase rounded-full border", 
                                task.priority === 'high' ? "border-red-200 text-red-600 bg-red-50 dark:bg-red-950/40 dark:border-red-900" : 
                                task.priority === 'medium' ? "border-amber-200 text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900" : 
                                "border-sky-200 text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:border-sky-900"
                              )}>
                                {task.priority === 'high' ? 'Высокий' : task.priority === 'medium' ? 'Средний' : 'Низкий'}
                              </span>
                            </div>
                            {task.subtasks && task.subtasks.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {task.subtasks.map((st, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground dark:text-swamp-400">
                                    <div className="w-1 h-1 rounded-full bg-swamp-300 dark:bg-swamp-600" /> {st.title}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 -mt-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-swamp-500 hover:text-primary pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={() => startEditingTask(task)} aria-label="Изменить"><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-swamp-500 hover:text-primary pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={() => startEditingTask(task, true)} aria-label="Дублировать" title="Дублировать"><Copy className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={() => deleteDoc(doc(db, 'tasks', task.id))} aria-label="Удалить"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-swamp-800 dark:text-swamp-200 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Завершено</h3>
                  <div className="space-y-3">
                    {filteredTasks.filter(t => isTaskCompletedOnDate(t, selectedDate)).map(task => (
                      <Card key={task.id} className="group bg-swamp-100/50 dark:bg-swamp-900/50 border-none opacity-70">
                        <CardContent className="p-3 flex items-start gap-3">
                          <Checkbox checked={true} onCheckedChange={() => toggleTaskStatus(task, selectedDate)} className="mt-1" />
                          <div className="flex-1 flex flex-col justify-center">
                            <span className="text-sm line-through text-muted-foreground dark:text-swamp-500">{task.title}</span>
                          </div>
                          <div className="flex items-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={() => deleteDoc(doc(db, 'tasks', task.id))} aria-label="Удалить"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="algorithms" className="grid grid-cols-1 lg:grid-cols-3 gap-6 outline-none">
              <Card className="lg:col-span-1 border-none shadow-sm h-fit dark:bg-swamp-900">
                <CardHeader><CardTitle className="text-lg dark:text-white">Новый алгоритм</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Input placeholder="Название..." className="dark:bg-swamp-800 dark:border-swamp-700 dark:text-white" value={newAlgoTitle} onChange={(e) => setNewAlgoTitle(e.target.value)} />
                  <Textarea placeholder="Markdown контент..." className="min-h-[200px] text-sm dark:bg-swamp-800 dark:border-swamp-700 dark:text-white" value={newAlgoContent} onChange={(e) => setNewAlgoContent(e.target.value)} />
                  <Button onClick={addAlgorithm} className="w-full">Сохранить</Button>
                </CardContent>
              </Card>
              <div className="lg:col-span-2 space-y-4">
                {filteredAlgos.map(algo => (
                  <Card key={algo.id} className="border-none shadow-sm overflow-hidden dark:bg-swamp-900">
                    {editingAlgoId === algo.id ? (
                      <>
                        <CardHeader className="bg-swamp-50/50 dark:bg-swamp-800/50 py-3">
                          <Input className="dark:bg-swamp-800 dark:border-swamp-700 dark:text-white" value={editAlgoTitle} onChange={(e) => setEditAlgoTitle(e.target.value)} />
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                          <Textarea className="min-h-[200px] text-sm dark:bg-swamp-800 dark:border-swamp-700 dark:text-white" value={editAlgoContent} onChange={(e) => setEditAlgoContent(e.target.value)} />
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setEditingAlgoId(null)}>Отмена</Button>
                            <Button onClick={() => updateAlgorithm(algo.id)}>Сохранить</Button>
                          </div>
                        </CardContent>
                      </>
                    ) : (
                      <>
                        <CardHeader className="bg-swamp-50/50 dark:bg-swamp-800/50 flex flex-row items-center justify-between py-3">
                          <CardTitle className="text-md dark:text-white">{algo.title}</CardTitle>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-swamp-500 hover:text-primary" onClick={() => startEditingAlgo(algo)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteDoc(doc(db, 'algorithms', algo.id))}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{algo.content}</ReactMarkdown>
                        </CardContent>
                      </>
                    )}
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar / Upcoming Tasks */}
        <aside className="lg:col-span-3 space-y-6 order-3 hidden lg:block">
          <Card className="border-none shadow-sm dark:bg-swamp-900 sticky top-24">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 dark:text-white">
                <CalendarIcon className="w-4 h-4 text-primary" />
                Предстоящие задачи
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-3 pr-3">
                  {upcomingTasks.length > 0 ? upcomingTasks.map(task => {
                    const nextDate = (() => {
                      if (task.dueDate) return task.dueDate.toDate();
                      if (task.dueDates && task.dueDates.length > 0) {
                        const futureDates = task.dueDates.map(d => d.toDate()).filter(d => d >= startOfToday());
                        if (futureDates.length > 0) return futureDates[0];
                        return task.dueDates[0].toDate();
                      }
                      return undefined;
                    })();

                    return (
                      <div key={task.id} className="p-3 bg-swamp-50 dark:bg-swamp-800/50 rounded-lg border border-swamp-100 dark:border-swamp-800 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => {
                        if (nextDate) setSelectedDate(nextDate);
                        setActiveTab('tasks');
                      }}>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium dark:text-swamp-200 line-clamp-2">{task.title}</h4>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-swamp-500 dark:text-swamp-400">
                          {task.recurrence && task.recurrence.type && task.recurrence.type !== 'none' ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <Repeat className="w-3 h-3" /> 
                              {task.recurrence.type === 'daily' ? 'Каждый день' : task.recurrence.type === 'weekly' ? 'Еженедельно' : 'Ежемесячно'}
                            </span>
                          ) : task.dueDates && task.dueDates.length > 0 ? (
                            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
                              <CalendarIcon className="w-3 h-3" /> {nextDate ? format(nextDate, 'd MMM', { locale: ru }) : ''} ({task.dueDates.length} дат)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3 h-3" />
                              {task.dueDate ? format(task.dueDate.toDate(), 'd MMMM, HH:mm', { locale: ru }) : 'Без даты'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="text-xs text-swamp-500 text-center py-4">Нет предстоящих задач</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
