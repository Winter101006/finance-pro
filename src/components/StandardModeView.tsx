'use client';

import {
  Activity,
  Calendar,
  Check,
  Download,
  Edit3,
  FolderPlus,
  Loader2,
  Mic,
  MicOff,
  PlusCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_BY_SLUG, SYSTEM_CATEGORIES } from '@/data/categories';
import { formatVndNumber } from '@/lib/vietnameseParser';
import type {
  CategorySlug,
  FinanceTransaction,
  TransactionType,
  Wallet,
  WalletType,
} from '@/types/finance';
import { AnalyticsChartsSection } from './AnalyticsChartsSection';
import { CategoryIcon } from './CategoryIcon';

interface StandardModeViewProps {
  activeWallet: Wallet;
  wallets: Wallet[];
  onSelectWallet: (walletId: string) => void;
  transactions: FinanceTransaction[];
  onSubmitNaturalInput: (text: string) => Promise<void>;
  onAddManualTransaction: (params: {
    type: TransactionType;
    amount: number;
    categorySlug: CategorySlug;
    description: string;
    transactionDate: string;
  }) => Promise<void>;
  onCreateWallet: (params: {
    name: string;
    type: WalletType;
  }) => Promise<void>;
  isParsing: boolean;
  lastAddedBatch: {
    ids: string[];
    summary: string;
    engine: string;
  } | null;
  onUndoLastBatch: () => Promise<void>;
  onUpdateTransaction: (
    id: string,
    updates: Partial<
      Pick<FinanceTransaction, 'amount' | 'description' | 'categorySlug' | 'type'>
    >
  ) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onClearWalletTransactions: () => Promise<void>;
}

const SAMPLE_PROMPTS = [
  'Ăn bún chả 45k rồi đổ xăng 70 nghìn',
  'Sáng mua đồ ăn 35 nghìn với mua cà phê 30k',
  'Đóng tiền điện nước 850 nghìn',
  'Mua sách chuyên ngành 150k',
  'Nhận lương tháng 12 triệu',
];

const MANUAL_QUICK_AMOUNTS = [35000, 50000, 100000, 200000, 500000, 1000000];

export function StandardModeView({
  activeWallet,
  wallets,
  onSelectWallet,
  transactions,
  onSubmitNaturalInput,
  onAddManualTransaction,
  onCreateWallet,
  isParsing,
  lastAddedBatch,
  onUndoLastBatch,
  onUpdateTransaction,
  onDeleteTransaction,
  onClearWalletTransactions,
}: StandardModeViewProps) {
  const [omnibarText, setOmnibarText] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | CategorySlug>('all');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Structured Entry Panel
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualType, setManualType] = useState<TransactionType>('expense');
  const [manualAmount, setManualAmount] = useState('');
  const [manualCategory, setManualCategory] = useState<CategorySlug>('an-uong');
  const [manualDesc, setManualDesc] = useState('');
  const [manualDate, setManualDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [savingManual, setSavingManual] = useState(false);

  // Personal Sub-Wallet Creation Panel
  const [showWalletPanel, setShowWalletPanel] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletType, setNewWalletType] = useState<WalletType>('personal');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<CategorySlug>('an-uong');
  const [editType, setEditType] = useState<TransactionType>('expense');

  const handleOmnibarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!omnibarText.trim() || isParsing) return;
    const text = omnibarText.trim();
    setOmnibarText('');
    await onSubmitNaturalInput(text);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(manualAmount);
    if (!amt || amt <= 0 || !manualDesc.trim()) return;
    setSavingManual(true);
    try {
      const isoDate = manualDate
        ? new Date(`${manualDate}T12:00:00`).toISOString()
        : new Date().toISOString();
      await onAddManualTransaction({
        type: manualType,
        amount: Math.round(amt),
        categorySlug: manualType === 'income' ? 'thu-nhap' : manualCategory,
        description: manualDesc.trim(),
        transactionDate: isoDate,
      });
      setManualAmount('');
      setManualDesc('');
      setShowManualForm(false);
    } finally {
      setSavingManual(false);
    }
  };

  const handleCreateWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWalletName.trim()) return;
    await onCreateWallet({
      name: newWalletName.trim(),
      type: newWalletType,
    });
    setNewWalletName('');
    setShowWalletPanel(false);
  };

  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRec) {
      alert(
        'Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói. Hãy dùng Google Chrome hoặc Microsoft Edge.'
      );
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new (SpeechRec as new () => {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
    })();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsListening(true);

    recognition.onresult = async (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setIsListening(false);
      if (transcript.trim()) {
        setOmnibarText('');
        await onSubmitNaturalInput(transcript.trim());
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Personal Financial Metrics Calculation
  const stats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 3600 * 1000;
    const todayStr = now.toDateString();
    let totalIncome = 0;
    let totalExpense = 0;
    let weeklyExpense = 0;
    let todayExpense = 0;
    const categoryTotals: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        const txDate = new Date(tx.transactionDate);
        if (txDate.getTime() >= sevenDaysAgo) {
          weeklyExpense += tx.amount;
        }
        if (txDate.toDateString() === todayStr) {
          todayExpense += tx.amount;
        }
        categoryTotals[tx.categorySlug] =
          (categoryTotals[tx.categorySlug] || 0) + tx.amount;
      }
    }

    const balance = totalIncome - totalExpense;

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([slug, amount]) => ({
        category: CATEGORY_BY_SLUG[slug as CategorySlug] || CATEGORY_BY_SLUG['khac'],
        amount,
        pct: totalExpense > 0 ? Math.round((amount / totalExpense) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalIncome,
      totalExpense,
      weeklyExpense,
      todayExpense,
      balance,
      categoryBreakdown,
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = new Date();
    const todayStr = now.toDateString();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 3600 * 1000;
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return transactions.filter((tx) => {
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterCategory !== 'all' && tx.categorySlug !== filterCategory) return false;

      if (filterPeriod !== 'all') {
        const txDate = new Date(tx.transactionDate);
        if (filterPeriod === 'today' && txDate.toDateString() !== todayStr) return false;
        if (filterPeriod === 'week' && txDate.getTime() < sevenDaysAgo) return false;
        if (
          filterPeriod === 'month' &&
          (txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear)
        ) {
          return false;
        }
      }

      if (q) {
        const catName = CATEGORY_BY_SLUG[tx.categorySlug]?.name.toLowerCase() || '';
        const hay = `${tx.description.toLowerCase()} ${catName} ${(
          tx.rawInput || ''
        ).toLowerCase()}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterCategory, filterPeriod, searchQuery]);

  const startInlineEdit = (tx: FinanceTransaction) => {
    setEditingId(tx.id);
    setEditDesc(tx.description);
    setEditAmount(String(tx.amount));
    setEditCategory(tx.categorySlug);
    setEditType(tx.type);
  };

  const saveInlineEdit = async (id: string) => {
    const amt = Number(editAmount);
    if (!editDesc.trim() || !amt || amt <= 0) return;
    await onUpdateTransaction(id, {
      description: editDesc.trim(),
      amount: Math.round(amt),
      categorySlug: editCategory,
      type: editType,
    });
    setEditingId(null);
  };

  const exportCsv = () => {
    const rows = [
      ['ID', 'Thời gian', 'Ví', 'Loại', 'Danh mục', 'Nội dung', 'Số tiền (VNĐ)'],
      ...filteredTransactions.map((t) => [
        t.id,
        new Date(t.transactionDate).toLocaleString('vi-VN'),
        activeWallet.name,
        t.type === 'income' ? 'Thu nhập' : 'Chi tiêu',
        CATEGORY_BY_SLUG[t.categorySlug]?.name || 'Khác',
        t.description,
        t.amount,
      ]),
    ];
    const csv =
      '\uFEFF' +
      rows
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance_pro_ca_nhan.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. STICKY AI OMNIBAR + MANUAL ADD TRANSACTION BUTTON */}
      <div className="sticky top-16 z-20 rounded-3xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_12px_36px_rgb(79,70,229,0.1)] backdrop-blur-xl dark:border-indigo-500/25 dark:bg-[#131B2E]/95">
        <form
          onSubmit={handleOmnibarSubmit}
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
        >
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
            <input
              type="text"
              value={omnibarText}
              onChange={(e) => setOmnibarText(e.target.value)}
              placeholder='Nhập nhanh câu thu/chi (VD: "ăn sáng 45k, đổ xăng 70 nghìn", "nhận lương 12tr")...'
              className="h-12 w-full rounded-2xl border border-indigo-100 bg-slate-50/90 pl-11 pr-10 text-sm font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-indigo-500/20 dark:bg-[#0B0F19]/80 dark:text-white dark:placeholder-slate-500"
            />
            {omnibarText && (
              <button
                type="button"
                onClick={() => setOmnibarText('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-extrabold transition ${
                isListening
                  ? 'animate-pulse bg-rose-600 text-white shadow-lg shadow-rose-500/30'
                  : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-200'
              }`}
              title="Bấm để nói bằng giọng tiếng Việt (vi-VN)"
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span>{isListening ? 'Đang nghe...' : 'Nói (Mic)'}</span>
            </button>

            <button
              type="submit"
              disabled={isParsing || !omnibarText.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 text-xs font-extrabold text-white shadow-md shadow-indigo-500/25 transition hover:brightness-105 disabled:opacity-60"
            >
              {isParsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>AI Phân tích &amp; Lưu</span>
            </button>

            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-indigo-200 bg-white px-4 text-xs font-extrabold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-[#0E1322] dark:text-indigo-300"
            >
              <PlusCircle className="h-4 w-4 text-indigo-600" />
              <span>Ghi thủ công</span>
            </button>
          </div>
        </form>

        {/* Quick Sample Utterance Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
            Mẫu câu gợi ý:
          </span>
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setOmnibarText(sample)}
              className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-100/80 hover:text-indigo-700 dark:border-indigo-500/20 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-indigo-200"
            >
              “{sample}”
            </button>
          ))}
        </div>

        {/* Structured Manual Transaction Entry Drawer */}
        {showManualForm && (
          <form
            onSubmit={handleManualSubmit}
            className="mt-4 space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-500/30 dark:bg-[#0B0F19]/90"
          >
            <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5 dark:border-indigo-500/20">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Thêm giao dịch chi tiết vào: {activeWallet.name}
              </span>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {/* Type */}
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Loại giao dịch
                </label>
                <div className="grid grid-cols-2 rounded-xl border border-indigo-200 bg-white p-0.5 dark:border-indigo-500/30 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => {
                      setManualType('expense');
                      if (manualCategory === 'thu-nhap') setManualCategory('an-uong');
                    }}
                    className={`rounded-lg py-1.5 text-xs font-extrabold transition ${
                      manualType === 'expense'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Chi tiêu
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualType('income');
                      setManualCategory('thu-nhap');
                    }}
                    className={`rounded-lg py-1.5 text-xs font-extrabold transition ${
                      manualType === 'income'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Thu nhập
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="lg:col-span-2">
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Nội dung / Mô tả *
                </label>
                <input
                  type="text"
                  required
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="VD: Ăn trưa, Đổ xăng, Tiền học bổng..."
                  className="h-9 w-full rounded-xl border border-indigo-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Số tiền (VNĐ) *
                </label>
                <input
                  type="number"
                  required
                  min="1000"
                  step="1000"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="VD: 50000"
                  className="h-9 w-full rounded-xl border border-indigo-200 bg-white px-3 font-mono text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {/* Category & Date */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Danh mục
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value as CategorySlug)}
                    className="h-9 w-full rounded-xl border border-indigo-200 bg-white px-2 text-xs font-bold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
                  >
                    {SYSTEM_CATEGORIES.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Ngày
                  </label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="h-9 w-full rounded-xl border border-indigo-200 bg-white px-2 text-xs font-bold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Chọn nhanh:</span>
                {MANUAL_QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setManualAmount(String(amt))}
                    className="rounded-lg border border-indigo-200 bg-white px-2 py-1 font-mono text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-indigo-300"
                  >
                    {formatVndNumber(amt)}đ
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={savingManual}
                className="h-9 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 text-xs font-extrabold text-white shadow-sm hover:brightness-105"
              >
                {savingManual ? 'Đang lưu...' : 'Lưu giao dịch'}
              </button>
            </div>
          </form>
        )}

        {/* Optimistic Confirmation + 1-Click Undo Banner */}
        {lastAddedBatch && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/80 px-4 py-2.5 text-xs dark:border-emerald-500/30 dark:from-emerald-950/50 dark:to-teal-950/40">
            <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{lastAddedBatch.summary}</span>
              <span className="rounded-md bg-emerald-600/15 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                {lastAddedBatch.engine}
              </span>
            </div>
            <button
              type="button"
              onClick={onUndoLastBatch}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-rose-700"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span>Hoàn tác ({lastAddedBatch.ids.length} khoản)</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. PERSONAL WALLET BAR & UTILITIES */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1.5 rounded-2xl border border-indigo-100 bg-white p-1.5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E]">
          {wallets.map((w) => {
            const active = w.id === activeWallet.id;
            const badgeLabel = w.type === 'savings' ? 'Tiết kiệm' : 'Cá nhân';
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onSelectWallet(w.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                  active
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-white/[0.05]'
                }`}
              >
                <WalletIcon className="h-3.5 w-3.5" />
                <span>{w.name}</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300'
                  }`}
                >
                  {badgeLabel}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowWalletPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-2 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>+ Thêm ví cá nhân</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={transactions.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-indigo-100 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-indigo-500/20 dark:bg-[#131B2E] dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-indigo-500" />
            <span>Xuất CSV</span>
          </button>

          {transactions.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (
                  window.confirm(
                    `Bạn có chắc muốn xóa toàn bộ giao dịch trong "${activeWallet.name}" về 0 ₫ không?`
                  )
                ) {
                  await onClearWalletTransactions();
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:bg-[#131B2E] dark:text-rose-400"
              title="Làm sạch toàn bộ giao dịch trong ví này về 0 ₫"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Làm sạch ví</span>
            </button>
          )}
        </div>
      </div>

      {/* Personal Sub-Wallet Creation Drawer */}
      {showWalletPanel && (
        <form
          onSubmit={handleCreateWalletSubmit}
          className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-indigo-200 bg-white p-5 shadow-md dark:border-indigo-500/30 dark:bg-[#131B2E]"
        >
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Tên ví cá nhân mới *
              </label>
              <input
                type="text"
                required
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                placeholder="VD: Tài khoản Ngân hàng, Quỹ Tiết kiệm..."
                className="h-10 w-full rounded-xl border border-indigo-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div className="w-48">
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Phân loại
              </label>
              <select
                value={newWalletType}
                onChange={(e) => setNewWalletType(e.target.value as WalletType)}
                className="h-10 w-full rounded-xl border border-indigo-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 dark:bg-slate-900 dark:text-white"
              >
                <option value="personal">Ví Chi Tiêu Cá Nhân</option>
                <option value="savings">Quỹ Tiết Kiệm Cá Nhân</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-xs font-extrabold text-white"
            >
              Tạo ví ngay
            </button>
            <button
              type="button"
              onClick={() => setShowWalletPanel(false)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"
            >
              Đóng
            </button>
          </div>
        </form>
      )}

      {/* 3. SYMMETRICAL 4-COLUMN PERSONAL FINANCE KPI CARDS (No Budget Limits Clutter) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Total Income */}
        <div className="flex h-full flex-col justify-between rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 p-5 shadow-xs dark:border-emerald-500/20 dark:from-[#131B2E] dark:to-emerald-950/25">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              Tổng Thu Nhập
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            +{formatVndNumber(stats.totalIncome)} ₫
          </div>
          <div className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Ví: {activeWallet.name}
          </div>
        </div>

        {/* KPI 2: Total Expense */}
        <div className="flex h-full flex-col justify-between rounded-3xl border border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white to-orange-50/40 p-5 shadow-xs dark:border-rose-500/20 dark:from-[#131B2E] dark:to-rose-950/25">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
              Tổng Chi Tiêu
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            −{formatVndNumber(stats.totalExpense)} ₫
          </div>
          <div className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Hôm nay: {formatVndNumber(stats.todayExpense)} ₫
          </div>
        </div>

        {/* KPI 3: Net Balance */}
        <div className="flex h-full flex-col justify-between rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 p-5 shadow-xs dark:border-blue-500/20 dark:from-[#131B2E] dark:to-indigo-950/25">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
              Số Dư Hiện Tại
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-300">
              <WalletIcon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {formatVndNumber(stats.balance)} ₫
          </div>
          <div className="mt-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
            {transactions.length} giao dịch đã lưu
          </div>
        </div>

        {/* KPI 4: 7-Day Activity */}
        <div className="flex h-full flex-col justify-between rounded-3xl border border-purple-200/80 bg-gradient-to-br from-purple-50/90 via-white to-pink-50/40 p-5 shadow-xs dark:border-purple-500/20 dark:from-[#131B2E] dark:to-purple-950/25">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
              Chi Tiêu 7 Ngày Qua
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-300">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {formatVndNumber(stats.weeklyExpense)} ₫
          </div>
          <div className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {stats.categoryBreakdown.length} danh mục phát sinh
          </div>
        </div>
      </div>

      {/* 4. INTERACTIVE ANALYTICS CHARTS (Donut Category Chart + Cashflow Timeline Combo Chart) */}
      <AnalyticsChartsSection
        transactions={transactions}
        selectedCategory={filterCategory}
        onSelectCategory={setFilterCategory}
      />

      {/* 5. CATEGORY BREAKDOWN + TRANSACTION LEDGER (12-COL SPLIT) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left 4 Cols: Visual Category Breakdown */}
        <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] lg:col-span-4">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            Cơ Cấu Chi Tiêu Cá Nhân
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {stats.categoryBreakdown.length > 0
              ? `Phân bổ trên ${stats.categoryBreakdown.length} danh mục đã chi`
              : 'Chưa phát sinh khoản chi tiêu nào'}
          </p>

          {/* Stacked Bar */}
          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 p-0.5 dark:bg-slate-800">
            {stats.categoryBreakdown.map((item) => (
              <div
                key={item.category.slug}
                style={{
                  width: `${Math.max(item.pct, 4)}%`,
                  backgroundColor: item.category.color,
                }}
                className="h-full first:rounded-l-full last:rounded-r-full"
                title={`${item.category.name}: ${formatVndNumber(item.amount)} ₫ (${item.pct}%)`}
              />
            ))}
          </div>

          {/* Ranked Category List */}
          <div className="mt-5 space-y-3">
            {stats.categoryBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-indigo-100 px-4 py-8 text-center text-xs text-slate-400 dark:border-indigo-500/20">
                Ví cá nhân hiện đang ở mức 0 ₫. Hãy nhập câu nói trên thanh AI hoặc bấm
                &ldquo;Ghi thủ công&rdquo; để bắt đầu theo dõi chi tiêu.
              </div>
            ) : (
              stats.categoryBreakdown.map((item) => (
                <button
                  key={item.category.slug}
                  type="button"
                  onClick={() =>
                    setFilterCategory((prev) =>
                      prev === item.category.slug ? 'all' : item.category.slug
                    )
                  }
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                    filterCategory === item.category.slug
                      ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-500/15'
                      : 'border-slate-100 bg-slate-50/70 hover:border-indigo-200 dark:border-white/[0.06] dark:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CategoryIcon slug={item.category.slug} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {item.category.name}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-slate-500">
                        {item.pct}% tổng chi
                      </div>
                    </div>
                  </div>
                  <div className="font-mono text-xs font-extrabold tabular-nums text-slate-900 dark:text-white">
                    {formatVndNumber(item.amount)} ₫
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right 8 Cols: Filterable Transaction Table */}
        <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] lg:col-span-8">
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 border-b border-indigo-100/80 pb-4 dark:border-indigo-500/15 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'expense', label: 'Khoản chi' },
                  { id: 'income', label: 'Khoản thu' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`h-9 rounded-xl px-3 text-xs font-bold transition ${
                    filterType === tab.id
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <select
                value={filterPeriod}
                onChange={(e) =>
                  setFilterPeriod(e.target.value as 'all' | 'today' | 'week' | 'month')
                }
                className="h-9 rounded-xl border border-indigo-100 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-indigo-500/20 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">Mọi thời gian</option>
                <option value="today">Hôm nay</option>
                <option value="week">7 ngày qua</option>
                <option value="month">Tháng này</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as 'all' | CategorySlug)}
                className="h-9 rounded-xl border border-indigo-100 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-indigo-500/20 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">Mọi danh mục (10)</option>
                {SYSTEM_CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full xl:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nội dung giao dịch..."
                className="h-9 w-full rounded-xl border border-indigo-100 bg-slate-50 pl-8 pr-7 text-xs font-medium outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-slate-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Transaction List */}
          <div className="mt-4 divide-y divide-indigo-100/60 dark:divide-indigo-500/10">
            {filteredTransactions.length === 0 ? (
              <div className="space-y-3 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                  {transactions.length === 0
                    ? `Sổ thu chi "${activeWallet.name}" đang trống (0 ₫)`
                    : 'Không tìm thấy giao dịch nào khớp bộ lọc'}
                </div>
                <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
                  {transactions.length === 0
                    ? 'Hãy gõ câu tự nhiên vào ô AI phía trên (ví dụ: "ăn trưa 45k, mua sách 120k") hoặc bấm nút "Ghi thủ công" để thêm giao dịch đầu tiên của bạn.'
                    : 'Hãy thử đổi bộ lọc thời gian hoặc từ khóa tìm kiếm.'}
                </p>
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const cat = CATEGORY_BY_SLUG[tx.categorySlug] || CATEGORY_BY_SLUG['khac'];
                const isEditing = editingId === tx.id;

                if (isEditing) {
                  return (
                    <div
                      key={tx.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-indigo-50/50 px-3 py-3.5 dark:bg-indigo-500/10"
                    >
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="h-9 min-w-[160px] flex-1 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold dark:bg-slate-900"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as CategorySlug)}
                        className="h-9 rounded-xl border border-indigo-200 bg-white px-2.5 text-xs font-bold dark:bg-slate-900"
                      >
                        {SYSTEM_CATEGORIES.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="h-9 w-28 rounded-xl border border-indigo-200 bg-white px-3 font-mono text-xs font-bold tabular-nums dark:bg-slate-900"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveInlineEdit(tx.id)}
                          className="h-9 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="h-9 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-600"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={tx.id}
                    className="group flex items-center justify-between gap-3 rounded-2xl px-2 py-3.5 transition hover:bg-indigo-50/30 dark:hover:bg-white/[0.02]"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <CategoryIcon slug={tx.categorySlug} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {tx.description}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: `${cat.color}18`,
                              color: cat.color,
                            }}
                          >
                            {cat.name}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span>
                            {new Date(tx.transactionDate).toLocaleString('vi-VN', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono text-sm font-extrabold tabular-nums ${
                          tx.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '−'}
                        {formatVndNumber(tx.amount)} ₫
                      </span>

                      <div className="flex items-center gap-1 opacity-85 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startInlineEdit(tx)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800"
                          title="Chỉnh sửa giao dịch"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-slate-800"
                          title="Xóa giao dịch"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
