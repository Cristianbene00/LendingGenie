'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Send, Bot, ThumbsUp, ThumbsDown, ChevronDown,
  ChevronRight, Sparkles, Shield, TrendingUp, CreditCard, Home, Briefcase,
  Car, AlertCircle, CheckCircle2, HelpCircle, ExternalLink,
} from 'lucide-react';
import { Button, Badge, Card, Textarea, Toaster, toast, cn } from './ui';

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

type View = 'chat' | 'faq' | 'offers';

export default function Home() {
  const [view, setView] = useState<View>('chat');
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 leading-tight">LendingGenie</div>
              <div className="text-xs text-slate-400">AI Credit &amp; Loan Assistant</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {(['chat', 'faq', 'offers'] as View[]).map((id) => (
              <button key={id} onClick={() => setView(id)}
                className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-colors capitalize',
                  view === id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                {id === 'offers' ? 'Loan Offers' : id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        {view === 'chat' && <ChatView />}
        {view === 'faq' && <FaqView />}
        {view === 'offers' && <OffersView />}
      </main>
      <Toaster />
    </div>
  );
}

let _mid = 0;
const newId = () => `m${++_mid}`;

type ChatMsg = {
  id: string; role: 'user' | 'assistant'; text: string;
  queryId?: string; confidence?: number; sufficientContext?: boolean; escalation?: boolean;
  citations?: { qaId: string; question: string; similarity: number }[]; rated?: 1 | -1;
};

const GREETING = "Hi! I'm LendingGenie, your AI credit and loan assistant. Ask me anything about your credit score, how to improve it, loan options, or what factors affect your eligibility.";

const STARTER_QUESTIONS = [
  'What does my credit score mean for loan eligibility?',
  'How can I improve my credit score quickly?',
  'What is a debt-to-income ratio?',
  'Can I get a loan with bad credit?',
  'What factors affect my credit score the most?',
  'What is the difference between secured and unsecured loans?',
  'How does a hard inquiry affect my credit?',
  'What credit score do I need for a personal loan?',
];

function ChatView() {
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
      const d = await apiPost<{ queryId: string; answer: string; confidence: number; sufficientContext: boolean; escalation?: boolean; citations: { qaId: string; question: string; similarity: number }[]; }>('/api/ask', { question: text });
      setMessages((m) => [...m, { id: newId(), role: 'assistant', text: d.answer, queryId: d.queryId, confidence: d.confidence, sufficientContext: d.sufficientContext, escalation: d.escalation, citations: d.citations }]);
    } catch (e) {
      setMessages((m) => [...m, { id: newId(), role: 'assistant', text: 'Sorry, I had trouble reaching the server. Please try again in a moment.' }]);
      toast((e as Error).message, 'error');
    } finally { setLoading(false); }
  }

  async function rate(msgId: string, queryId: string, v: 1 | -1) {
    try {
      await apiPost('/api/feedback', { queryId, rating: v });
      setMessages((m) => m.map((x) => x.id === msgId ? { ...x, rated: v } : x));
      if (v === 1) toast('Thanks for the feedback!');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
      {isBlank && (
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Understand your credit.<br />Find the right loan.</h1>
          <p className="mt-2 text-sm text-slate-500">Ask me anything about your credit situation, score, or loan options.</p>
        </div>
      )}
      <Card className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: isBlank ? 'auto' : '520px', maxHeight: '680px' }}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white"><Bot className="h-3.5 w-3.5" /></span>
            LendingGenie Assistant
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMessages([{ id: newId(), role: 'assistant', text: 'New conversation started. How can I help with your credit or loan questions?' }])}>Clear</Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {messages.map((m, idx) => {
            if (m.role === 'user') return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">{m.text}</div>
              </div>
            );
            return <AssistantBubble key={m.id} msg={m} onRate={rate} />;
          })}
          {loading && <TypingBubble />}
          <div ref={endRef} />
        </div>
        {isBlank && (
          <div className="border-t border-slate-100 px-4 pb-2 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Try asking</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_QUESTIONS.map((q) => (
                <button key={q} onClick={() => send(q)} disabled={loading}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50">{q}</button>
              ))}
            </div>
          </div>
        )}
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-end gap-2">
            <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about your credit or loans..." className="max-h-32 min-h-[42px] resize-none" />
            <Button onClick={() => send()} loading={loading} className="h-[42px] px-3"><Send className="h-4 w-4" /></Button>
          </div>
          <p className="mt-1.5 pl-1 text-xs text-slate-400">Enter to send, Shift+Enter for a new line</p>
        </div>
      </Card>
      <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-brand-400" />No credit pull required</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />AI-powered analysis</span>
        <span className="flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5 text-brand-400" />Free to use</span>
      </div>
    </div>
  );
}

function AssistantBubble({ msg, onRate }: { msg: ChatMsg; onRate: (id: string, qid: string, v: 1 | -1) => void }) {
  const [cites, setCites] = useState(false);
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Bot className="h-4 w-4" /></span>
      <div className="max-w-[85%] min-w-0 flex-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200 shadow-sm">{msg.text}</div>
        {msg.queryId && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-1 text-xs text-slate-400">
            {msg.escalation && <Badge color="blue">connecting to team</Badge>}
            {msg.sufficientContext === false && !msg.escalation && <Badge color="amber">limited info available</Badge>}
            <button onClick={() => onRate(msg.id, msg.queryId!, 1)} className={cn('rounded p-1 transition-colors hover:bg-slate-100', msg.rated === 1 && 'text-emerald-600')} title="Helpful"><ThumbsUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => onRate(msg.id, msg.queryId!, -1)} className={cn('rounded p-1 transition-colors hover:bg-slate-100', msg.rated === -1 && 'text-rose-600')} title="Not helpful"><ThumbsDown className="h-3.5 w-3.5" /></button>
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
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Bot className="h-4 w-4" /></span>
      <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 ring-1 ring-slate-200 shadow-sm">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  );
}

type QA = { id: string; question: string; answer: string; category: string | null };
const STATIC_FAQS: QA[] = [
  { id: 's1', question: 'What is a credit score and why does it matter?', answer: 'A credit score is a number (typically 300-850) that summarizes how reliably you have repaid debt in the past. Lenders use it to decide whether to approve your loan and what interest rate to offer. Higher scores mean better loan terms.', category: 'Credit Basics' },
  { id: 's2', question: 'What factors make up my credit score?', answer: 'Your FICO score is calculated from five factors: payment history (35%), amounts owed (30%), length of credit history (15%), new credit (10%), and credit mix (10%). Payment history and utilization have the biggest impact.', category: 'Credit Basics' },
  { id: 's3', question: 'How can I improve my credit score quickly?', answer: 'The fastest wins are paying down credit card balances to reduce your utilization ratio, making sure all accounts are current (no missed payments), and disputing any errors on your credit report. Avoid opening new accounts unnecessarily.', category: 'Credit Improvement' },
  { id: 's4', question: 'What credit score do I need to get a personal loan?', answer: 'Most traditional lenders prefer a score of 670 or above for personal loans. Some lenders work with scores as low as 580, though you may face higher interest rates. A score above 750 typically gets the best rates available.', category: 'Loan Eligibility' },
  { id: 's5', question: 'What is a debt-to-income ratio?', answer: 'Your debt-to-income (DTI) ratio is your total monthly debt payments divided by your gross monthly income. Lenders use it to gauge affordability. Most prefer a DTI below 43%, and the lower the better for getting approved.', category: 'Loan Eligibility' },
  { id: 's6', question: 'Does applying for a loan hurt my credit score?', answer: 'Submitting a formal loan application triggers a hard inquiry, which can temporarily lower your score by a few points. Rate shopping with multiple lenders within a 14-45 day window usually counts as a single inquiry.', category: 'Credit Basics' },
];

function FaqView() {
  const [items, setItems] = useState<QA[]>(STATIC_FAQS);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: QA[] }>('/api/qa?limit=30').then((d) => { if (d.items && d.items.length > 0) setItems(d.items); }).catch(() => {});
  }, []);
  const grouped = items.reduce<Record<string, QA[]>>((acc, q) => { const cat = q.category ?? 'General'; if (!acc[cat]) acc[cat] = []; acc[cat].push(q); return acc; }, {});
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h1>
        <p className="mt-2 text-sm text-slate-500">Common questions about credit scores and loan eligibility.</p>
      </div>
      <div className="space-y-8">
        {Object.entries(grouped).map(([category, qs]) => (
          <div key={category}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-600">{category}</h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {qs.map((q) => (
                <div key={q.id}>
                  <button onClick={() => setOpen(open === q.id ? null : q.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors">
                    <span>{q.question}</span>
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open === q.id && 'rotate-90')} />
                  </button>
                  {open === q.id && <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-600">{q.answer}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 rounded-xl border border-brand-100 bg-brand-50 p-5 text-center">
        <p className="text-sm font-medium text-brand-800">Didn't find what you're looking for?</p>
        <p className="mt-1 text-xs text-brand-600">Ask our AI assistant and get a personalized answer in seconds.</p>
      </div>
    </div>
  );
}

const LOAN_OFFERS = [
  { id: 'personal', icon: CreditCard, name: 'Personal Loan', description: 'Flexible funds for debt consolidation, medical bills, home improvements, or any personal expense.', amount: 'Up to $50,000', rate: 'From 7.99% APR', term: '12-84 months', minScore: 620, badge: 'Most Popular', badgeColor: 'green' as const, cta: 'Check your rate' },
  { id: 'credit-builder', icon: TrendingUp, name: 'Credit Builder Loan', description: 'Build or repair your credit history with a small secured loan designed for all credit types.', amount: '$500-$2,000', rate: 'From 10.99% APR', term: '12-24 months', minScore: 0, badge: 'No min score', badgeColor: 'blue' as const, cta: 'Start building' },
  { id: 'home-equity', icon: Home, name: 'Home Equity Loan', description: 'Tap into your home equity for large expenses at lower rates than unsecured borrowing.', amount: 'Up to $250,000', rate: 'From 6.49% APR', term: '5-30 years', minScore: 680, badge: 'Low rates', badgeColor: 'violet' as const, cta: 'See options' },
  { id: 'auto', icon: Car, name: 'Auto Loan', description: 'Finance a new or used vehicle with competitive rates and fast approval decisions.', amount: 'Up to $75,000', rate: 'From 5.99% APR', term: '24-84 months', minScore: 600, cta: 'Get a quote' },
  { id: 'business', icon: Briefcase, name: 'Business Loan', description: 'Fund your business growth with equipment financing, working capital, or expansion funds.', amount: 'Up to $500,000', rate: 'From 8.99% APR', term: '6-60 months', minScore: 640, cta: 'Apply now' },
];

function OffersView() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Loan Offers</h1>
        <p className="mt-2 text-sm text-slate-500">Find a loan that matches your credit profile. Use the chat to understand your eligibility first.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LOAN_OFFERS.map((offer) => {
          const Icon = offer.icon;
          return (
            <Card key={offer.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></div>
                {'badge' in offer && offer.badge && <Badge color={(offer as any).badgeColor ?? 'gray'}>{offer.badge}</Badge>}
              </div>
              <h3 className="mt-3 font-semibold text-slate-900">{offer.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 flex-1">{offer.description}</p>
              <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-medium text-slate-800">{offer.amount}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Rate</span><span className="font-medium text-slate-800">{offer.rate}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Term</span><span className="font-medium text-slate-800">{offer.term}</span></div>
                {offer.minScore > 0 && <div className="flex justify-between"><span className="text-slate-500">Min. score</span><span className="font-medium text-slate-800">{offer.minScore}+</span></div>}
              </div>
              <Button className="mt-4 w-full justify-center" variant="outline">{offer.cta}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button>
            </Card>
          );
        })}
      </div>
      <div className="mt-10 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p>Rates and amounts shown are illustrative and subject to credit approval. Actual offers depend on your credit profile and other factors.</p>
      </div>
    </div>
  );
}
