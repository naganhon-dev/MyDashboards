import { useEffect, useState } from 'react';

// Same mark as MailFlow/Retention, gradient follows the workspace accent
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 34 34" className="shrink-0">
      <defs>
        <linearGradient id="planner-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--accent-1)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--accent-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-3)' }} />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="10" fill="url(#planner-logo)" />
      <rect x="8" y="9" width="18" height="17" rx="3.5" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M8 14.5h18M13 7v4M21 7v4M12.5 20l2.5 2.5 5-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** useState that survives reloads; storage can be unavailable (private mode), so it falls back to memory */
export function useStoredState<T extends string>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}
