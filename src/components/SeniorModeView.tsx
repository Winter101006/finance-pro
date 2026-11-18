'use client';

import {
  CheckCircle2,
  Keyboard,
  Loader2,
  Mic,
  Trash2,
  Undo2,
  Volume2,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_BY_SLUG } from '@/data/categories';
import { formatVndNumber } from '@/lib/vietnameseParser';
import type { FinanceTransaction, Wallet } from '@/types/finance';
import { CategoryIcon } from './CategoryIcon';

interface SeniorModeViewProps {
  activeWallet: Wallet;
  wallets: Wallet[];
  onSelectWallet: (walletId: string) => void;
  transactions: FinanceTransaction[];
  onSubmitNaturalInput: (text: string) => Promise<void>;
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

const SENIOR_QUICK_PHRASES = [
  'Đi chợ mua rau 35 nghìn',
  'Mua thịt bò 1 trăm rưỡi',
  'Sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi',
  'Đóng tiền điện nước 850 nghìn',
  'Mua thuốc bổ 3 lít',
];

const QUICK_DENOMINATIONS = [
  { label: '+ 20.000 đ', value: 20000 },
  { label: '+ 50.000 đ', value: 50000 },
  { label: '+ 100.000 đ', value: 100000 },
  { label: '+ 200.000 đ', value: 200000 },
  { label: '+ 500.000 đ', value: 500000 },
];

export function SeniorModeView({
  activeWallet,
  wallets,
  onSelectWallet,
  transactions,
  onSubmitNaturalInput,
  isParsing,
  lastAddedBatch,
  onUndoLastBatch,
  onDeleteTransaction,
  onSpeakVietnamese,
}: SeniorModeViewProps) {
  const [isListening, setIsListening] = useState(false);
  const [heardTranscript, setHeardTranscript] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [manualItem, setManualItem] = useState('Đi chợ mua thức ăn');
  const [manualAmount, setManualAmount] = useState<number>(100000);

  // Start Web Speech API (vi-VN)
  const handleStartVoiceRecording = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRec) {
      setShowKeyboard(true);
      onSpeakVietnamese(
        'Thiết bị này chưa bật micro, mời bố mẹ bấm nút nhập bằng bàn phím bên dưới.'
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
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    setHeardTranscript('');
    setIsListening(true);

    recognition.onresult = async (event) => {
      const lastIdx = event.results.length - 1;
      const text = event.results[lastIdx]?.[0]?.transcript || '';
      setHeardTranscript(text);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = async () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleConfirmHeardVoice = async () => {
    if (!heardTranscript.trim() || isParsing) return;
    const text = heardTranscript.trim();
    setHeardTranscript('');
    await onSubmitNaturalInput(text);
  };

  const handleManualKeyboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItem.trim() || manualAmount <= 0 || isParsing) return;
    const sentence = `${manualItem.trim()} ${manualAmount} đồng`;
    await onSubmitNaturalInput(sentence);
    setShowKeyboard(false);
  };

  // Today's 5 most recent transactions & Total spent today
  const todayStats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();

    const todayTxs = transactions.filter(
      (tx) => new Date(tx.transactionDate).toDateString() === todayStr
    );

    const displayTxs = (todayTxs.length > 0 ? todayTxs : transactions).slice(0, 5);
    const totalSpentToday = displayTxs
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    return {
      recentFive: displayTxs,
      totalSpentToday,
    };
  }, [transactions]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 text-slate-950">
      {/* HIGH-CONTRAST HEADER BANNER (WCAG AAA) */}
      <div className="rounded-3xl border-4 border-indigo-900 bg-white p-6 shadow-md space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-block rounded-xl bg-indigo-900 px-3.5 py-1 text-base font-extrabold text-white">
              CHẾ ĐỘ CHỮ LỚN DÀNH CHO BỐ MẸ
            </span>
            <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
              Sổ Chi Tiêu: {activeWallet.name}
            </h1>
          </div>
          <div className="rounded-2xl border-2 border-rose-700 bg-rose-50 px-5 py-3 text-left sm:text-right">
            <div className="text-base font-extrabold text-rose-900">
              TỔNG CHI HÔM NAY
            </div>
            <div className="font-mono text-2xl font-black tabular-nums text-rose-800 sm:text-3xl">
              {formatVndNumber(todayStats.totalSpentToday)} đồng
            </div>
          </div>
        </div>

        {/* Big Wallet Selector if user has multiple wallets */}
        {wallets.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t-2 border-slate-200">
            <span className="text-base font-extrabold text-slate-700 mr-1">
              Chọn sổ chi tiêu:
            </span>
            {wallets.map((w) => {
              const active = w.id === activeWallet.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectWallet(w.id)}
                  className={`inline-flex min-h-[48px] items-center gap-2 rounded-2xl border-2 px-4 py-2 text-base font-black transition ${
                    active
                      ? 'border-indigo-950 bg-indigo-900 text-white'
                      : 'border-slate-700 bg-slate-100 text-slate-900 hover:bg-indigo-50'
                  }`}
                >
                  <WalletIcon className="h-5 w-5" />
                  <span>{w.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* GIANT PRIMARY MICROPHONE ACTION CARD */}
      <div className="rounded-3xl border-4 border-indigo-900 bg-white p-6 sm:p-8 shadow-lg text-center space-y-5">
        <p className="text-xl font-bold text-slate-900 sm:text-2xl">
          Bố mẹ chỉ cần bấm nút dưới đây và đọc khoản vừa mua:
        </p>

        <button
          type="button"
          onClick={handleStartVoiceRecording}
          disabled={isParsing}
          className={`flex min-h-[88px] w-full flex-col items-center justify-center gap-3 rounded-3xl border-4 px-6 py-6 text-2xl font-black text-white shadow-xl transition active:scale-[0.99] sm:text-3xl ${
            isListening
              ? 'border-rose-900 bg-rose-700'
              : 'border-indigo-950 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 hover:brightness-105'
          }`}
        >
          {isParsing ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-9 w-9 animate-spin" />
              <span>ĐANG GHI VÀO SỔ...</span>
            </div>
          ) : isListening ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-3">
                <Mic className="h-9 w-9 animate-bounce" />
                <span>ĐANG NGHE BỐ MẸ NÓI...</span>
              </div>
              {/* Clear Visual Sound Wave Bars */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="h-4 w-2 animate-pulse rounded-full bg-white" />
                <span className="h-8 w-2 animate-pulse rounded-full bg-amber-300" />
                <span className="h-6 w-2 animate-pulse rounded-full bg-white" />
                <span className="h-9 w-2 animate-pulse rounded-full bg-amber-300" />
                <span className="h-5 w-2 animate-pulse rounded-full bg-white" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <Mic className="h-10 w-10 shrink-0" />
              <span>BẤM ĐỂ NÓI CHI TIÊU</span>
            </div>
          )}
        </button>

        {/* If voice transcript was captured, show big confirmation button */}
        {heardTranscript && (
          <div className="rounded-2xl border-4 border-emerald-800 bg-emerald-50 p-5 text-left space-y-4">
            <div className="text-xl font-bold text-emerald-950">
              Câu bố mẹ vừa nói: <span className="underline">“{heardTranscript}”</span>
            </div>
            <button
              type="button"
              onClick={handleConfirmHeardVoice}
              className="min-h-[68px] w-full rounded-2xl bg-emerald-700 px-6 text-2xl font-black text-white shadow-md hover:bg-emerald-800"
            >
              ĐÚNG RỒI, LƯU VÀO SỔ NGAY
            </button>
          </div>
        )}

        {/* Quick 1-Tap Common Phrases */}
        <div className="pt-2 text-left">
          <div className="text-lg font-extrabold text-slate-800 mb-2.5">
            Hoặc chạm 1 lần vào câu mẫu thường dùng:
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SENIOR_QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                disabled={isParsing}
                onClick={() => onSubmitNaturalInput(phrase)}
                className="flex min-h-[64px] items-center justify-between rounded-2xl border-2 border-indigo-900 bg-indigo-50/80 px-4 py-3 text-left text-lg font-extrabold text-indigo-950 transition hover:bg-indigo-100 active:scale-[0.99]"
              >
                <span>“{phrase}”</span>
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Giant Button: NHẬP BẰNG BÀN PHÍM */}
        <button
          type="button"
          onClick={() => setShowKeyboard((v) => !v)}
          className="flex min-h-[68px] w-full items-center justify-center gap-3 rounded-2xl border-4 border-slate-900 bg-amber-100 px-6 text-xl font-black text-slate-950 transition hover:bg-amber-200 sm:text-2xl"
        >
          <Keyboard className="h-7 w-7 shrink-0" />
          <span>{showKeyboard ? 'ĐÓNG BÀN PHÍM NHẬP TAY' : 'NHẬP BẰNG BÀN PHÍM'}</span>
        </button>

        {/* Senior-Friendly Keyboard Panel with Quick Denominations */}
        {showKeyboard && (
          <form
            onSubmit={handleManualKeyboardSubmit}
            className="rounded-3xl border-4 border-slate-900 bg-slate-50 p-5 text-left space-y-5"
          >
            <div>
              <label className="block text-xl font-black text-slate-950 mb-2">
                1. Bố mẹ mua gì hoặc chi việc gì?
              </label>
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  'Đi chợ mua thức ăn',
                  'Mua rau củ quả',
                  'Mua thịt cá',
                  'Đóng tiền điện nước',
                  'Mua thuốc bổ',
                  'Ăn sáng',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setManualItem(preset)}
                    className={`min-h-[52px] rounded-xl border-2 px-4 text-lg font-extrabold ${
                      manualItem === preset
                        ? 'border-indigo-950 bg-indigo-800 text-white'
                        : 'border-slate-800 bg-white text-slate-950'
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
                className="min-h-[64px] w-full rounded-2xl border-3 border-slate-900 bg-white px-4 text-xl font-extrabold text-slate-950"
              />
            </div>

            <div>
              <label className="block text-xl font-black text-slate-900 mb-2">
                2. Số tiền bao nhiêu đồng?
              </label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 mb-3">
                {QUICK_DENOMINATIONS.map((den) => (
                  <button
                    key={den.value}
                    type="button"
                    onClick={() => setManualAmount((prev) => prev + den.value)}
                    className="min-h-[64px] rounded-2xl border-2 border-emerald-900 bg-emerald-100 px-3 font-mono text-lg font-black text-emerald-950 hover:bg-emerald-200"
                  >
                    {den.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setManualAmount(0)}
                  className="min-h-[64px] rounded-2xl border-2 border-rose-900 bg-rose-100 px-3 text-lg font-black text-rose-950 hover:bg-rose-200"
                >
                  Xóa về 0 đ
                </button>
              </div>

              <input
                type="number"
                step="5000"
                value={manualAmount}
                onChange={(e) => setManualAmount(Number(e.target.value) || 0)}
                className="min-h-[64px] w-full rounded-2xl border-3 border-slate-900 bg-white px-4 font-mono text-2xl font-black tabular-nums text-slate-950"
              />
              <div className="mt-1 text-lg font-bold text-indigo-900">
                Thành tiền: {formatVndNumber(manualAmount)} đồng
              </div>
            </div>

            <button
              type="submit"
              className="min-h-[68px] w-full rounded-2xl bg-emerald-700 px-6 text-2xl font-black text-white shadow-lg hover:bg-emerald-800"
            >
              LƯU KHOẢN CHI NÀY VÀO SỔ
            </button>
          </form>
        )}
      </div>

      {/* GIANT CONFIRMATION CARD + VOICE READBACK + GIANT UNDO BUTTON */}
      {lastAddedBatch && (
        <div className="space-y-4">
          <div className="rounded-3xl border-4 border-emerald-800 bg-emerald-50 p-6 shadow-md space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 h-9 w-9 shrink-0 text-emerald-700" />
              <div>
                <div className="text-lg font-extrabold uppercase text-emerald-900">
                  ĐÃ GHI VÀO SỔ THÀNH CÔNG:
                </div>
                <p className="mt-1 text-2xl font-black leading-snug text-slate-950 sm:text-3xl">
                  “{lastAddedBatch.summary}”
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSpeakVietnamese(lastAddedBatch.summary)}
              className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-emerald-900 bg-white px-5 text-xl font-black text-emerald-950 hover:bg-emerald-100"
            >
              <Volume2 className="h-7 w-7 text-emerald-700" />
              <span>BẤM ĐỂ NGHE ĐỌC LẠI</span>
            </button>
          </div>

          {/* GIANT 1-TAP UNDO BUTTON */}
          <button
            type="button"
            onClick={onUndoLastBatch}
            className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-3xl border-4 border-rose-950 bg-rose-700 px-6 py-4 text-2xl font-black text-white shadow-xl transition hover:bg-rose-800 active:scale-[0.99]"
          >
            <Undo2 className="h-8 w-8 shrink-0" />
            <span>HOÀN TÁC (XÓA KHOẢN VỪA GHI)</span>
          </button>
        </div>
      )}

      {/* BOTTOM LIST: ONLY 5 MOST RECENT TRANSACTIONS TODAY */}
      <div className="rounded-3xl border-4 border-slate-900 bg-white p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between border-b-2 border-slate-300 pb-3">
          <h2 className="text-2xl font-black text-slate-950">
            5 Khoản Vừa Ghi Gần Nhất
          </h2>
          <span className="rounded-xl bg-slate-200 px-3 py-1 font-mono text-base font-extrabold text-slate-900">
            Hôm nay
          </span>
        </div>

        {todayStats.recentFive.length === 0 ? (
          <div className="py-8 text-center text-xl font-bold text-slate-600">
            Sổ chi tiêu này hiện đang ở mức 0 đồng (chưa có giao dịch nào).
          </div>
        ) : (
          <div className="divide-y-2 divide-slate-200">
            {todayStats.recentFive.map((tx) => {
              const cat = CATEGORY_BY_SLUG[tx.categorySlug] || CATEGORY_BY_SLUG['khac'];
              return (
                <div
                  key={tx.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <CategoryIcon slug={tx.categorySlug} size="xl" />
                    <div>
                      <div className="text-xl font-black text-slate-950 sm:text-2xl">
                        {tx.description}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-slate-700">
                        <span className="rounded-lg bg-slate-200 px-2.5 py-0.5 text-slate-900">
                          Mục: {cat.name}
                        </span>
                        <span>
                          ·{' '}
                          {new Date(tx.transactionDate).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {tx.userDisplayName && (
                          <span className="rounded-lg bg-indigo-100 px-2 py-0.5 text-sm font-extrabold text-indigo-900">
                            {tx.userDisplayName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span
                      className={`font-mono text-2xl font-black tabular-nums ${
                        tx.type === 'income' ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '−'}
                      {formatVndNumber(tx.amount)} đ
                    </span>

                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx.id)}
                      className="flex min-h-[56px] items-center gap-1.5 rounded-2xl border-2 border-rose-800 bg-rose-50 px-4 text-base font-black text-rose-900 hover:bg-rose-100"
                      title="Xóa khoản này"
                    >
                      <Trash2 className="h-5 w-5" />
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
