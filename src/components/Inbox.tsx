import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ListTodo, Mic, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClass } from './TaskDialog';

export type Note = { id: string; content: string; createdAt?: { toDate: () => Date } };

type Props = {
  notes: Note[];
  onAdd: (text: string) => Promise<void>;
  onToTask: (note: Note) => void;
  onDelete: (note: Note) => void;
};

export default function Inbox({ notes, onAdd, onToTask, onDelete }: Props) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const hasVoice = 'webkitSpeechRecognition' in window;

  const startVoice = () => {
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.onstart = () => setRecording(true);
    recognition.onend = () => setRecording(false);
    recognition.onresult = (event: any) => setText((prev) => `${prev} ${event.results[0][0].transcript}`.trim());
    recognition.start();
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Заметки</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Всё, что пришло в голову. Когда созреет — превращайте в задачу.</p>
      </header>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await onAdd(text.trim());
          setText('');
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} placeholder="Записать мысль" className={cn(fieldClass, hasVoice && 'pr-11')} />
          {hasVoice && (
            <button type="button" onClick={startVoice} aria-label="Надиктовать" className={cn('absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5', recording ? 'animate-pulse text-rust' : 'text-faint hover:text-accent-text')}>
              <Mic className="size-4" />
            </button>
          )}
        </div>
        <button type="submit" aria-label="Добавить заметку" className="route-gradient grid size-11 shrink-0 place-items-center rounded-xl text-white"><Plus className="size-5" /></button>
      </form>

      {notes.length === 0 ? (
        <p className="card px-6 py-10 text-center text-[15px] text-muted-foreground">Заметок пока нет. Запишите первую мысль сверху.</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {notes.map((note) => (
            <li key={note.id} className="group flex items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{note.content}</p>
                {note.createdAt && <p className="mt-1 text-xs text-faint">{format(note.createdAt.toDate(), 'd MMMM', { locale: ru })}</p>}
              </div>
              <div className="flex shrink-0 gap-1 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100">
                <button onClick={() => onToTask(note)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent-text hover:bg-accent-wash">
                  <ListTodo className="size-4" /> <span className="hidden sm:inline">В задачу</span><span className="sr-only sm:hidden">В задачу</span>
                </button>
                <button onClick={() => onDelete(note)} aria-label="Удалить заметку" className="grid size-9 place-items-center rounded-lg text-faint hover:bg-rust-wash hover:text-rust">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
