'use client';
import { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

export function cn(...c: (string | false | null | undefined)[]) {
  return clsx(c);
}

// ─── Button ────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type BtnSize = 'sm' | 'md';
const btnBase = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50',
  outline: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
};
const btnSizes: Record<BtnSize, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' };

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean }) {
  return (
    <button className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────
type BadgeColor = 'blue' | 'green' | 'violet' | 'gray' | 'amber' | 'red';
const badgeColors: Record<BadgeColor, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
};
export function Badge({ color = 'gray', children, className }: { color?: BadgeColor; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', badgeColors[color], className)}>{children}</span>;
}

// ─── Card ────────────────────────────────────────────────────
export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-card', className)} style={style}>{children}</div>;
}

// ─── Inputs ──────────────────────────────────────────────────
const fieldBase = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'resize-y leading-relaxed', className)} {...props} />;
}

// ─── Spinner / EmptyState ──────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}
export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}

// ─── Pagination ──────────────────────────────────────────────────
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>Prev</Button>
        <span className="px-2 tabular-nums">Page {page + 1} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

// ─── Toasts ───────────────────────────────────────────────────
type ToastItem = { id: number; message: string; kind: 'success' | 'error' | 'info' };
let _toasts: ToastItem[] = [];
let _subs: ((t: ToastItem[]) => void)[] = [];
let _id = 0;
export function toast(message: string, kind: ToastItem['kind'] = 'success') {
  const item: ToastItem = { id: ++_id, message, kind };
  _toasts = [..._toasts, item];
  _subs.forEach((s) => s(_toasts));
  setTimeout(() => { _toasts = _toasts.filter((t) => t.id !== item.id); _subs.forEach((s) => s(_toasts)); }, 3800);
}
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => { _subs.push(setItems); return () => { _subs = _subs.filter((s) => s !== setItems); }; }, []);
  return (
    <div className="fixed top-4 right-4 z-50 flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cn('animate-fade-in rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg',
          t.kind === 'success' && 'bg-emerald-600', t.kind === 'error' && 'bg-rose-600', t.kind === 'info' && 'bg-slate-800')}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
