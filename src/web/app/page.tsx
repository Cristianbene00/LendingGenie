'use client';
import { useEffect, useRef, useState, ReactNode, FormEvent, ChangeEvent } from 'react';
import {
  LayoutDashboard, MessageSquare, BookOpen, HelpCircle, Upload,
  Briefcase, MessageCircle, Bot, Send, ThumbsUp, ThumbsDown,
  Plus, Search, X, Edit2, CheckCircle2,
  RefreshCw, Clock, TrendingUp, Database, Zap, FileText,
  ChevronDown, ChevronUp, AlertCircle, Sparkles,
} from 'lucide-react';
import { Button, Badge, Card, Input, Textarea, Spinner, EmptyState, Pagination, toast, cn } from './ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function api(path: string) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
  return r.json();
}
async function apiPost(path: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body != null ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? `API ${path} → ${r.status}`);
  return j;
}
async function apiPatch(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? `API ${path} → ${r.status}`);
  return j;
}
async function apiDelete(path: string) {
  const r = await fetch(`${API}${path}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
  return r.json();
}

type View = 'dashboard' | 'ask' | 'kb' | 'open-questions' | 'sync' | 'jobs' | 'feedback';

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'ask', label: 'Ask', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'kb', label: 'Knowledge Base', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'open-questions', label: 'Open Questions', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'sync', label: 'Sync & Upload', icon: <Upload className="h-4 w-4" /> },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'feedback', label: 'Product Feedback', icon: <MessageCircle className="h-4 w-4" /> },
];

export default function AdminConsole() {
  const [view, setView] = useState<View>('dashboard');
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api('/api/stats').then(setStats).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">LendingGenie</p>
              <p className="text-xs text-slate-400">Ops Console</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                view === n.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white',
              )}
            >
              {n.icon}
              {n.label}
              {n.id === 'open-questions' && stats?.open_questions_count ? (
                <span className="ml-auto text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5">{stats.open_questions_count}</span>
              ) : null}
              {n.id === 'kb' && stats?.unreviewed_count ? (
                <span className="ml-auto text-xs bg-rose-500 text-white rounded-full px-1.5 py-0.5">{stats.unreviewed_count}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700/60">
          <p className="text-xs text-slate-500">LendingGenie KB v1.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {view === 'dashboard' && <DashboardView stats={stats} />}
        {view === 'ask' && <AskView />}
        {view === 'kb' && <KBView />}
        {view === 'open-questions' && <OpenQuestionsView />}
        {view === 'sync' && <SyncView />}
        {view === 'jobs' && <JobsView />}
        {view === 'feedback' && <FeedbackView />}
      </main>
    </div>
  );
}

// --- Page Header ---
function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// --- Dashboard ---
function StatCard({ label, value, icon, color }: { label: string; value: number | string | undefined; icon: ReactNode; color: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', color)}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value ?? '—'}</p>
    </Card>
  );
}

const TRAINING_STEPS = [
  { step: '1', title: 'Upload Sources', desc: 'Import .mbox email archives or sync Microsoft Teams channels to extract real support conversations.', nav: 'Sync & Upload' },
  { step: '2', title: 'Review Q&As', desc: 'AI extracts Q&A pairs from threads. Review, edit, and approve them in the Knowledge Base.', nav: 'Knowledge Base' },
  { step: '3', title: 'Answer Gaps', desc: 'Open Questions captures queries the bot could not answer. Fill them in so the bot improves.', nav: 'Open Questions' },
  { step: '4', title: 'Test the Bot', desc: 'Use the Ask view to test chatbot responses with real loan and credit questions before going live.', nav: 'Ask' },
];

function DashboardView({ stats }: { stats: Record<string, number> | null }) {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your LendingGenie knowledge base" />
      <div className="p-8 space-y-8">
        {/* Welcome banner */}
        <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Bot className="h-6 w-6" />
            <h2 className="text-lg font-semibold">Welcome to the LendingGenie Ops Console</h2>
          </div>
          <p className="text-indigo-100 text-sm max-w-2xl">
            Train your AI chatbot by uploading support emails, syncing Teams channels, and curating Q&amp;A pairs.
            Once ready, the chatbot will help users with credit analysis, loan eligibility, and FAQs.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Q&A Entries" value={stats?.active_qa} icon={<Database className="h-4 w-4 text-indigo-600" />} color="bg-indigo-50" />
          <StatCard label="Embedded Entries" value={stats?.embedded_qa} icon={<Zap className="h-4 w-4 text-emerald-600" />} color="bg-emerald-50" />
          <StatCard label="Threads Processed" value={stats?.threads_total} icon={<FileText className="h-4 w-4 text-violet-600" />} color="bg-violet-50" />
          <StatCard label="Queries (7 days)" value={stats?.queries_7d} icon={<TrendingUp className="h-4 w-4 text-amber-600" />} color="bg-amber-50" />
          <StatCard label="New Entries (7d)" value={stats?.entries_added_7d} icon={<Plus className="h-4 w-4 text-blue-600" />} color="bg-blue-50" />
          <StatCard label="Open Questions" value={stats?.open_questions_count} icon={<HelpCircle className="h-4 w-4 text-rose-600" />} color="bg-rose-50" />
          <StatCard label="Unreviewed" value={stats?.unreviewed_count} icon={<Clock className="h-4 w-4 text-orange-600" />} color="bg-orange-50" />
          <StatCard label="Answer Rate (7d)" value={stats?.answer_rate_7d != null ? `${stats.answer_rate_7d}%` : undefined} icon={<CheckCircle2 className="h-4 w-4 text-teal-600" />} color="bg-teal-50" />
        </div>

        {/* Training guide */}
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-4">Training Guide</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {TRAINING_STEPS.map((s) => (
              <Card key={s.step} className="p-5">
                <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mb-3">{s.step}</div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">{s.title}</h3>
                <p className="text-xs text-slate-500">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Ask ---
type ChatMsg = { role: 'user' | 'assistant'; text: string; queryId?: string; confidence?: number; citations?: { question: string; answer: string; score: number }[]; showCitations?: boolean };

const STARTERS = [
  'What credit score is needed for a personal loan?',
  'How does debt-to-income ratio affect loan approval?',
  'What types of loans does LendingGenie offer?',
  'How can I improve my credit score quickly?',
];

function AskView() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    const question = q.trim();
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const data = await apiPost('/api/ask', { question });
      setMsgs((m) => [...m, {
        role: 'assistant',
        text: data.answer,
        queryId: data.queryId,
        confidence: data.confidence,
        citations: data.citations,
        showCitations: false,
      }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', text: `Error: ${(err as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function rate(queryId: string, rating: 1 | -1) {
    try { await apiPost('/api/feedback', { queryId, rating }); toast('Feedback sent'); } catch {}
  }

  function toggleCitations(idx: number) {
    setMsgs((m) => m.map((msg, i) => i === idx ? { ...msg, showCitations: !msg.showCitations } : msg));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Ask" subtitle="Test the AI chatbot with real lending questions" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <Bot className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1">Test your knowledge base</p>
              <p className="text-sm text-slate-400">Ask a question to see how the chatbot responds</p>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-lg">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left p-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'user' ? (
              <div className="max-w-lg bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">{m.text}</div>
            ) : (
              <div className="max-w-2xl">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{m.text}</div>
                <div className="flex items-center gap-3 mt-2 px-1">
                  {m.confidence != null && (
                    <Badge color={m.confidence >= 0.7 ? 'green' : m.confidence >= 0.5 ? 'amber' : 'red'}>
                      {Math.round(m.confidence * 100)}% confidence
                    </Badge>
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <button onClick={() => toggleCitations(i)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                      {m.showCitations ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {m.citations.length} source{m.citations.length !== 1 ? 's' : ''}
                    </button>
                  )}
                  {m.queryId && (
                    <div className="flex items-center gap-1 ml-auto">
                      <button onClick={() => rate(m.queryId!, 1)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600"><ThumbsUp className="h-3 w-3" /></button>
                      <button onClick={() => rate(m.queryId!, -1)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-600"><ThumbsDown className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
                {m.showCitations && m.citations && (
                  <div className="mt-2 space-y-2">
                    {m.citations.map((c, ci) => (
                      <div key={ci} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-600 mb-1">{c.question}</p>
                        <p className="text-xs text-slate-500 line-clamp-2">{c.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3">
              <Spinner className="text-indigo-500" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-slate-200 bg-white p-4">
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a lending or credit question..." className="flex-1" />
          <Button type="submit" loading={loading} disabled={!input.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}

// --- Knowledge Base ---
type QAEntry = { id: string; question: string; answer: string; category: string | null; tags: string[]; confidence: number; is_reviewed: boolean; source_label: string | null; created_at: string };

function KBView() {
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE = 20;
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [source, setSource] = useState('');
  const [review, setReview] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<QAEntry | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { api('/api/qa/sources').then(setSources).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
    if (search) params.set('q', search);
    if (source) params.set('source', source);
    if (review) params.set('review', review);
    api(`/api/qa?${params}`)
      .then((d) => { setEntries(d.rows ?? d); setTotal(d.total ?? (d.rows ?? d).length); })
      .catch(() => toast('Failed to load KB', 'error'))
      .finally(() => setLoading(false));
  }, [page, search, source, review]);

  async function markReviewed(id: string) {
    try { await apiPost('/api/qa/batch-review', { ids: [id] }); toast('Marked reviewed'); setEntries((e) => e.map((x) => x.id === id ? { ...x, is_reviewed: true } : x)); } catch { toast('Failed', 'error'); }
  }
  async function deactivate(id: string) {
    if (!confirm('Deactivate this entry?')) return;
    try { await apiPost(`/api/qa/${id}/deactivate`, { reason: 'Manually deactivated' }); toast('Deactivated'); setEntries((e) => e.filter((x) => x.id !== id)); setTotal((t) => t - 1); } catch { toast('Failed', 'error'); }
  }

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle={`${total} active entries`}
        action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add Entry</Button>}
      />
      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(0); }} className="flex gap-2 flex-1 min-w-48">
            <Input placeholder="Search questions..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="flex-1" />
            <Button type="submit" variant="secondary" size="sm"><Search className="h-4 w-4" /></Button>
            {search && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSearchInput(''); setPage(0); }}><X className="h-4 w-4" /></Button>}
          </form>
          <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }}>
            <option value="">All sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700" value={review} onChange={(e) => { setReview(e.target.value); setPage(0); }}>
            <option value="">All reviews</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-indigo-500" /></div>
        ) : entries.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-8 w-8" />} title="No entries found" subtitle="Add a manual entry or upload source data to get started." />
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <Card key={e.id} className="overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="mt-0.5 flex-shrink-0 text-slate-400 hover:text-slate-600">
                      {expanded === e.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{e.question}</p>
                      {expanded === e.id && (
                        <div className="mt-3 text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-100 pt-3">{e.answer}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {e.category && <Badge color="blue">{e.category}</Badge>}
                      {e.is_reviewed ? <Badge color="green">Reviewed</Badge> : <Badge color="amber">Unreviewed</Badge>}
                      {!e.is_reviewed && (
                        <button onClick={() => markReviewed(e.id)} title="Mark reviewed" className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600"><CheckCircle2 className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => setEditEntry(e)} title="Edit" className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => deactivate(e.id)} title="Deactivate" className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        <Pagination page={page} pageSize={PAGE} total={total} onPage={setPage} />
      </div>

      {addOpen && <AddEntryModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); setPage(0); setSearch(''); setSearchInput(''); }} />}
      {editEntry && <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={(updated) => { setEntries((e) => e.map((x) => x.id === updated.id ? { ...x, ...updated } : x)); setEditEntry(null); }} />}
    </div>
  );
}

function AddEntryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [cat, setCat] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/api/qa', { question: q, answer: a, category: cat || undefined });
      toast('Entry added');
      onSaved();
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Add KB Entry" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Question</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Generalized question..." required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Answer</label>
          <Textarea value={a} onChange={(e) => setA(e.target.value)} rows={5} placeholder="Clear, reusable answer..." required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category (optional)</label>
          <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="e.g. credit-score, loan-types..." />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Entry</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditEntryModal({ entry, onClose, onSaved }: { entry: QAEntry; onClose: () => void; onSaved: (u: Partial<QAEntry>) => void }) {
  const [q, setQ] = useState(entry.question);
  const [a, setA] = useState(entry.answer);
  const [cat, setCat] = useState(entry.category ?? '');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/api/qa/${entry.id}`, { question: q, answer: a, category: cat || null });
      toast('Updated');
      onSaved({ question: q, answer: a, category: cat || null });
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Edit KB Entry" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Question</label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Answer</label>
          <Textarea value={a} onChange={(e) => setA(e.target.value)} rows={5} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
          <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="e.g. credit-score" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Open Questions ---
type OQ = { id: string; question: string; asked_by: string | null; status: string; created_at: string };

function OpenQuestionsView() {
  const [tab, setTab] = useState<'open' | 'answered' | 'dismissed'>('open');
  const [items, setItems] = useState<OQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [answerTarget, setAnswerTarget] = useState<OQ | null>(null);

  useEffect(() => {
    setLoading(true);
    api(`/api/open-questions?status=${tab}`)
      .then(setItems)
      .catch(() => toast('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [tab]);

  async function dismiss(id: string) {
    try { await apiPost(`/api/open-questions/${id}/dismiss`, {}); toast('Dismissed'); setItems((i) => i.filter((x) => x.id !== id)); } catch { toast('Failed', 'error'); }
  }

  return (
    <div>
      <PageHeader title="Open Questions" subtitle="Questions the bot could not answer — fill them in to improve coverage" />
      <div className="p-6 space-y-4">
        <div className="flex gap-1 border-b border-slate-200">
          {(['open', 'answered', 'dismissed'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-2 text-sm font-medium capitalize transition-colors', tab === t ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700')}>{t}</button>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-indigo-500" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<HelpCircle className="h-8 w-8" />} title={`No ${tab} questions`} subtitle={tab === 'open' ? 'Great! All questions have been addressed.' : ''} />
        ) : (
          <div className="space-y-2">
            {items.map((oq) => (
              <Card key={oq.id} className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{oq.question}</p>
                    {oq.asked_by && <p className="text-xs text-slate-400 mt-0.5">Asked by {oq.asked_by}</p>}
                  </div>
                  {tab === 'open' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setAnswerTarget(oq)}>Answer</Button>
                      <Button size="sm" variant="ghost" onClick={() => dismiss(oq.id)}>Dismiss</Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {answerTarget && (
        <AnswerModal oq={answerTarget} onClose={() => setAnswerTarget(null)} onSaved={() => { setAnswerTarget(null); setItems((i) => i.filter((x) => x.id !== answerTarget?.id)); }} />
      )}
    </div>
  );
}

function AnswerModal({ oq, onClose, onSaved }: { oq: OQ; onClose: () => void; onSaved: () => void }) {
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost(`/api/open-questions/${oq.id}/answer`, { answer });
      toast('Answer saved — entry added to KB');
      onSaved();
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Answer Question" onClose={onClose}>
      <div className="mb-4 p-3 rounded-lg bg-slate-50 text-sm text-slate-700">{oq.question}</div>
      <form onSubmit={save} className="space-y-4">
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} placeholder="Write a clear, reusable answer..." required />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save &amp; Add to KB</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Sync & Upload ---
function SyncView() {
  const [channels, setChannels] = useState<{ label: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api('/api/channels').then(setChannels).catch(() => {}); }, []);

  async function uploadMbox(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`${API}/api/uploads/mbox`, { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Upload failed');
      toast(`Uploaded ${file.name} — processing started`);
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function syncChannel(label: string) {
    setSyncing(label);
    try {
      await apiPost('/api/sync/teams', { channel: label });
      toast(`Sync started for ${label}`);
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSyncing(null); }
  }

  return (
    <div>
      <PageHeader title="Sync & Upload" subtitle="Ingest email archives or sync Teams channels" />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center"><FileText className="h-5 w-5 text-violet-600" /></div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Email Archive (.mbox)</h2>
              <p className="text-xs text-slate-500">Upload exported email threads for AI extraction</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".mbox" className="hidden" onChange={uploadMbox} />
          <Button onClick={() => fileRef.current?.click()} loading={uploading} className="w-full" variant="secondary">
            <Upload className="h-4 w-4" />{uploading ? 'Uploading...' : 'Choose .mbox file'}
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center"><RefreshCw className="h-5 w-5 text-indigo-600" /></div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Microsoft Teams Channels</h2>
              <p className="text-xs text-slate-500">Sync support threads from configured channels</p>
            </div>
          </div>
          {channels.length === 0 ? (
            <p className="text-xs text-slate-400">No channels configured. Set TEAMS_CHANNELS in your .env file.</p>
          ) : (
            <div className="space-y-2">
              {channels.map((c) => (
                <div key={c.label} className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
                  <span className="text-sm text-slate-700">{c.label}</span>
                  <Button size="sm" variant="secondary" loading={syncing === c.label} onClick={() => syncChannel(c.label)}>
                    <RefreshCw className="h-3 w-3" />Sync
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// --- Jobs ---
type Job = { id: string; kind: string; filename: string | null; status: string; thread_count: number | null; qa_count: number | null; created_at: string; completed_at: string | null };

const STATUS_COLOR: Record<string, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  pending: 'gray', parsing: 'blue', extracting: 'amber', complete: 'green', failed: 'red',
};

function JobsView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    api('/api/uploads').then(setJobs).catch(() => toast('Failed to load jobs', 'error')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Upload and sync processing history"
        action={<Button size="sm" variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" />Refresh</Button>}
      />
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner className="h-6 w-6 text-indigo-500" /></div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={<Briefcase className="h-8 w-8" />} title="No jobs yet" subtitle="Upload an .mbox file or trigger a Teams sync to get started." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Kind</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Threads</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Q&amp;As</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{j.filename ?? j.id.slice(0, 8)}</td>
                    <td className="px-4 py-3"><Badge color="violet">{j.kind}</Badge></td>
                    <td className="px-4 py-3"><Badge color={STATUS_COLOR[j.status] ?? 'gray'}>{j.status}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{j.thread_count ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{j.qa_count ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Product Feedback ---
type Note = { id: string; body: string; created_at: string };

function FeedbackView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api('/api/feedback-notes').then(setNotes).catch(() => {}); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const n = await apiPost('/api/feedback-notes', { body: body.trim() });
      setNotes((ns) => [{ id: n.id, body: body.trim(), created_at: n.created_at }, ...ns]);
      setBody('');
      toast('Note added');
    } catch { toast('Failed', 'error'); }
    finally { setSaving(false); }
  }

  async function del(id: string) {
    try { await apiDelete(`/api/feedback-notes/${id}`); setNotes((ns) => ns.filter((n) => n.id !== id)); } catch { toast('Failed', 'error'); }
  }

  return (
    <div>
      <PageHeader title="Product Feedback" subtitle="Team notepad for tracking feedback, ideas, and observations" />
      <div className="p-6 max-w-3xl space-y-6">
        <Card className="p-5">
          <form onSubmit={add} className="space-y-3">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add a note, feedback, or idea..." />
            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!body.trim()}><Plus className="h-4 w-4" />Add Note</Button>
            </div>
          </form>
        </Card>
        {notes.length === 0 ? (
          <EmptyState icon={<MessageCircle className="h-8 w-8" />} title="No notes yet" subtitle="Add a note to start tracking team feedback." />
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <Card key={n.id} className="p-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.body}</p>
                    <p className="text-xs text-slate-400 mt-2">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => del(n.id)} className="p-1 rounded hover:bg-slate-100 text-slate-300 hover:text-rose-500 flex-shrink-0"><X className="h-4 w-4" /></button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Modal ---
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
