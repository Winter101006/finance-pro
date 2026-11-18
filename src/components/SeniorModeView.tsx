'use client';

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Keyboard,
  Loader2,
  Mic,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_BY_SLUG } from '@/data/categories';
import { formatVndNumber } from '@/lib/vietnameseParser';
import type { FinanceTransaction, TransactionType, Wallet } from '@/types/finance';
import { CategoryIcon } from './CategoryIcon';

interface SeniorModeViewProps {
  activeWallet: Wallet;
  wallets: Wallet[];
  onSelectWallet: (walletId: string) => void;
  transactions: FinanceTransaction[];
  onSubmitNaturalInput: (text: string) => Promise<void>;
  onOpenVoiceSheet: () => void;
  isParsing: boolean;
  lastAddedBatch: {
    ids: string[];
    summary: string;
    engine: string;
  } | null;
  onUndoLastBatch: () => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onSpeakVietnamese: (text: string) => void;
}

const SIMPLE_QUICK_PHRASES = [
  'Ăn sáng 45 nghìn',
  'Đổ xăng 70 nghìn',
  'Đi chợ mua đồ ăn 150 nghìn',
  'Đóng tiền điện nước 850 nghìn',
];

const QUICK_DENOMINATIONS = [
  { label: '+ 20.000 ₫', value: 20000 },
  { label: '+ 50.000 ₫', value: 50000 },
  { label: '+ 100.000 ₫', value: 100000 },
  { label: '+ 200.000 ₫', value: 200000 },
  { label: '+ 500.000 ₫', value: 500000 },
];

export function SeniorModeView({
  activeWallet,
  wallets,
  onSelectWallet,
  transactions,
  onSubmitNaturalInput,
  onOpenVoiceSheet,
  isParsing,
  lastAddedBatch,
  onUndoLastBatch,
  onDeleteTransaction,
  onSpeakVietnamese,
}: SeniorModeViewProps) {
  const [hideBalance, setHideBalance] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [manualType, setManualType] = useState<TransactionType>('expense');
  const [manualItem, setManualItem] = useState('Ăn uống hàng ngày');
  const [manualAmount, setManualAmount] = useState<number>(50000);

  const handleManualKeyboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItem.trim() || manualAmount <= 0 || isParsing) return;
    const prefix = manualType === 'income' ? 'Nhận thu nhập ' : '';
    const sentence = `${prefix}${manualItem.trim()} ${manualAmount} đồng`;
    await onSubmitNaturalInput(sentence);
    setShowKeyboard(false);
  };

  // Summary metrics
  const summaryStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();

    let totalIncome = 0;
    let totalExpense = 0;
    let totalSpentToday = 0;

    for (const tx of transactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        if (new Date(tx.transactionDate).toDateString() === todayStr) {
          totalSpentToday += tx.amount;
        }
      }
    }

    return {
      recentFive: transactions.slice(0, 5),
      totalSpentToday,
      balance: totalIncome - totalExpense,
    };
  }, [transactions]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-28 lg:pb-16">
      {/* 1. CLEAN SUMMARY HEADER CARD */}
      <div className="space-y-4 rounded-3xl border border-indigo-200/80 bg-white p-5 shadow-[0_12px_36px_rgb(79,70,229,0.08)] dark:border-indigo-500/25 dark:bg-[#131B2E] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Giao diện Đơn giản · Thao tác nhanh</span>
              </div>
              <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                {activeWallet.name}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setHideBalance((v) => !v)}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-indigo-100 bg-slate-50 px-2.5 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 sm:hidden"
            >
              {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 dark:border-rose-500/25 dark:bg-rose-950/30">
              <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300 sm:text-xs">
                Chi hôm nay
              </div>
              <div className="font-mono text-lg font-black tabular-nums text-rose-700 dark:text-rose-300 sm:text-xl">
                {hideBalance ? '••••• ₫' : `${formatVndNumber(summaryStats.totalSpentToday)} ₫`}
              </div>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 dark:border-indigo-500/25 dark:bg-indigo-950/30">
              <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 sm:text-xs">
                Số dư hiện tại
              </div>
              <div className="font-mono text-lg font-black tabular-nums text-indigo-800 dark:text-indigo-200 sm:text-xl">
                {hideBalance ? '••••• ₫' : `${formatVndNumber(summaryStats.balance)} ₫`}
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Selector if user has multiple personal wallets */}
        {wallets.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto border-t border-indigo-100 pt-3 pb-0.5 no-scrollbar dark:border-indigo-500/20">
            <span className="shrink-0 text-xs font-bold text-slate-500">Đổi ví:</span>
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
                      : 'border border-indigo-100 bg-slate-50 text-slate-700 hover:bg-indigo-50 dark:border-indigo-500/20 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <WalletIcon className="h-3.5 w-3.5" />
                  <span>{w.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. FAST VOICE STUDIO TRIGGER & KEYBOARD PANEL */}
      <div className="space-y-5 rounded-3xl border border-indigo-200/80 bg-white p-5 text-center shadow-[0_12px_36px_rgb(79,70,229,0.08)] dark:border-indigo-500/25 dark:bg-[#131B2E] sm:p-8">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 sm:text-lg">
          Bấm nút Micro để đọc thu/chi kèm sóng âm trực tiếp, hoặc nhập nhanh bằng bàn phím:
        </p>

        <button
          type="button"
          onClick={onOpenVoiceSheet}
          disabled={isParsing}
          className="flex min-h-[76px] w-full flex-col items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-5 text-lg font-black text-white shadow-xl shadow-indigo-500/25 transition hover:brightness-105 active:scale-[0.98] sm:text-2xl"
        >
          {isParsing ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span>Đang lưu giao dịch...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <Mic className="h-7 w-7 shrink-0" />
              <span>Bấm để nói (Sóng âm trực tiếp)</span>
            </div>
          )}
        </button>

        {/* Quick 1-Tap Common Phrases */}
        <div className="pt-1 text-left">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Hoặc chạm 1 lần để ghi mẫu nhanh:
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
            {SIMPLE_QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                disabled={isParsing}
                onClick={() => onSubmitNaturalInput(phrase)}
                className="flex min-h-[48px] items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-2.5 text-left text-sm font-bold text-slate-800 transition hover:border-indigo-300 hover:bg-indigo-100/70 active:scale-[0.98] dark:border-indigo-500/20 dark:bg-white/[0.04] dark:text-slate-200"
              >
                <span>“{phrase}”</span>
              </button>
            ))}
          </div>
        </div>

        {/* Toggle Fast Keyboard Panel */}
        <button
          type="button"
          onClick={() => setShowKeyboard((v) => !v)}
          className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-indigo-200 bg-slate-50 px-5 text-sm font-extrabold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-slate-800/80 dark:text-indigo-200 sm:text-base"
        >
          <Keyboard className="h-5 w-5 shrink-0" />
          <span>
            {showKeyboard ? 'Đóng bàn phím nhập nhanh' : 'Nhập bằng bàn phím & Mệnh giá'}
          </span>
        </button>

        {/* Fast Keyboard Panel with Quick Denominations */}
        {showKeyboard && (
          <form
            onSubmit={handleManualKeyboardSubmit}
            className="space-y-4 rounded-3xl border border-indigo-200 bg-slate-50/90 p-4 text-left dark:border-indigo-500/30 dark:bg-[#0B0F19]/90 sm:p-5"
          >
            {/* Income / Expense Toggle */}
            <div className="grid grid-cols-2 rounded-2xl border border-indigo-200 bg-white p-1 dark:border-indigo-500/30 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setManualType('expense')}
                className={`h-10 rounded-xl text-xs font-extrabold transition ${
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
                  setManualItem('Nhận lương / Thù lao');
                }}
                className={`h-10 rounded-xl text-xs font-extrabold transition ${
                  manualType === 'income'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Thu nhập
              </button>
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold text-slate-800 dark:text-slate-200 sm:text-sm">
                1. Nội dung thu / chi:
              </label>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {[
                  'Ăn uống hàng ngày',
                  'Đi chợ mua đồ',
                  'Đổ xăng di chuyển',
                  'Đóng tiền điện nước',
                  'Mua sắm cá nhân',
                  'Nhận lương / Thưởng',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setManualItem(preset);
                      if (preset.includes('lương')) setManualType('income');
                    }}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold transition ${
                      manualItem === preset
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-indigo-200 bg-white text-slate-700 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={manualItem}
                onChange={(e) => setManualItem(e.target.value)}
                className="h-12 w-full rounded-2xl border border-indigo-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold text-slate-800 dark:text-slate-200 sm:text-sm">
                2. Số tiền (VNĐ):
              </label>
              <div className="mb-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {QUICK_DENOMINATIONS.map((den) => (
                  <button
                    key={den.value}
                    type="button"
                    onClick={() => setManualAmount((prev) => prev + den.value)}
                    className="h-11 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 font-mono text-sm font-extrabold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    {den.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setManualAmount(0)}
                  className="h-11 rounded-xl border border-rose-200 bg-rose-50/90 px-3 text-xs font-extrabold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  Đặt lại 0 ₫
                </button>
              </div>

              <input
                type="number"
                inputMode="numeric"
                step="5000"
                value={manualAmount}
                onChange={(e) => setManualAmount(Number(e.target.value) || 0)}
                className="h-12 w-full rounded-2xl border border-indigo-200 bg-white px-4 font-mono text-lg font-black tabular-nums text-slate-900 outline-none focus:border-indigo-500 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
              />
              <div className="mt-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                Thành tiền: {formatVndNumber(manualAmount)} ₫
              </div>
            </div>

            <button
              type="submit"
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 text-base font-extrabold text-white shadow-md hover:brightness-105"
            >
              Lưu giao dịch này
            </button>
          </form>
        )}
      </div>

      {/* 3. CONFIRMATION BANNER + VOICE READBACK + 1-TAP UNDO */}
      {lastAddedBatch && (
        <div className="space-y-3 rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-50/95 to-teal-50/90 p-5 shadow-sm dark:border-emerald-500/30 dark:from-emerald-950/40 dark:to-teal-950/30">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Đã ghi nhận thành công
              </div>
              <p className="mt-1 text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">
                “{lastAddedBatch.summary}”
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onSpeakVietnamese(lastAddedBatch.summary)}
              className="inline-flex h-11 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-white px-4 text-xs font-extrabold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200"
            >
              <Volume2 className="h-4 w-4 text-emerald-600" />
              <span>Nghe đọc lại</span>
            </button>

            <button
              type="button"
              onClick={onUndoLastBatch}
              className="inline-flex h-11 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-xs font-extrabold text-white shadow-xs hover:bg-rose-700"
            >
              <Undo2 className="h-4 w-4" />
              <span>Hoàn tác ({lastAddedBatch.ids.length} khoản)</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. RECENT 5 TRANSACTIONS */}
      <div className="space-y-4 rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] sm:p-6">
        <div className="flex items-center justify-between border-b border-indigo-100 pb-3 dark:border-indigo-500/20">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
            5 Giao Dịch Gần Nhất
          </h2>
          <span className="rounded-full bg-indigo-50 px-3 py-1 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            {transactions.length} khoản đã lưu
          </span>
        </div>

        {summaryStats.recentFive.length === 0 ? (
          <div className="py-10 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Sổ thu chi hiện đang ở mức 0 ₫ (chưa có giao dịch nào).
          </div>
        ) : (
          <div className="divide-y divide-indigo-100/60 dark:divide-indigo-500/10">
            {summaryStats.recentFive.map((tx) => {
              const cat = CATEGORY_BY_SLUG[tx.categorySlug] || CATEGORY_BY_SLUG['khac'];
              return (
                <div
                  key={tx.id}
                  className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3.5">
                    <CategoryIcon slug={tx.categorySlug} size="lg" />
                    <div>
                      <div className="text-base font-extrabold text-slate-900 dark:text-white">
                        {tx.description}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{
                            backgroundColor: `${cat.color}18`,
                            color: cat.color,
                          }}
                        >
                          {cat.name}
                        </span>
                        <span>
                          ·{' '}
                          {new Date(tx.transactionDate).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span
                      className={`font-mono text-lg font-black tabular-nums ${
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

                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx.id)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300"
                      title="Xóa khoản này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
