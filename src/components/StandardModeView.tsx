'use client';

import {
  Activity,
  Calendar,
  Check,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  Loader2,
  Mic,
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
import { formatVndNumber, parseVietnameseExpenseText } from '@/lib/vietnameseParser';
import type {
  CategorySlug,
  FinanceTransaction,
  TransactionType,
  Wallet,
  WalletType,
} from '@/types/finance';
import { AnalyticsChartsSection } from './AnalyticsChartsSection';
import { CategoryIcon } from './CategoryIcon';

export type MobileNavTab = 'overview' | 'charts' | 'ledger' | 'account';

interface StandardModeViewProps {
  activeWallet: Wallet;
  wallets: Wallet[];
  onSelectWallet: (walletId: string) => void;
  transactions: FinanceTransaction[];
  onSubmitNaturalInput: (
    text: string,
    forcedType?: 'auto' | TransactionType
  ) => Promise<void>;
  onOpenVoiceSheet: () => void;
  onAddManualTransaction: (params: {
    type: TransactionType;
    amount: number;
    categorySlug: CategorySlug;
    description: string;
    transactionDate: string;
  }) => Promise<void>;
  manualModalOpen: boolean;
  onSetManualModalOpen: (open: boolean) => void;
  onCreateWallet: (params: { name: string; type: WalletType }) => Promise<void>;
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
  mobileTab: MobileNavTab;
  onChangeMobileTab: (tab: MobileNavTab) => void;
}

const SAMPLE_PROMPTS = [
  'Ăn bún chả 45k rồi đổ xăng 70 nghìn',
  'Sáng mua rau 35k với mua thịt bò 150k',
  'Đóng tiền điện nước 850 nghìn',
  'Nhận lương tháng 12 triệu',
];

const MANUAL_QUICK_AMOUNTS = [20000, 50000, 100000, 200000, 500000];

function formatDateGroupLabel(dateIso: string): { key: string; label: string } {
  const d = new Date(dateIso);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

  const dateText = `${String(d.getDate()).padStart(2, '0')}/${String(
    d.getMonth() + 1
  ).padStart(2, '0')}/${d.getFullYear()}`;

  if (d.toDateString() === now.toDateString()) {
    return { key, label: `Hôm nay · ${dateText}` };
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return { key, label: `Hôm qua · ${dateText}` };
  }
  return { key, label: dateText };
}

export function StandardModeView({
  activeWallet,
  wallets,
  onSelectWallet,
  transactions,
  onSubmitNaturalInput,
  onOpenVoiceSheet,
  onAddManualTransaction,
  manualModalOpen,
  onSetManualModalOpen,
  onCreateWallet,
  isParsing,
  lastAddedBatch,
  onUndoLastBatch,
  onUpdateTransaction,
  onDeleteTransaction,
  onClearWalletTransactions,
  mobileTab,
  onChangeMobileTab,
}: StandardModeViewProps) {
  const [omnibarText, setOmnibarText] = useState('');
  const [omnibarTypeMode, setOmnibarTypeMode] = useState<'auto' | TransactionType>('auto');
  const [hideBalance, setHideBalance] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | CategorySlug>('all');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Manual Structured Entry State (Bottom Sheet / Modal)
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

  // Instant 0ms preview while user types into omnibar
  const liveOmnibarPreview = useMemo(() => {
    if (!omnibarText.trim()) return [];
    return parseVietnameseExpenseText(omnibarText.trim(), undefined, omnibarTypeMode);
  }, [omnibarText, omnibarTypeMode]);

  const handleOmnibarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!omnibarText.trim() || isParsing) return;
    const text = omnibarText.trim();
    const chosenType = omnibarTypeMode;
    setOmnibarText('');
    await onSubmitNaturalInput(text, chosenType);
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
      onSetManualModalOpen(false);
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

  // Group filtered transactions by Date Header (Money Lover / Spendee style)
  const groupedByDate = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      netTotal: number;
      items: FinanceTransaction[];
    }> = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const tx of filteredTransactions) {
      const { key, label } = formatDateGroupLabel(tx.transactionDate);
      let grp = map.get(key);
      if (!grp) {
        grp = { key, label, netTotal: 0, items: [] };
        map.set(key, grp);
        groups.push(grp);
      }
      grp.items.push(tx);
      grp.netTotal += tx.type === 'income' ? tx.amount : -tx.amount;
    }

    return groups;
  }, [filteredTransactions]);

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

  const maskMoney = (formatted: string) => (hideBalance ? '•••••••• ₫' : formatted);

  const showOverview = mobileTab === 'overview';
  const showCharts = mobileTab === 'charts';
  const showLedger = mobileTab === 'ledger';

  return (
    <div className="space-y-5 pb-28 lg:pb-16">
      {/* =====================================================================
          SECTION A: HERO MOBILE BALANCE CARD + WALLET STRIP (Overview on mobile, always on desktop)
         ===================================================================== */}
      <div className={`${showOverview ? 'block' : 'hidden lg:block'} space-y-5`}>
        {/* Mobile Hero Balance Card (MoMo / Revolut inspired, hidden on xl if desired, shown compactly on mobile/tablet) */}
        <div className="rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-5 text-white shadow-[0_14px_38px_rgba(79,70,229,0.28)] sm:p-6 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WalletIcon className="h-4 w-4 text-sky-200" />
              <span className="text-xs font-bold text-indigo-100">{activeWallet.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setHideBalance((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md"
            >
              {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{hideBalance ? 'Hiện số' : 'Ẩn số'}</span>
            </button>
          </div>

          <div className="mt-3 font-mono text-3xl font-black tabular-nums tracking-tight">
            {maskMoney(`${formatVndNumber(stats.balance)} ₫`)}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-white/12 p-3 backdrop-blur-md">
            <div>
              <div className="text-[11px] font-semibold text-emerald-200">Tổng thu</div>
              <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums">
                {maskMoney(`+${formatVndNumber(stats.totalIncome)} ₫`)}
              </div>
            </div>
            <div className="border-l border-white/15 pl-3">
              <div className="text-[11px] font-semibold text-rose-200">Tổng chi</div>
              <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums">
                {maskMoney(`−${formatVndNumber(stats.totalExpense)} ₫`)}
              </div>
            </div>
          </div>

          {/* Mobile Quick Actions */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onOpenVoiceSheet}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-white text-xs font-extrabold text-indigo-700 shadow-sm active:scale-95"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Nói AI</span>
            </button>
            <button
              type="button"
              onClick={() => onSetManualModalOpen(true)}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-white/20 text-xs font-extrabold text-white backdrop-blur-md active:scale-95"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Ghi tay</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMobileTab('charts')}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-white/20 text-xs font-extrabold text-white backdrop-blur-md active:scale-95"
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Biểu đồ</span>
            </button>
          </div>
        </div>

        {/* 1. AI OMNIBAR (Quick Natural Input + Real-time Preview + Voice Studio Trigger) */}
        <div className="rounded-3xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_10px_32px_rgb(79,70,229,0.08)] backdrop-blur-xl dark:border-indigo-500/25 dark:bg-[#131B2E]/95 lg:sticky lg:top-16 lg:z-20">
          <form
            onSubmit={handleOmnibarSubmit}
            className="flex flex-col gap-2.5 lg:flex-row lg:items-center"
          >
            <div className="relative flex-1">
              <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
              <input
                type="text"
                value={omnibarText}
                onChange={(e) => setOmnibarText(e.target.value)}
                placeholder='Gõ câu thu/chi (VD: "ăn sáng 45k, đổ xăng 70k")...'
                className="h-12 w-full rounded-2xl border border-indigo-100 bg-slate-50/90 pl-10 pr-10 text-base font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-indigo-500/20 dark:bg-[#0B0F19]/80 dark:text-white dark:placeholder-slate-500 sm:text-sm"
              />
              {omnibarText && (
                <button
                  type="button"
                  onClick={() => setOmnibarText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenVoiceSheet}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-extrabold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-200 lg:flex-none"
                title="Mở micro thu âm kèm sóng âm trực tiếp"
              >
                <Mic className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                <span>Nói (Sóng âm)</span>
              </button>

              <button
                type="submit"
                disabled={isParsing || !omnibarText.trim()}
                className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 text-xs font-extrabold text-white shadow-md shadow-indigo-500/25 transition hover:brightness-105 disabled:opacity-55 lg:flex-none"
              >
                {isParsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span>Lưu nhanh</span>
              </button>

              <button
                type="button"
                onClick={() => onSetManualModalOpen(true)}
                className="hidden h-12 items-center justify-center gap-2 rounded-2xl border-2 border-indigo-200 bg-white px-4 text-xs font-extrabold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-[#0E1322] dark:text-indigo-300 sm:inline-flex"
              >
                <PlusCircle className="h-4 w-4 text-indigo-600" />
                <span>Ghi thủ công</span>
              </button>
            </div>
          </form>

          {/* 0ms Live On-Device Preview + Explicit [ Tự động | − Chi | + Thu ] Switch */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-indigo-100 bg-slate-100/90 p-0.5 dark:border-white/10 dark:bg-slate-900">
              {(
                [
                  { id: 'auto', label: 'Tự động AI', activeCls: 'bg-indigo-600 text-white' },
                  { id: 'expense', label: '− Chi tiêu', activeCls: 'bg-rose-600 text-white' },
                  { id: 'income', label: '+ Thu nhập', activeCls: 'bg-emerald-600 text-white' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOmnibarTypeMode(opt.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                    omnibarTypeMode === opt.id
                      ? `${opt.activeCls} shadow-2xs`
                      : 'text-slate-600 hover:text-indigo-600 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {liveOmnibarPreview.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {liveOmnibarPreview.map((item, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-0.5 text-[11px] font-extrabold ${
                      item.type === 'income'
                        ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : 'border-rose-200 bg-rose-50/90 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/50 dark:text-rose-200'
                    }`}
                  >
                    <span>{item.description}</span>
                    <span>·</span>
                    <span className="font-mono">
                      {item.type === 'income' ? '+' : '−'}
                      {formatVndNumber(item.amount)}₫
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Horizontal Scrollable Sample Utterance Chips (mobile friendly) */}
          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <span className="shrink-0 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
              Thử nhanh:
            </span>
            {SAMPLE_PROMPTS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setOmnibarText(sample)}
                className="shrink-0 rounded-xl border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-100/80 hover:text-indigo-700 dark:border-indigo-500/20 dark:bg-white/[0.04] dark:text-slate-300"
              >
                “{sample}”
              </button>
            ))}
          </div>

          {/* Optimistic Confirmation + 1-Click Undo Banner */}
          {lastAddedBatch && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/80 px-4 py-2.5 text-xs dark:border-emerald-500/30 dark:from-emerald-950/50 dark:to-teal-950/40">
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
                <span>Hoàn tác ({lastAddedBatch.ids.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. HORIZONTAL WALLET SWITCHER STRIP + UTILITIES */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-indigo-100 bg-white p-1.5 shadow-xs no-scrollbar dark:border-indigo-500/20 dark:bg-[#131B2E]">
            {wallets.map((w) => {
              const active = w.id === activeWallet.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectWallet(w.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
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
                    {w.type === 'savings' ? 'Tiết kiệm' : 'Cá nhân'}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowWalletPanel((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-2 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>+ Thêm ví</span>
            </button>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={() => setHideBalance((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-indigo-100 bg-white px-3 text-xs font-bold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-indigo-500/20 dark:bg-[#131B2E] dark:text-slate-300"
              title="Ẩn / Hiện số tiền"
            >
              {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{hideBalance ? 'Hiện số' : 'Ẩn số'}</span>
            </button>

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
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Làm sạch ví</span>
              </button>
            )}
          </div>
        </div>

        {/* Inline Personal Wallet Creation Drawer */}
        {showWalletPanel && (
          <form
            onSubmit={handleCreateWalletSubmit}
            className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border border-indigo-200 bg-white p-4 shadow-md dark:border-indigo-500/30 dark:bg-[#131B2E]"
          >
            <div className="flex flex-1 flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tên ví cá nhân mới *
                </label>
                <input
                  type="text"
                  required
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                  placeholder="VD: Tài khoản Ngân hàng, Quỹ Tiết kiệm..."
                  className="h-10 w-full rounded-xl border border-indigo-200 bg-slate-50 px-3 text-base font-bold text-slate-900 dark:bg-slate-900 dark:text-white sm:text-xs"
                />
              </div>

              <div className="w-full sm:w-48">
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

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button
                type="submit"
                className="h-10 flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-xs font-extrabold text-white sm:flex-none"
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

        {/* 3. SYMMETRICAL 4-COLUMN DESKTOP KPI CARDS (2x2 compact grid on mobile!) */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <div className="flex h-full flex-col justify-between rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 p-4 shadow-xs dark:border-emerald-500/20 dark:from-[#131B2E] dark:to-emerald-950/25 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 sm:text-xs">
                Tổng Thu Nhập
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 sm:h-8 sm:w-8">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 font-mono text-base font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white sm:mt-3 sm:text-2xl">
              {maskMoney(`+${formatVndNumber(stats.totalIncome)} ₫`)}
            </div>
            <div className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {activeWallet.name}
            </div>
          </div>

          <div className="flex h-full flex-col justify-between rounded-3xl border border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white to-orange-50/40 p-4 shadow-xs dark:border-rose-500/20 dark:from-[#131B2E] dark:to-rose-950/25 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 sm:text-xs">
                Tổng Chi Tiêu
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300 sm:h-8 sm:w-8">
                <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 font-mono text-base font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white sm:mt-3 sm:text-2xl">
              {maskMoney(`−${formatVndNumber(stats.totalExpense)} ₫`)}
            </div>
            <div className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Hôm nay: {maskMoney(`${formatVndNumber(stats.todayExpense)} ₫`)}
            </div>
          </div>

          <div className="flex h-full flex-col justify-between rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 p-4 shadow-xs dark:border-blue-500/20 dark:from-[#131B2E] dark:to-indigo-950/25 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 sm:text-xs">
                Số Dư Hiện Tại
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-300 sm:h-8 sm:w-8">
                <WalletIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 font-mono text-base font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white sm:mt-3 sm:text-2xl">
              {maskMoney(`${formatVndNumber(stats.balance)} ₫`)}
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
              {transactions.length} giao dịch đã lưu
            </div>
          </div>

          <div className="flex h-full flex-col justify-between rounded-3xl border border-purple-200/80 bg-gradient-to-br from-purple-50/90 via-white to-pink-50/40 p-4 shadow-xs dark:border-purple-500/20 dark:from-[#131B2E] dark:to-purple-950/25 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 sm:text-xs">
                Chi 7 Ngày Qua
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-300 sm:h-8 sm:w-8">
                <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
            <div className="mt-2 font-mono text-base font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white sm:mt-3 sm:text-2xl">
              {maskMoney(`${formatVndNumber(stats.weeklyExpense)} ₫`)}
            </div>
            <div className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {stats.categoryBreakdown.length} danh mục chi tiêu
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECTION B: INTERACTIVE ANALYTICS CHARTS (Charts tab on mobile, always on desktop)
         ===================================================================== */}
      <div className={`${showCharts ? 'block' : 'hidden lg:block'}`}>
        <AnalyticsChartsSection
          transactions={transactions}
          selectedCategory={filterCategory}
          onSelectCategory={(slug) => {
            setFilterCategory(slug);
            if (slug !== 'all') {
              onChangeMobileTab('ledger');
            }
          }}
        />
      </div>

      {/* =====================================================================
          SECTION C: CATEGORY BREAKDOWN + DATE-GROUPED TRANSACTION LEDGER
         ===================================================================== */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left 4 Cols: Category Breakdown List (visible in Charts tab on mobile, always on desktop) */}
        <div
          className={`${
            showCharts ? 'block' : 'hidden lg:block'
          } rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] sm:p-6 lg:col-span-4`}
        >
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            Chi Tiết Theo Danh Mục
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {stats.categoryBreakdown.length > 0
              ? `Chạm vào danh mục để lọc giao dịch`
              : 'Chưa phát sinh khoản chi tiêu nào'}
          </p>

          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 p-0.5 dark:bg-slate-800">
            {stats.categoryBreakdown.map((item) => (
              <div
                key={item.category.slug}
                style={{
                  width: `${Math.max(item.pct, 4)}%`,
                  backgroundColor: item.category.color,
                }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>

          <div className="mt-4 space-y-2.5">
            {stats.categoryBreakdown.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-indigo-100 px-4 py-8 text-center text-xs text-slate-400 dark:border-indigo-500/20">
                Ví cá nhân hiện đang ở mức 0 ₫.
              </div>
            ) : (
              stats.categoryBreakdown.map((item) => (
                <button
                  key={item.category.slug}
                  type="button"
                  onClick={() => {
                    const next =
                      filterCategory === item.category.slug ? 'all' : item.category.slug;
                    setFilterCategory(next);
                    if (next !== 'all') onChangeMobileTab('ledger');
                  }}
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

        {/* Right 8 Cols: Date-Grouped Transaction Ledger (visible on Overview & Ledger on mobile, always on desktop) */}
        <div
          className={`${
            showOverview || showLedger ? 'block' : 'hidden lg:block'
          } rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] sm:p-6 lg:col-span-8`}
        >
          {/* Header & Filter Bar */}
          <div className="flex flex-col gap-3 border-b border-indigo-100/80 pb-4 dark:border-indigo-500/15 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center justify-between xl:hidden">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {showOverview ? 'Giao dịch gần đây' : 'Sổ Giao Dịch Chi Tiết'}
              </h3>
              {showOverview && transactions.length > 5 && (
                <button
                  type="button"
                  onClick={() => onChangeMobileTab('ledger')}
                  className="text-xs font-extrabold text-indigo-600"
                >
                  Xem tất cả ({transactions.length}) →
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'expense', label: 'Chi' },
                  { id: 'income', label: 'Thu' },
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
                <option value="all">Mọi lúc</option>
                <option value="today">Hôm nay</option>
                <option value="week">7 ngày</option>
                <option value="month">Tháng này</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as 'all' | CategorySlug)}
                className="h-9 rounded-xl border border-indigo-100 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 outline-none dark:border-indigo-500/20 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">Mọi mục</option>
                {SYSTEM_CATEGORIES.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full xl:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nội dung..."
                className="h-9 w-full rounded-xl border border-indigo-100 bg-slate-50 pl-8 pr-7 text-base font-medium outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-slate-800 sm:text-xs"
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

          {/* Date-Grouped Transaction List */}
          <div className="mt-4 space-y-5">
            {groupedByDate.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                  {transactions.length === 0
                    ? `Sổ "${activeWallet.name}" đang sạch sẽ (0 ₫)`
                    : 'Không tìm thấy giao dịch khớp bộ lọc'}
                </div>
                <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
                  {transactions.length === 0
                    ? 'Hãy bấm nút Micro AI để nói (VD: "ăn phở 45k") hoặc bấm "Ghi thủ công" để lưu giao dịch đầu tiên.'
                    : 'Thử chọn lại khoảng thời gian hoặc từ khóa khác.'}
                </p>
              </div>
            ) : (
              groupedByDate.map((group) => (
                <div key={group.key} className="space-y-1.5">
                  {/* Sticky-feel Date Section Header */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50/90 px-3 py-1.5 text-xs dark:bg-white/[0.04]">
                    <span className="font-extrabold text-slate-600 dark:text-slate-300">
                      {group.label}
                    </span>
                    <span
                      className={`font-mono font-extrabold tabular-nums ${
                        group.netTotal >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {group.netTotal >= 0 ? '+' : '−'}
                      {formatVndNumber(Math.abs(group.netTotal))} ₫
                    </span>
                  </div>

                  <div className="divide-y divide-indigo-100/50 dark:divide-white/[0.06]">
                    {group.items.map((tx) => {
                      const cat =
                        CATEGORY_BY_SLUG[tx.categorySlug] || CATEGORY_BY_SLUG['khac'];
                      const isEditing = editingId === tx.id;

                      if (isEditing) {
                        return (
                          <div
                            key={tx.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-indigo-50/50 px-3 py-3 dark:bg-indigo-500/10"
                          >
                            <input
                              type="text"
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              className="h-10 min-w-[150px] flex-1 rounded-xl border border-indigo-200 bg-white px-3 text-base font-bold dark:bg-slate-900 sm:text-xs"
                            />
                            <select
                              value={editCategory}
                              onChange={(e) =>
                                setEditCategory(e.target.value as CategorySlug)
                              }
                              className="h-10 rounded-xl border border-indigo-200 bg-white px-2.5 text-xs font-bold dark:bg-slate-900"
                            >
                              {SYSTEM_CATEGORIES.map((c) => (
                                <option key={c.slug} value={c.slug}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="h-10 w-28 rounded-xl border border-indigo-200 bg-white px-3 font-mono text-base font-bold tabular-nums dark:bg-slate-900 sm:text-xs"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => saveInlineEdit(tx.id)}
                                className="h-10 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white"
                              >
                                Lưu
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="h-10 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-600"
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
                          className="group flex items-center justify-between gap-2.5 rounded-2xl px-2 py-3 transition hover:bg-indigo-50/30 dark:hover:bg-white/[0.02]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <CategoryIcon slug={tx.categorySlug} size="md" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                                {tx.description}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{
                                    backgroundColor: `${cat.color}18`,
                                    color: cat.color,
                                  }}
                                >
                                  {cat.name}
                                </span>
                                <span>
                                  {new Date(tx.transactionDate).toLocaleTimeString(
                                    'vi-VN',
                                    {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`font-mono text-sm font-extrabold tabular-nums ${
                                tx.type === 'income'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {hideBalance
                                ? '••••• ₫'
                                : `${tx.type === 'income' ? '+' : '−'}${formatVndNumber(
                                    tx.amount
                                  )} ₫`}
                            </span>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => startInlineEdit(tx)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-800"
                                title="Sửa"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTransaction(tx.id)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-slate-800"
                                title="Xóa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          RESPONSIVE MANUAL TRANSACTION SHEET / MODAL (Mobile Thumb-Friendly)
         ===================================================================== */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={handleManualSubmit}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-indigo-200 bg-white p-5 pb-safe shadow-2xl dark:border-indigo-500/30 dark:bg-[#111829] sm:rounded-3xl sm:p-6 space-y-4"
          >
            <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" />

            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Ghi giao dịch thủ công
                </h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  Vào ví: {activeWallet.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSetManualModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Type Switch */}
            <div className="grid grid-cols-2 rounded-2xl border border-indigo-100 bg-slate-100/90 p-1 dark:border-indigo-500/20 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setManualType('expense');
                  if (manualCategory === 'thu-nhap') setManualCategory('an-uong');
                }}
                className={`h-10 rounded-xl text-xs font-extrabold transition ${
                  manualType === 'expense'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Khoản Chi tiêu
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualType('income');
                  setManualCategory('thu-nhap');
                }}
                className={`h-10 rounded-xl text-xs font-extrabold transition ${
                  manualType === 'income'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Khoản Thu nhập
              </button>
            </div>

            {/* Numeric Amount + Quick Denominations */}
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                Số tiền (VNĐ) *
              </label>
              <input
                type="number"
                inputMode="numeric"
                required
                min="1000"
                step="1000"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="VD: 50000"
                className="h-12 w-full rounded-2xl border border-indigo-200 bg-slate-50 px-4 font-mono text-xl font-black text-slate-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MANUAL_QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setManualAmount(String(amt))}
                    className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-2.5 py-1.5 font-mono text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200"
                  >
                    {formatVndNumber(amt)}đ
                  </button>
                ))}
              </div>
            </div>

            {/* Description & Date */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nội dung / Mô tả *
                </label>
                <input
                  type="text"
                  required
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="VD: Ăn trưa, Đổ xăng, Nhận lương..."
                  className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50 px-3.5 text-base font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white sm:text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ngày giao dịch
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Tactile Visual Category Pill Picker (Way nicer on mobile than native select) */}
            {manualType === 'expense' && (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Chọn danh mục chi tiêu
                </label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {SYSTEM_CATEGORIES.filter((c) => c.slug !== 'thu-nhap').map((cat) => {
                    const active = manualCategory === cat.slug;
                    return (
                      <button
                        key={cat.slug}
                        type="button"
                        onClick={() => setManualCategory(cat.slug)}
                        className={`flex flex-col items-center gap-1 rounded-2xl border p-2 text-center transition ${
                          active
                            ? 'border-indigo-600 bg-indigo-50/90 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-500/20'
                            : 'border-slate-100 bg-slate-50/60 hover:border-indigo-200 dark:border-white/10 dark:bg-white/[0.03]'
                        }`}
                      >
                        <CategoryIcon slug={cat.slug} size="sm" />
                        <span className="line-clamp-1 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                          {cat.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={savingManual}
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:brightness-105"
            >
              {savingManual ? 'Đang lưu...' : 'Xác nhận lưu giao dịch'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
