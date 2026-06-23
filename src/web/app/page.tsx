'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquareText, Library, Inbox, RefreshCw, Activity, Search, ThumbsUp, ThumbsDown,
  Send, Bot, UploadCloud, Check, X, ChevronDown, Database, CircleDot, Plus, Pencil,
  BarChart2, TrendingUp, AlertCircle, CheckCircle2, Eye, Lightbulb, Trash2,
} from 'lucide-react';
import { Button, Badge, Card, Input, Textarea, Spinner, EmptyState, Pagination, Toaster, toast, cn } from './ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, opts);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    let msg = body || r.statusText;
    try { const j = JSON.parse(body); if (j?.error) msg = typeof j.error === 'string' ? j.error : JSON.stringify(j.error); } catch {}
    throw new Error(msg);
  }
  return r.json();
}
const apiPost = <T = any,>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

type View = 'dashboard' | 'ask' | 'kb' | 'oq' | 'sources' | 'jobs' | 'feedback';
const NAV: { id: View; label: string; icon: typeof Inbox; desc: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart2, desc: 'Training velocity and knowledge base health' },
  { id: 'ask', label: 'Ask', icon: MessageSquareText, desc: 'Test the assistant against the knowledge base' },
  { id: 'kb', label: 'Knowledge Base', icon: Library, desc: 'Browse, search, and curate Q&A entries' },
  { id: 'oq', label: 'Open Questions', icon: Inbox, desc: "Answer gaps the assistant couldn't handle — feeds the KB" },
  { id: 'sources', label: 'Sync & Upload', icon: RefreshCw, desc: 'Pull Teams channels and upload email exports' },
  { id: 'jobs', label: 'Jobs', icon: Activity, desc: 'Monitor ingestion and processing' },
  { id: 'feedback', label: 'Product Feedback', icon: Lightbulb, desc: 'Team notes and product improvement ideas' },
];

const channelColor = (label?: string | null) =>
  label === 'Engineers' ? 'blue' : label === 'Collections and Customer Service' ? 'green' : 'violet';
const confColor = (c: number) => (c >= 0.85 ? 'green' : c >= 0.6 ? 'amber' : 'red') as const;

export default function Home() {
  const [view, setView] = useState<View>('dashboard');
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [kbCount, setKbCount] = useState<number | null>(null);
  const [unreviewedCount, setUnreviewedCount] = useState<number | null>(null);

  const loadCounts = useCallback(async () => {
    try { const oq = await api<any[]>('/api/open-questions?status=open'); setOpenCount(Array.isArray(oq) ? oq.length : 0); } catch {}
    try {
      const s = await api<any>('/api/stats');
      setKbCount(s?.active_qa ?? null);
      setUnreviewedCount(s?.unreviewed_count ?? null);
    } catch {}
  }, []);
  useEffect(() => { loadCounts(); const i = setInterval(loadCounts, 20000); return () => clearInterval(i); }, [loadCounts]);

  const active = NAV.find((n) => n.id === view)!;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900 text-slate-300">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"><Database className="h-5 w-5" /></div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">Cashera KB</div>
            <div className="text-xs text-slate-400">Support Console</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((n) => {
            const Icon = n.icon; const on = view === n.id;
            const badge =
              n.id === 'oq' && openCount != null && openCount > 0 ? openCount
              : n.id === 'kb' && unreviewedCount != null && unreviewedCount > 0 ? unreviewedCount
              : null;
            const badgeCls = n.id === 'oq'
              ? (on ? 'bg-white/20 text-white' : 'bg-amber-500 text-white')
              : (on ? 'bg-white/20 text-white' : 'bg-sky-500 text-white');
            return (
              <button key={n.id} onClick={() => setView(n.id)}
                className={cn('group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  on ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
                <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                <span className="flex-1 text-left">{n.label}</span>
                {badge != null && <span className={cn('rounded-full px-1.5 py-0.5 text-xs font-semibold', badgeCls)}>{badge}</span>}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-xs text-slate-400">
          <div className="flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-emerald-400" />{kbCount != null ? `${kbCount} active entries` : 'Knowledge base'}</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{active.label}</h1>
            <p className="text-sm text-slate-500">{active.desc}</p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-8 py-8">
            {view === 'dashboard' && <DashboardView onNavigate={setView} />}
            {view === 'ask' && <AskView />}
            {view === 'kb' && <KnowledgeView />}
            {view === 'oq' && <OpenQuestionsView onChange={loadCounts} />}
            {view === 'sources' && <SourcesView />}
            {view === 'jobs' && <JobsView />}
            {view === 'feedback' && <FeedbackView />}
          </div>
        </div>
      </main>
      <Toaster />
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────
type Stats = {
  active_qa: number; embedded_qa: number; threads_total: number;
  queries_7d: number; answer_rate_7d: number;
  open_questions_count: number; unreviewed_count: number; entries_added_7d: number;
};

function StatCard({ label, value, sub, color = 'slate', icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  icon?: React.FC<{ className?: string }>;
}) {
  const c = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-rose-600', blue: 'text-brand-600', slate: 'text-slate-700' };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <Icon className={cn('h-5 w-5', c[color])} />}
      </div>
      <p className={cn('mt-2 text-3xl font-bold tracking-tight', c[color])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </Card>
  );
}

const TRAINING_STEPS = [
  {
    n: 1,
    title: 'Open a support email',
    body: 'Start with any real customer email in support@casheracapital.com. Pick a thread where a customer asked a question — common topics are applications, funding timelines, repayment, and eligibility.',
    cta: null,
  },
  {
    n: 2,
    title: 'Paste the question into Ask',
    body: "Copy the customer's question word-for-word into the Ask tab and hit Send. See exactly how the assistant would respond to a real customer.",
    cta: { label: 'Go to Ask', view: 'ask' as View },
  },
  {
    n: 3,
    title: 'Good answer? Give it a thumbs up',
    body: "If the assistant's answer is accurate and complete, click the 👍 button below the response. This confirms coverage and helps track which topics are well-handled.",
    cta: null,
  },
  {
    n: 4,
    title: 'Wrong or incomplete? Correct it',
    body: "If the answer is off or missing key info, click 👎. A correction panel opens — write what the answer should have been. It gets quality-checked and added to the KB automatically.",
    cta: null,
  },
  {
    n: 5,
    title: 'Review auto-extracted entries',
    body: 'Entries pulled from past emails are auto-extracted and may need a quick accuracy check. Filter the Knowledge Base by "Needs review" and scan for anything that looks wrong or outdated.',
    cta: { label: 'Go to Knowledge Base', view: 'kb' as View },
  },
  {
    n: 6,
    title: 'Fill knowledge gaps',
    body: "When the assistant can't answer a real question, it lands in Open Questions. Writing answers here is the highest-value thing you can do — each one trains the assistant for future customers.",
    cta: { label: 'Go to Open Questions', view: 'oq' as View },
  },
];

function DashboardView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => { try { setStats(await api<Stats>('/api/stats')); } catch {} finally { setLoading(false); } };
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const deadline = new Date('2026-06-26T00:00:00');
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000));

  const rate = stats?.answer_rate_7d ?? 0;
  const rateColor = rate >= 75 ? 'green' : rate >= 50 ? 'amber' : 'red';

  return (
    <div className="space-y-6">

      {/* ── Welcome banner ── */}
      <div className="rounded-xl bg-brand-600 px-7 py-6 text-white">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-snug">Welcome, Support Team!</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-100">
              Thanks for taking the time to train the Cashera Support Knowledge Base. Your work here
              directly improves how our AI assistant answers real customer questions — every correction,
              review, and gap you fill makes it smarter for the next customer.
            </p>
            <p className="mt-3 text-sm text-brand-200">
              Training sprint runs through <span className="font-semibold text-white">June 26, 2026</span>.
              Focus on testing real support emails from{' '}
              <span className="font-semibold text-white">support@casheracapital.com</span> and following
              the steps below.
            </p>
          </div>
          {daysLeft > 0 ? (
            <div className="shrink-0 rounded-xl bg-white/10 px-5 py-4 text-center backdrop-blur-sm">
              <div className="text-3xl font-bold tabular-nums">{daysLeft}</div>
              <div className="mt-0.5 text-xs font-medium text-brand-200">days left</div>
              <div className="text-xs text-brand-300">until Jun 26</div>
            </div>
          ) : (
            <div className="shrink-0 rounded-xl bg-white/10 px-5 py-4 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-300" />
              <div className="mt-1 text-xs font-medium text-brand-200">Sprint complete</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Step-by-step training guide ── */}
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <TrendingUp className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">How to train the KB from support emails</h3>
        </div>
        <div className="space-y-0 divide-y divide-slate-100">
          {TRAINING_STEPS.map((s) => (
            <div key={s.n} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {s.n}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{s.body}</p>
                {s.cta && (
                  <button
                    onClick={() => onNavigate(s.cta!.view)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100">
                    {s.cta.label} →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Training progress metrics ── */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400"><Spinner className="h-6 w-6" /></div>
      ) : stats ? (
        <>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Training progress</h3>
            <p className="text-xs text-slate-400">Refreshes every 30 seconds.</p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Active KB entries" value={stats.active_qa} sub="embedded and searchable" color="blue" icon={Library} />
            <StatCard label="Answer rate (7d)" value={`${rate}%`} sub="of questions answered" color={rateColor} icon={TrendingUp} />
            <StatCard label="Queries this week" value={stats.queries_7d} sub="total questions asked" color="slate" icon={MessageSquareText} />
            <StatCard label="Added this week" value={stats.entries_added_7d} sub="new KB entries" color="green" icon={Plus} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className={cn('p-5', stats.open_questions_count > 0 && 'border-amber-200 bg-amber-50')}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">Open questions</p>
                <AlertCircle className={cn('h-5 w-5', stats.open_questions_count > 0 ? 'text-amber-500' : 'text-slate-300')} />
              </div>
              <p className={cn('mt-2 text-3xl font-bold tracking-tight', stats.open_questions_count > 0 ? 'text-amber-600' : 'text-slate-400')}>
                {stats.open_questions_count}
              </p>
              <p className="mt-1 text-xs text-slate-400">gaps waiting for your answer</p>
              {stats.open_questions_count > 0 && (
                <Button size="sm" variant="outline" className="mt-3 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => onNavigate('oq')}>
                  Answer now
                </Button>
              )}
            </Card>

            <Card className={cn('p-5', stats.unreviewed_count > 0 && 'border-sky-200 bg-sky-50')}>
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">Needs review</p>
                <Eye className={cn('h-5 w-5', stats.unreviewed_count > 0 ? 'text-sky-500' : 'text-slate-300')} />
              </div>
              <p className={cn('mt-2 text-3xl font-bold tracking-tight', stats.unreviewed_count > 0 ? 'text-sky-600' : 'text-slate-400')}>
                {stats.unreviewed_count}
              </p>
              <p className="mt-1 text-xs text-slate-400">auto-extracted entries not yet verified</p>
              {stats.unreviewed_count > 0 && (
                <Button size="sm" variant="outline" className="mt-3 border-sky-300 text-sky-700 hover:bg-sky-100" onClick={() => onNavigate('kb')}>
                  Review now
                </Button>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500">Embedded</p>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">{stats.embedded_qa}</p>
              <p className="mt-1 text-xs text-slate-400">of {stats.active_qa} entries indexed for search</p>
              {stats.active_qa > 0 && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(100, Math.round((stats.embedded_qa / stats.active_qa) * 100))}%` }} />
                </div>
              )}
            </Card>
          </div>
        </>
      ) : (
        <EmptyState icon={<BarChart2 className="h-10 w-10" />} title="Stats unavailable" subtitle="Make sure the API is running." />
      )}
    </div>
  );
}

// ─── Ask ─────────────────────────────────────────────────────
let _mid = 0;
const newId = () => `m${++_mid}`;
type ChatMsg = {
  id: string; role: 'user' | 'assistant'; text: string;
  queryId?: string; confidence?: number; sufficientContext?: boolean; escalation?: boolean;
  citations?: { qaId: string; question: string; similarity: number }[]; rated?: 1 | -1;
};
const GREETING = "Hi! I'm the Cashera support assistant. Ask me about our products, accounts, fees, timelines, or processes — I'm happy to help.";

const STARTER_QUESTIONS = [
  'How much can I borrow?',
  'How do I apply for a cash advance?',
  'When will I receive my funds?',
  'How does repayment work?',
  'Is there a credit score check?',
  'What documents do I need?',
  'Am I eligible if I drive for Uber or DoorDash?',
  'What are the fees or factor rate?',
];

function AskView() {
  const [messages, setMessages] = useState<ChatMsg[]>([{ id: newId(), role: 'assistant', text: GREETING }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const isBlank = messages.length === 1;

  async function send(q?: string) {
    const text = (q ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { id: newId(), role: 'user', text }]);
    setLoading(true);
    try {
      const d = await apiPost<{ queryId: string; answer: string; confidence: number; sufficientContext: boolean; escalation?: boolean; citations: { qaId: string; question: string; similarity: number }[] }>('/api/ask', { question: text });
      setMessages((m) => [...m, { id: newId(), role: 'assistant', text: d.answer, queryId: d.queryId, confidence: d.confidence, sufficientContext: d.sufficientContext, escalation: d.escalation, citations: d.citations }]);
    } catch (e) {
      setMessages((m) => [...m, { id: newId(), role: 'assistant', text: 'Sorry — I had trouble reaching the server just now. Please try again in a moment.' }]);
      toast((e as Error).message, 'error');
    } finally { setLoading(false); }
  }

  async function rate(msgId: string, queryId: string, v: 1 | -1) {
    try {
      await apiPost('/api/feedback', { queryId, rating: v });
      setMessages((m) => m.map((x) => x.id === msgId ? { ...x, rated: v } : x));
      if (v === 1) toast('Thanks for the feedback');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  function clearChat() { setMessages([{ id: newId(), role: 'assistant', text: 'New conversation started. How can we help?' }]); }

  return (
    <Card className="flex h-[calc(100vh-165px)] min-h-[460px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white"><Bot className="h-3.5 w-3.5" /></span>
          Cashera Support
        </div>
        <Button variant="ghost" size="sm" onClick={clearChat}>Clear</Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((m, idx) => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">{m.text}</div>
              </div>
            );
          }
          const prevQ = idx > 0 && messages[idx - 1]?.role === 'user' ? messages[idx - 1].text : undefined;
          return <AssistantBubble key={m.id} msg={m} question={prevQ} onRate={rate} />;
        })}
        {loading && <TypingBubble />}
        <div ref={endRef} />
      </div>

      {/* Starter chips — only when chat is blank */}
      {isBlank && (
        <div className="border-t border-slate-100 px-4 pb-2 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_QUESTIONS.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-end gap-2">
          <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your question…" className="max-h-32 min-h-[42px] resize-none" />
          <Button onClick={() => send()} loading={loading} className="h-[42px] px-3"><Send className="h-4 w-4" /></Button>
        </div>
        <p className="mt-1.5 pl-1 text-xs text-slate-400">Enter to send · Shift+Enter for a new line</p>
      </div>
    </Card>
  );
}

function AssistantBubble({ msg, question, onRate }: {
  msg: ChatMsg;
  question?: string;
  onRate: (id: string, qid: string, v: 1 | -1) => void;
}) {
  const [cites, setCites] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);

  async function handleRate(v: 1 | -1) {
    if (!msg.queryId) return;
    await onRate(msg.id, msg.queryId, v);
    // On thumbs-down, open the correction panel if we have the question
    if (v === -1 && question && !correcting) setCorrecting(true);
  }

  async function saveCorrection() {
    if (!question || !correctionText.trim()) return;
    setSavingCorrection(true);
    try {
      await apiPost('/api/qa', { question, answer: correctionText.trim() });
      toast('Correction saved to the knowledge base');
      setCorrecting(false);
      setCorrectionText('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setSavingCorrection(false); }
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-brand-600">
        <Bot className="h-4 w-4" />
      </span>
      <div className="max-w-[85%] min-w-0 flex-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-100">
          {msg.text}
        </div>

        {msg.queryId && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-1 text-xs text-slate-400">
            {msg.escalation && <Badge color="blue">human handoff</Badge>}
            {msg.sufficientContext === false && !msg.escalation && <Badge color="amber">flagged for follow-up</Badge>}
            {typeof msg.confidence === 'number' && <span>confidence {(msg.confidence * 100).toFixed(0)}%</span>}
            <button onClick={() => handleRate(1)}
              className={cn('rounded p-1 transition-colors hover:bg-slate-100', msg.rated === 1 && 'text-emerald-600')}
              title="Helpful">
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => handleRate(-1)}
              className={cn('rounded p-1 transition-colors hover:bg-slate-100', msg.rated === -1 && 'text-rose-600')}
              title="Not helpful — correct it">
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
            {msg.citations && msg.citations.length > 0 && (
              <button onClick={() => setCites((s) => !s)} className="flex items-center gap-1 hover:text-slate-600">
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', cites && 'rotate-180')} />
                {msg.citations.length} source{msg.citations.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        {cites && msg.citations && (
          <ul className="mt-1.5 space-y-1 pl-1">
            {msg.citations.map((c) => (
              <li key={c.qaId} className="flex items-center gap-2 text-xs text-slate-500">
                <Badge color="gray">{(c.similarity * 100).toFixed(0)}%</Badge>
                <span>{c.question}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Correction panel — opens on thumbs-down */}
        {correcting && (
          <div className="mt-2 animate-fade-in rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-rose-700">What should the answer have been?</p>
            <p className="mb-2 text-xs text-rose-500">Your correction will be quality-checked and added to the knowledge base so the assistant improves.</p>
            <Textarea rows={3} value={correctionText} onChange={(e) => setCorrectionText(e.target.value)}
              placeholder="Write the correct answer…"
              className="border-rose-200 bg-white text-sm focus:ring-rose-400" />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={saveCorrection} loading={savingCorrection}
                className="bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500">
                <Check className="h-3.5 w-3.5" />Save correction
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCorrecting(false); setCorrectionText(''); }} disabled={savingCorrection}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-brand-600"><Bot className="h-4 w-4" /></span>
      <div className="rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  );
}

// ─── Knowledge Base ──────────────────────────────────────────
type QA = {
  id: string; question: string; answer: string; category: string | null;
  tags: string[]; source_label: string | null; origin: string;
  extraction_confidence: number; is_reviewed: boolean; created_at: string;
};
const PAGE = 20;

function KnowledgeView() {
  const [items, setItems] = useState<QA[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'' | 'unreviewed'>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [nq, setNq] = useState(''); const [na, setNa] = useState(''); const [ncat, setNcat] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [eq, setEq] = useState(''); const [ea, setEa] = useState(''); const [ecat, setEcat] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
      if (search) qs.set('q', search);
      if (source) qs.set('source', source);
      if (reviewFilter) qs.set('review', reviewFilter);
      const d = await api<{ items: QA[]; total: number }>(`/api/qa?${qs}`);
      setItems(d.items ?? []); setTotal(d.total ?? 0);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setLoading(false); }
  }, [page, search, source, reviewFilter]);

  useEffect(() => { load(); }, [load]);
  const loadSources = useCallback(() => { api<string[]>('/api/qa/sources').then(setSources).catch(() => {}); }, []);
  useEffect(() => { loadSources(); }, [loadSources]);

  function runSearch() { setPage(0); setSearch(searchInput); }

  async function deactivate(id: string) {
    const reason = prompt('Why deactivate this entry?') ?? '';
    try { await apiPost(`/api/qa/${id}/deactivate`, { reason }); toast('Entry deactivated'); load(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  async function addEntry() {
    if (nq.trim().length < 3 || !na.trim()) { toast('Add a question and an answer', 'error'); return; }
    setSaving(true);
    try {
      await apiPost('/api/qa', { question: nq, answer: na, category: ncat.trim() || undefined });
      toast('Added to the knowledge base');
      setNq(''); setNa(''); setNcat(''); setAdding(false);
      setPage(0); load(); loadSources();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  }

  function startEdit(it: QA) { setEditId(it.id); setEq(it.question); setEa(it.answer); setEcat(it.category ?? ''); }

  async function saveEdit(id: string) {
    if (eq.trim().length < 3 || !ea.trim()) { toast('Question and answer are required', 'error'); return; }
    setSavingEdit(true);
    try {
      await api(`/api/qa/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: eq, answer: ea, category: ecat.trim() || null }) });
      toast('Entry updated');
      setEditId(null); load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSavingEdit(false); }
  }

  async function markOneReviewed(id: string) {
    setReviewingId(id);
    try { await apiPost('/api/qa/batch-review', { ids: [id] }); toast('Marked as reviewed'); load(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setReviewingId(null); }
  }

  async function markAllReviewed() {
    const unreviewed = items.filter((i) => !i.is_reviewed);
    if (!unreviewed.length) { toast('All visible entries are already reviewed'); return; }
    setMarkingAll(true);
    try {
      await apiPost('/api/qa/batch-review', { ids: unreviewed.map((i) => i.id) });
      toast(`${unreviewed.length} entr${unreviewed.length === 1 ? 'y' : 'ies'} marked as reviewed`);
      load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setMarkingAll(false); }
  }

  const unreviewedOnPage = items.filter((i) => !i.is_reviewed).length;

  return (
    <div className="space-y-4">
      {/* Search + Add row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search questions and answers…" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }} />
        </div>
        <Button variant="outline" onClick={runSearch}>Search</Button>
        <Button onClick={() => setAdding((a) => !a)}><Plus className="h-4 w-4" />Add entry</Button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-slate-500">Channel</span>
        <Chip on={source === ''} onClick={() => { setPage(0); setSource(''); }}>All</Chip>
        {sources.map((s) => <Chip key={s} on={source === s} onClick={() => { setPage(0); setSource(s); }}>{s}</Chip>)}
        <span className="mx-1.5 h-4 w-px bg-slate-200" />
        <Chip on={reviewFilter === 'unreviewed'} onClick={() => { setPage(0); setReviewFilter((f) => f === 'unreviewed' ? '' : 'unreviewed'); }}>
          <Eye className="mr-1 inline h-3.5 w-3.5" />Needs review
        </Chip>
        {reviewFilter === 'unreviewed' && unreviewedOnPage > 0 && (
          <Button size="sm" variant="outline" loading={markingAll} onClick={markAllReviewed}
            className="ml-1 border-sky-300 text-sky-700 hover:bg-sky-50">
            <CheckCircle2 className="h-3.5 w-3.5" />Mark all as reviewed
          </Button>
        )}
      </div>

      {/* Add-entry form */}
      {adding && (
        <Card className="animate-fade-in space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Plus className="h-4 w-4 text-brand-600" />Add a knowledge base entry</div>
          <p className="text-xs text-slate-400">Entries are reviewed and refined for quality (clarity, voice, category) before being added. Off-topic drafts are declined.</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Question</label>
            <Textarea rows={2} value={nq} onChange={(e) => setNq(e.target.value)} placeholder="e.g. How long do ACH transfers take to settle?" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Answer</label>
            <Textarea rows={4} value={na} onChange={(e) => setNa(e.target.value)} placeholder="Write the answer the assistant should give customers…" />
          </div>
          <div className="flex items-end gap-3">
            <div className="w-56">
              <label className="mb-1 block text-xs font-medium text-slate-500">Category (optional)</label>
              <Input value={ncat} onChange={(e) => setNcat(e.target.value)} placeholder="e.g. payments" />
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
              <Button onClick={addEntry} loading={saving}><Check className="h-4 w-4" />Add to knowledge base</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Entry list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400"><Spinner className="h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Library className="h-10 w-10" />} title="No entries match" subtitle="Try a different search or channel filter, or sync a source." />
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const long = it.answer.length > 280; const open = expanded[it.id];

            if (editId === it.id) {
              return (
                <Card key={it.id} className="animate-fade-in space-y-3 p-4 ring-2 ring-brand-500/30">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Pencil className="h-4 w-4 text-brand-600" />Edit entry</div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Question</label>
                    <Textarea rows={2} value={eq} onChange={(e) => setEq(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Answer</label>
                    <Textarea rows={5} value={ea} onChange={(e) => setEa(e.target.value)} />
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="w-56">
                      <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
                      <Input value={ecat} onChange={(e) => setEcat(e.target.value)} placeholder="optional" />
                    </div>
                    <div className="ml-auto flex gap-2">
                      <Button variant="ghost" onClick={() => setEditId(null)} disabled={savingEdit}>Cancel</Button>
                      <Button onClick={() => saveEdit(it.id)} loading={savingEdit}><Check className="h-4 w-4" />Save changes</Button>
                    </div>
                  </div>
                </Card>
              );
            }

            return (
              <Card key={it.id} className={cn('p-4', !it.is_reviewed && 'border-sky-200')}>
                {!it.is_reviewed && (
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-sky-600">
                    <Eye className="h-3.5 w-3.5" />Auto-extracted — not yet reviewed
                  </div>
                )}
                <p className="font-medium text-slate-900">{it.question}</p>
                <p className={cn('mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600', long && !open && 'line-clamp-3')}>{it.answer}</p>
                {long && (
                  <button onClick={() => setExpanded((e) => ({ ...e, [it.id]: !open }))} className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                    {open ? 'Show less' : 'Show more'}
                  </button>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {it.source_label && <Badge color={channelColor(it.source_label)}>{it.source_label}</Badge>}
                  {it.origin === 'curated' && <Badge color="violet">curated</Badge>}
                  {it.category && <Badge color="gray">{it.category}</Badge>}
                  <Badge color={confColor(it.extraction_confidence ?? 0)}>conf {((it.extraction_confidence ?? 0) * 100).toFixed(0)}%</Badge>
                  <div className="ml-auto flex gap-1">
                    {!it.is_reviewed && (
                      <Button variant="ghost" size="sm" loading={reviewingId === it.id}
                        onClick={() => markOneReviewed(it.id)}
                        className="text-sky-600 hover:bg-sky-50 hover:text-sky-700">
                        <CheckCircle2 className="h-4 w-4" />Review
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => startEdit(it)}><Pencil className="h-4 w-4" />Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => deactivate(it.id)} className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" />Deactivate</Button>
                  </div>
                </div>
              </Card>
            );
          })}
          <Pagination page={page} pageSize={PAGE} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('flex items-center rounded-full border px-3 py-1 text-sm transition-colors',
      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>{children}</button>
  );
}

// ─── Open Questions ──────────────────────────────────────────
type OQ = { id: string; question: string; ask_count: number; reason: string; best_confidence: number | null; created_at: string };
const reasonLabel = (r: string) => r === 'no_matching_context' ? 'no match in KB' : r === 'insufficient_context' ? 'insufficient context' : 'low confidence';

function OpenQuestionsView({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<OQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api<OQ[]>('/api/open-questions?status=open'); setItems(Array.isArray(d) ? d : []); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function answer(id: string) {
    const a = (drafts[id] ?? '').trim();
    if (!a) { toast('Write an answer first', 'error'); return; }
    setBusy(id);
    try {
      await apiPost(`/api/open-questions/${id}/answer`, { answer: a, answeredBy: 'curator' });
      toast('Saved to knowledge base — the assistant can answer this now');
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
      load(); onChange();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }

  async function dismiss(id: string) {
    setBusy(id);
    try { await apiPost(`/api/open-questions/${id}/dismiss`, {}); toast('Dismissed'); load(); onChange(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }

  if (loading) return <div className="flex items-center justify-center py-16 text-slate-400"><Spinner className="h-6 w-6" /></div>;
  if (items.length === 0) return <EmptyState icon={<Inbox className="h-10 w-10" />} title="No open questions" subtitle="When the assistant can't confidently answer something, it lands here for you to answer." />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Answer a question and it becomes a curated entry in the knowledge base. Most-asked appear first.</p>
      {items.map((it) => (
        <Card key={it.id} className="p-4">
          <p className="font-medium text-slate-900">{it.question}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color="gray">asked {it.ask_count}×</Badge>
            <Badge color="amber">{reasonLabel(it.reason)}</Badge>
            {it.best_confidence != null && <Badge color="gray">best {(it.best_confidence * 100).toFixed(0)}%</Badge>}
          </div>
          <Textarea className="mt-3" rows={3} value={drafts[it.id] ?? ''} placeholder="Write the answer to store in the knowledge base…"
            onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))} />
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={() => answer(it.id)} loading={busy === it.id}><Check className="h-4 w-4" />Save to knowledge base</Button>
            <Button variant="ghost" onClick={() => dismiss(it.id)} disabled={busy === it.id}>Dismiss</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Product Feedback ────────────────────────────────────────
type FeedbackNote = { id: string; body: string; created_at: string };

function noteAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function FeedbackView() {
  const [notes, setNotes] = useState<FeedbackNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setNotes(await api<FeedbackNote[]>('/api/feedback-notes')); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await apiPost('/api/feedback-notes', { body: draft.trim() });
      setDraft('');
      load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  }

  async function deleteNote(id: string) {
    setDeletingId(id);
    try {
      await api(`/api/feedback-notes/${id}`, { method: 'DELETE' });
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch (e) { toast((e as Error).message, 'error'); } finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-5">
      {/* Composer */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Lightbulb className="h-4 w-4 text-brand-600" />
          Add a note or idea
        </div>
        <Textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="Something broken, confusing, or missing? A feature idea? A pattern you keep seeing in support emails? Write it here."
          className="text-sm"
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">Ctrl + Enter to submit</p>
          <Button onClick={submit} loading={saving} disabled={!draft.trim()}>
            <Check className="h-4 w-4" />Save note
          </Button>
        </div>
      </Card>

      {/* Notes list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400"><Spinner className="h-6 w-6" /></div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-10 w-10" />}
          title="No notes yet"
          subtitle="Add your first note above — observations, ideas, or anything the product team should know."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <Card key={n.id} className="group p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{n.body}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400" title={new Date(n.created_at).toLocaleString()}>
                  {noteAge(n.created_at)}
                </span>
                <button
                  onClick={() => deleteNote(n.id)}
                  disabled={deletingId === n.id}
                  className="flex items-center gap-1 rounded p-1 text-xs text-slate-300 opacity-0 transition-all hover:text-rose-500 group-hover:opacity-100 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sync & Upload ───────────────────────────────────────────
function SourcesView() {
  const [channels, setChannels] = useState<{ label: string }[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { api<{ label: string }[]>('/api/channels').then(setChannels).catch(() => {}); }, []);

  async function sync(channel?: string) {
    setBusy(channel ?? 'all');
    try { const r = await apiPost<{ queued: { channel: string }[] }>('/api/sync/teams', channel ? { channel } : {}); toast(`Queued ${r.queued.length} sync${r.queued.length === 1 ? '' : 's'} — see Jobs`); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }

  async function upload(f: File) {
    setBusy('mbox');
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch(`${API}/api/uploads/mbox`, { method: 'POST', body: fd });
      const j = await r.json();
      toast(`Upload queued (${String(j.uploadId).slice(0, 8)}) — see Jobs`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-brand-600" /><h2 className="font-semibold text-slate-900">Teams channels</h2></div>
        <p className="mt-1 text-sm text-slate-500">Pull Q&A-shaped threads from configured channels. Casual chat is filtered out automatically; already-seen threads are skipped.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {channels.map((c) => (
            <Button key={c.label} variant="outline" loading={busy === c.label} onClick={() => sync(c.label)}>
              <Badge color={channelColor(c.label)}>{c.label}</Badge>Sync
            </Button>
          ))}
          <Button loading={busy === 'all'} onClick={() => sync()}>Sync all channels</Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-brand-600" /><h2 className="font-semibold text-slate-900">Upload Gmail export (.mbox)</h2></div>
        <p className="mt-1 text-sm text-slate-500">From <a className="text-brand-600 hover:underline" href="https://takeout.google.com" target="_blank" rel="noreferrer">Google Takeout</a> → Mail → export → unzip → upload the .mbox. Multi-GB files work.</p>
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500 hover:bg-slate-100">
          <UploadCloud className="h-5 w-5" />
          {busy === 'mbox' ? 'Uploading…' : 'Click to choose a .mbox file'}
          <input type="file" accept=".mbox" className="hidden" disabled={busy === 'mbox'} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </Card>
    </div>
  );
}

// ─── Jobs ────────────────────────────────────────────────────
type Job = { id: string; kind: string; filename: string | null; status: string; thread_count: number; qa_count: number; error_message: string | null; created_at: string };

function JobsView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    const l = () => api<Job[]>('/api/uploads').then((d) => setJobs(Array.isArray(d) ? d : [])).catch(() => {});
    l(); const i = setInterval(l, 5000); return () => clearInterval(i);
  }, []);
  const statusColor = (s: string) => s === 'complete' ? 'green' : s === 'failed' ? 'red' : s === 'pending' ? 'gray' : 'amber';

  if (jobs.length === 0) return <EmptyState icon={<Activity className="h-10 w-10" />} title="No jobs yet" subtitle="Sync a channel or upload an export to see processing here." />;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold">Source</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold text-right">Threads</th>
            <th className="px-4 py-3 font-semibold text-right">Q&A</th>
            <th className="px-4 py-3 font-semibold text-right">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{j.kind === 'teams_sync' ? 'Teams' : 'Email'}</div>
                <div className="text-xs text-slate-400">{j.filename ?? '—'}</div>
              </td>
              <td className="px-4 py-3">
                <Badge color={statusColor(j.status)}>{j.status}</Badge>
                {j.error_message && <div className="mt-1 max-w-xs truncate text-xs text-rose-500" title={j.error_message}>{j.error_message}</div>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{j.thread_count}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{j.qa_count}</td>
              <td className="px-4 py-3 text-right text-xs text-slate-400">{new Date(j.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
