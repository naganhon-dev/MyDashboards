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
import { GoogleGenAI } from "@google/genai";
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
  History,
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
  Sparkles,
  Search,
  StickyNote,
  Lightbulb,
  X,
  Tag as TagIcon,
  BrainCircuit,
  Pencil
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format, addDays, startOfToday, isSameDay, eachDayOfInterval, isToday, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { ru } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// --- Types ---

interface Subtask {
  title: string;
  done: boolean;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  userId: string;
  createdAt: Timestamp;
  dueDate?: Timestamp | null;
  tags?: string[];
  subtasks?: Subtask[];
  workspace?: 'work' | 'personal';
}

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

// --- AI Setup ---
let genAI: GoogleGenAI | null = null;
const getGenAI = () => {
  if (!genAI) {
    // Check both standard and VITE-prefixed env vars for maximum compatibility
    // @ts-ignore - Vite handles this at build time
    const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn("GEMINI_API_KEY or VITE_GEMINI_API_KEY is not defined. AI features will be disabled.");
      return null;
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
};

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
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [dailyBriefing, setDailyBriefing] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') || 
             window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  // Memory Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
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
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    dueDate: undefined as Date | undefined,
    priority: 'medium' as 'low' | 'medium' | 'high',
    tags: [] as string[],
    subtasks: [] as Subtask[]
  });
  
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

  const handleLogout = async () => {
    await signOut(auth);
  };

  // --- Data Fetching ---

  useEffect(() => {
    if (!isAuthReady || !user) {
      setAllTasks([]);
      setAllAlgorithms([]);
      setAllNotes([]);
      return;
    }

    const unsubTasks = onSnapshot(query(collection(db, 'tasks'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')), (s) => {
      setAllTasks(s.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    });

    const unsubAlgos = onSnapshot(query(collection(db, 'algorithms'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')), (s) => {
      setAllAlgorithms(s.docs.map(d => ({ id: d.id, ...d.data() } as Algorithm)));
    });

    const unsubNotes = onSnapshot(query(collection(db, 'notes'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')), (s) => {
      setAllNotes(s.docs.map(d => ({ id: d.id, ...d.data() } as Note)));
    });

    return () => { unsubTasks(); unsubAlgos(); unsubNotes(); };
  }, [user, isAuthReady]);

  // --- AI Actions ---

  const generateSubtasks = async () => {
    if (!taskForm.title.trim()) return;
    const ai = getGenAI();
    if (!ai) {
      alert("AI функции недоступны. Проверьте API ключ.");
      return;
    }
    setIsAiLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Разбей задачу "${taskForm.title}" на 3-5 конкретных подзадач. Верни только список подзадач через запятую, без лишних слов.`,
      });
      const text = response.text;
      const suggested = text.split(',').map(s => ({ title: s.trim(), done: false }));
      setTaskForm(prev => ({ ...prev, subtasks: [...prev.subtasks, ...suggested] }));
    } catch (error: any) {
      console.error(error);
      alert(`Ошибка AI: ${error.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const getDailyBriefing = async () => {
    if (!user || tasks.length === 0) return;
    const ai = getGenAI();
    if (!ai) return;
    setIsAiLoading(true);
    try {
      const todayTasks = tasks.filter(t => t.dueDate && isSameDay(t.dueDate.toDate(), startOfToday()));
      const taskList = todayTasks.map(t => `- ${t.title} (${t.priority})`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Ты - персональный ассистент. Вот список задач на сегодня:\n${taskList}\nДай краткое, мотивирующее напутствие на день (2-3 предложения).`,
      });
      setDailyBriefing(response.text);
    } catch (error: any) {
      console.error(error);
      setDailyBriefing(`Ошибка загрузки: ${error.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const askMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user || isChatLoading) return;

    const ai = getGenAI();
    if (!ai) {
      setChatMessages(prev => [...prev, { 
        role: 'ai', 
        content: "AI функции недоступны. Пожалуйста, добавьте переменную VITE_GEMINI_API_KEY в настройках Vercel и сделайте Redeploy." 
      }]);
      return;
    }

    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);

    try {
      const context = {
        tasks: tasks.map(t => ({ title: t.title, desc: t.description, status: t.status })),
        algorithms: algorithms.map(a => ({ title: a.title, content: a.content })),
        notes: notes.map(n => n.content)
      };

      const prompt = `Ты - "Вторая память" пользователя. Твоя задача - отвечать на вопросы, используя ТОЛЬКО данные пользователя ниже. Если информации нет, так и скажи.
      
ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:
Задачи: ${JSON.stringify(context.tasks)}
Алгоритмы: ${JSON.stringify(context.algorithms)}
Заметки: ${JSON.stringify(context.notes)}

ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${userMsg}

Отвечай кратко и по делу на русском языке.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      setChatMessages(prev => [...prev, { role: 'ai', content: response.text }]);
    } catch (error: any) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'ai', content: `Ошибка API: ${error.message || 'Неизвестная ошибка'}. Убедитесь, что ключ правильный и у него есть доступ к моделям.` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

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
      if (transcript.trim() && user) {
        try {
          await addDoc(collection(db, 'notes'), {
            content: transcript,
            userId: user.uid,
            createdAt: serverTimestamp(),
            workspace: activeWorkspace,
          });
        } catch (error) {
          console.error("Error adding voice note: ", error);
        }
      }
    };
    recognition.start();
  };

  // --- CRUD Actions ---

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !user) return;
    await addDoc(collection(db, 'tasks'), {
      ...taskForm,
      status: 'todo',
      userId: user.uid,
      createdAt: serverTimestamp(),
      dueDate: taskForm.dueDate ? Timestamp.fromDate(taskForm.dueDate) : null,
      workspace: activeWorkspace,
    });
    setTaskForm({ title: '', description: '', dueDate: undefined, priority: 'medium', tags: [], subtasks: [] });
    setIsTaskModalOpen(false);
  };

  const toggleTaskStatus = async (task: Task) => {
    await updateDoc(doc(db, 'tasks', task.id), { status: task.status === 'done' ? 'todo' : 'done' });
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !user) return;
    await addDoc(collection(db, 'notes'), {
      content: newNoteContent,
      userId: user.uid,
      createdAt: serverTimestamp(),
      workspace: activeWorkspace,
    });
    setNewNoteContent('');
  };

  const addAlgorithm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlgoTitle.trim() || !newAlgoContent.trim() || !user) return;
    await addDoc(collection(db, 'algorithms'), {
      title: newAlgoTitle,
      content: newAlgoContent,
      userId: user.uid,
      createdAt: serverTimestamp(),
      workspace: activeWorkspace,
    });
    setNewAlgoTitle('');
    setNewAlgoContent('');
  };

  const updateAlgorithm = async (id: string) => {
    if (!editAlgoTitle.trim() || !editAlgoContent.trim()) return;
    await updateDoc(doc(db, 'algorithms', id), {
      title: editAlgoTitle,
      content: editAlgoContent,
    });
    setEditingAlgoId(null);
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
      const matchesDate = t.dueDate ? isSameDay(t.dueDate.toDate(), selectedDate) : isSameDay(selectedDate, startOfToday());
      return matchesSearch && matchesDate;
    });
  }, [tasks, selectedDate, searchQuery]);

  const upcomingTasks = useMemo(() => {
    const today = startOfToday();
    return tasks
      .filter(t => t.status !== 'done' && t.dueDate && t.dueDate.toDate() >= today)
      .sort((a, b) => {
        if (!a.dueDate || !b.dueDate) return 0;
        return a.dueDate.toDate().getTime() - b.dueDate.toDate().getTime();
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

  if (!isAuthReady) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;

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
              <h1 className="text-xl font-bold tracking-tight dark:text-white hidden sm:block">Планер</h1>
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
              <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full h-8 w-8">
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </Button>
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border shadow-sm" referrerPolicy="no-referrer" />
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
            <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </Button>
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border shadow-sm" referrerPolicy="no-referrer" />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar / Briefing */}
        <aside className="lg:col-span-3 space-y-6 order-2 lg:order-1">
          <Card className="border-none shadow-sm bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 dark:text-white">
                <Sparkles className="w-4 h-4 text-primary" />
                Брифинг дня
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dailyBriefing ? (
                <p className="text-sm text-swamp-700 dark:text-swamp-300 italic leading-relaxed">"{dailyBriefing}"</p>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-2 dark:border-swamp-700 dark:text-swamp-300" onClick={getDailyBriefing} disabled={isAiLoading}>
                  {isAiLoading ? "Думаю..." : "Получить напутствие"}
                </Button>
              )}
            </CardContent>
          </Card>

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
                    <div key={note.id} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs border border-amber-100 dark:border-amber-900/30 dark:text-amber-200 group relative">
                      {note.content}
                      <button onClick={() => deleteDoc(doc(db, 'notes', note.id))} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-amber-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
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
                <TabsTrigger value="algorithms" className="gap-2 flex-1 sm:flex-none py-2"><BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">База знаний</span></TabsTrigger>
                <TabsTrigger value="memory" className="gap-2 flex-1 sm:flex-none py-2"><History className="w-4 h-4" /> <span className="hidden sm:inline">Спросить память</span></TabsTrigger>
              </TabsList>

              {activeTab === 'tasks' && (
                <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
                  <DialogTrigger render={<Button className="gap-2 shadow-lg shadow-primary/20 w-full sm:w-auto"><Plus className="w-4 h-4" /> Создать задачу</Button>} />
                  <DialogContent className="sm:max-w-[500px] dark:bg-swamp-900 dark:border-swamp-800">
                    <form onSubmit={handleCreateTask}>
                      <DialogHeader><DialogTitle className="dark:text-white">Новая задача</DialogTitle></DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label className="dark:text-swamp-300">Название</Label>
                          <Input className="dark:bg-swamp-800 dark:border-swamp-700" value={taskForm.title} onChange={(e) => setTaskForm({...taskForm, title: e.target.value})} required />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label className="dark:text-swamp-300">Срок</Label>
                            <Popover>
                              <PopoverTrigger render={<Button variant="outline" className="w-full justify-start dark:border-swamp-700 dark:text-swamp-300"><CalendarIcon className="mr-2 h-4 w-4" /> {taskForm.dueDate ? format(taskForm.dueDate, "PPP", { locale: ru }) : "Выбрать"}</Button>} />
                              <PopoverContent className="w-auto p-0 dark:bg-swamp-900 dark:border-swamp-800"><Calendar mode="single" selected={taskForm.dueDate} onSelect={(d) => setTaskForm({...taskForm, dueDate: d})} locale={ru} /></PopoverContent>
                            </Popover>
                          </div>
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
                          <div className="flex justify-between items-center">
                            <Label className="dark:text-swamp-300">Подзадачи</Label>
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-primary" onClick={generateSubtasks} disabled={isAiLoading}>
                              <Sparkles className="w-3 h-3" /> {isAiLoading ? "Генерация..." : "AI Подзадачи"}
                            </Button>
                          </div>
                          <div className="space-y-2 max-h-[150px] overflow-y-auto p-2 border rounded-md bg-swamp-50 dark:bg-swamp-800 dark:border-swamp-700">
                            {taskForm.subtasks.map((st, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm dark:text-swamp-300">
                                <Circle className="w-3 h-3 text-swamp-400" /> {st.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <DialogFooter><Button type="submit" className="w-full">Сохранить задачу</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <TabsContent value="tasks" className="space-y-6 outline-none">
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
                    
                    const dayTasks = tasks.filter(t => t.dueDate && isSameDay(t.dueDate.toDate(), day));
                    const hasUncompleted = dayTasks.some(t => t.status !== 'done');
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-swamp-800 dark:text-swamp-200 flex items-center gap-2"><Circle className="w-4 h-4 text-amber-500" /> В работе</h3>
                  <div className="space-y-3">
                    {filteredTasks.filter(t => t.status !== 'done').map(task => (
                      <Card key={task.id} className="group hover:shadow-md transition-all border-l-4 border-l-primary dark:bg-swamp-900 dark:border-swamp-800">
                        <CardContent className="p-4 flex items-start gap-3">
                          <Checkbox checked={false} onCheckedChange={() => toggleTaskStatus(task)} className="mt-1 dark:border-swamp-700" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm dark:text-white">{task.title}</h4>
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
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8 text-destructive" onClick={() => deleteDoc(doc(db, 'tasks', task.id))}><Trash2 className="w-4 h-4" /></Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-swamp-800 dark:text-swamp-200 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Завершено</h3>
                  <div className="space-y-3">
                    {filteredTasks.filter(t => t.status === 'done').map(task => (
                      <Card key={task.id} className="bg-swamp-100/50 dark:bg-swamp-900/50 border-none opacity-70">
                        <CardContent className="p-3 flex items-start gap-3">
                          <Checkbox checked={true} onCheckedChange={() => toggleTaskStatus(task)} className="mt-1" />
                          <span className="text-sm line-through text-muted-foreground dark:text-swamp-500">{task.title}</span>
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

            <TabsContent value="memory" className="outline-none">
              <Card className="border-none shadow-sm dark:bg-swamp-900 h-[calc(100vh-250px)] lg:h-[600px] flex flex-col">
                <CardHeader className="border-b dark:border-swamp-800">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-primary" />
                    Ваша цифровая память
                  </CardTitle>
                  <CardDescription>Задайте любой вопрос по вашим задачам, заметкам и алгоритмам</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {chatMessages.length === 0 && (
                        <div className="text-center py-10 space-y-4">
                          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                            <Lightbulb className="w-8 h-8 text-primary" />
                          </div>
                          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                            "Когда я планировал встречу с клиентом?" или "Как мне настроить сервер по моему алгоритму?"
                          </p>
                        </div>
                      )}
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[80%] p-3 rounded-2xl text-sm shadow-sm",
                            msg.role === 'user' 
                              ? "bg-primary text-white rounded-tr-none" 
                              : "bg-swamp-100 dark:bg-swamp-800 dark:text-swamp-200 rounded-tl-none"
                          )}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-swamp-100 dark:bg-swamp-800 p-3 rounded-2xl rounded-tl-none shadow-sm">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 bg-swamp-400 rounded-full animate-bounce" />
                              <div className="w-1.5 h-1.5 bg-swamp-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-1.5 h-1.5 bg-swamp-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  <div className="p-4 border-t dark:border-swamp-800">
                    <form onSubmit={askMemory} className="flex gap-2">
                      <Input 
                        placeholder="Спросить у памяти..." 
                        className="dark:bg-swamp-800 dark:border-swamp-700"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={isChatLoading}
                      />
                      <Button type="submit" disabled={isChatLoading || !chatInput.trim()}>
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
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
                  {upcomingTasks.length > 0 ? upcomingTasks.map(task => (
                    <div key={task.id} className="p-3 bg-swamp-50 dark:bg-swamp-800/50 rounded-lg border border-swamp-100 dark:border-swamp-800 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => {
                      if (task.dueDate) setSelectedDate(task.dueDate.toDate());
                      setActiveTab('tasks');
                    }}>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium dark:text-swamp-200 line-clamp-2">{task.title}</h4>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-swamp-500 dark:text-swamp-400">
                        <CalendarIcon className="w-3 h-3" />
                        {task.dueDate ? format(task.dueDate.toDate(), 'd MMMM', { locale: ru }) : 'Без даты'}
                      </div>
                    </div>
                  )) : (
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
