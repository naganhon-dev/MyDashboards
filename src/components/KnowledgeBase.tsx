import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClass } from './TaskDialog';

export type Algorithm = { id: string; title: string; content: string };

type Props = {
  items: Algorithm[];
  onSave: (id: string | null, title: string, content: string) => Promise<void>;
  onDelete: (item: Algorithm) => void;
};

function Editor({ initial, onCancel, onSave }: { initial?: Algorithm; onCancel: () => void; onSave: (title: string, content: string) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (title.trim() && content.trim()) await onSave(title.trim(), content);
      }}
      className="card flex flex-col gap-3 p-5"
    >
      <input autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название, например «Выдача бонусов ТО»" className={fieldClass} />
      <textarea required maxLength={10000} value={content} onChange={(e) => setContent(e.target.value)} placeholder={'Шаги по порядку. Поддерживается Markdown:\n1. Первый шаг\n2. Второй шаг'} className="min-h-[220px] w-full resize-y rounded-xl border border-control bg-paper p-3 font-mono text-[14px] leading-relaxed outline-none focus:border-accent-2" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-11 rounded-xl px-4 text-[15px] font-medium text-ink-2 hover:bg-track">Отмена</button>
        <button type="submit" className="route-gradient h-11 rounded-xl px-5 text-[15px] font-semibold text-white">Сохранить</button>
      </div>
    </form>
  );
}

export default function KnowledgeBase({ items, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">База знаний</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Инструкции и алгоритмы, чтобы не вспоминать каждый раз заново.</p>
        </div>
        {editing !== 'new' && (
          <button onClick={() => setEditing('new')} className="route-gradient inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-white">
            <Plus className="size-4" /> <span className="hidden sm:inline">Новый алгоритм</span>
          </button>
        )}
      </header>

      {editing === 'new' && (
        <Editor onCancel={() => setEditing(null)} onSave={async (t, c) => { await onSave(null, t, c); setEditing(null); }} />
      )}

      {items.length === 0 && editing !== 'new' && (
        <p className="card px-6 py-10 text-center text-[15px] text-muted-foreground">Здесь пока пусто. Добавьте первый алгоритм.</p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) =>
          editing === item.id ? (
            <Editor key={item.id} initial={item} onCancel={() => setEditing(null)} onSave={async (t, c) => { await onSave(item.id, t, c); setEditing(null); }} />
          ) : (
            <article key={item.id} className="card overflow-hidden">
              <div className="flex items-center gap-2 pr-3">
                <button
                  onClick={() => setOpenId(openId === item.id ? null : item.id)}
                  aria-expanded={openId === item.id}
                  className="flex min-h-14 flex-1 items-center gap-3 px-5 text-left"
                >
                  <ChevronDown className={cn('size-4 shrink-0 text-faint transition-transform', openId === item.id && 'rotate-180')} />
                  <span className="text-[15px] font-semibold">{item.title}</span>
                </button>
                <button onClick={() => setEditing(item.id)} aria-label="Изменить" className="grid size-9 place-items-center rounded-lg text-faint hover:bg-track hover:text-ink"><Pencil className="size-4" /></button>
                <button onClick={() => onDelete(item)} aria-label="Удалить" className="grid size-9 place-items-center rounded-lg text-faint hover:bg-rust-wash hover:text-rust"><Trash2 className="size-4" /></button>
              </div>
              {openId === item.id && (
                <div className="prose prose-sm max-w-none border-t border-line px-5 py-4 text-[15px] leading-relaxed text-ink-2 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
              )}
            </article>
          )
        )}
      </div>
    </div>
  );
}
