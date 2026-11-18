'use client';

import {
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthScreen } from '@/components/AuthScreen';
import { SeniorModeView } from '@/components/SeniorModeView';
import { StandardModeView } from '@/components/StandardModeView';
import { FinanceRepository } from '@/lib/dataAdapter';
import type {
  CategorySlug,
  FinanceTransaction,
  ParseExpenseResponse,
  TransactionType,
  UIMode,
  UserProfile,
  Wallet,
  WalletType,
} from '@/types/finance';

export default function FinanceProPage() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [uiMode, setUiMode] = useState<UIMode>('standard');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWalletId, setActiveWalletId] = useState<string>('');
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [lastAddedBatch, setLastAddedBatch] = useState<{
    ids: string[];
    summary: string;
    engine: string;
  } | null>(null);

  const speakVietnamese = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.toLowerCase().includes('vi'));
      if (viVoice) utterance.voice = viVoice;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore TTS errors on unsupported devices
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await FinanceRepository.getCurrentSession();
    if (res.profile && res.wallets.length > 0) {
      setProfile(res.profile);
      setUiMode(res.profile.uiMode);
      setWallets(res.wallets);
      const defaultW =
        res.wallets.find((w) => w.id === res.profile?.defaultWalletId)?.id ||
        res.wallets[0].id;
      setActiveWalletId(defaultW);
    } else {
      setProfile(null);
      setWallets([]);
      setActiveWalletId('');
      setTransactions([]);
    }
  }, []);

  const refreshTransactions = useCallback(
    async (walletId: string, userId?: string) => {
      if (!walletId) {
        setTransactions([]);
        return;
      }
      const list = await FinanceRepository.getTransactions(walletId, userId);
      setTransactions(list);
    },
    []
  );

  useEffect(() => {
    refreshSession().finally(() => {
      setHydrated(true);
    });
  }, [refreshSession]);

  useEffect(() => {
    if (hydrated && profile && activeWalletId) {
      refreshTransactions(activeWalletId, profile.id);
    }
  }, [hydrated, profile, activeWalletId, refreshTransactions]);

  // Manage dark mode class
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode && profile) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode, profile]);

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeWalletId) || wallets[0] || null,
    [wallets, activeWalletId]
  );

  const handleSwitchUiMode = async (nextMode: UIMode) => {
    if (!profile) return;
    setLastAddedBatch(null);
    setUiMode(nextMode);
    const updated = await FinanceRepository.updateUserUiMode(profile.id, nextMode);
    if (updated) {
      setProfile(updated);
    }
  };

  const handleSignOut = async () => {
    await FinanceRepository.signOutUser();
    setProfile(null);
    setWallets([]);
    setActiveWalletId('');
    setTransactions([]);
    setLastAddedBatch(null);
  };

  // Submit natural Vietnamese input to /api/parse-expense (Gemini AI + Vietnamese NLP fallback)
  const handleSubmitNaturalInput = async (rawText: string) => {
    if (!profile || !activeWallet) return;
    setIsParsing(true);
    try {
      const response = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      });

      const parsed: ParseExpenseResponse = await response.json();

      if (!parsed.items || parsed.items.length === 0) {
        if (uiMode === 'senior') {
          speakVietnamese(
            parsed.spokenSummaryVi || 'Chưa nghe rõ số tiền, vui lòng nói lại.'
          );
        }
        return;
      }

      const created = await FinanceRepository.addParsedTransactions({
        walletId: activeWallet.id,
        user: profile,
        rawInput: rawText,
        items: parsed.items,
      });

      await refreshTransactions(activeWallet.id, profile.id);

      const engineLabel =
        parsed.engine === 'gemini-developer-api' ||
        parsed.engine === 'gemini-vertex-express'
          ? `Gemini AI (${parsed.modelUsed || '3.5-flash-lite'})`
          : 'Vietnamese NLP';

      setLastAddedBatch({
        ids: created.map((c) => c.id),
        summary: parsed.spokenSummaryVi,
        engine: engineLabel,
      });

      if (uiMode === 'senior') {
        speakVietnamese(parsed.spokenSummaryVi);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleAddManualTransaction = async (params: {
    type: TransactionType;
    amount: number;
    categorySlug: CategorySlug;
    description: string;
    transactionDate: string;
  }) => {
    if (!profile || !activeWallet) return;
    const created = await FinanceRepository.addManualTransaction({
      walletId: activeWallet.id,
      user: profile,
      ...params,
    });
    await refreshTransactions(activeWallet.id, profile.id);
    setLastAddedBatch({
      ids: [created.id],
      summary: `Đã lưu ${params.type === 'income' ? 'khoản thu' : 'khoản chi'} "${
        params.description
      }" (${params.amount.toLocaleString('vi-VN')} ₫)`,
      engine: 'Nhập thủ công',
    });
  };

  const handleCreateWallet = async (params: {
    name: string;
    type: WalletType;
  }) => {
    if (!profile) return;
    const created = await FinanceRepository.createWallet({
      userId: profile.id,
      ...params,
    });
    await refreshSession();
    setActiveWalletId(created.id);
  };

  const handleUndoLastBatch = async () => {
    if (!lastAddedBatch || lastAddedBatch.ids.length === 0 || !activeWallet || !profile)
      return;
    await FinanceRepository.deleteTransactionsByIds(lastAddedBatch.ids);
    setLastAddedBatch(null);
    await refreshTransactions(activeWallet.id, profile.id);
    if (uiMode === 'senior') {
      speakVietnamese('Đã hoàn tác giao dịch vừa lưu.');
    }
  };

  const handleUpdateTransaction = async (
    id: string,
    updates: Partial<
      Pick<FinanceTransaction, 'amount' | 'description' | 'categorySlug' | 'type'>
    >
  ) => {
    if (!activeWallet || !profile) return;
    await FinanceRepository.updateTransaction(id, updates);
    await refreshTransactions(activeWallet.id, profile.id);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!activeWallet || !profile) return;
    await FinanceRepository.deleteTransactionsByIds([id]);
    await refreshTransactions(activeWallet.id, profile.id);
  };

  const handleClearWalletTransactions = async () => {
    if (!activeWallet || !profile) return;
    await FinanceRepository.clearWalletTransactions(activeWallet.id);
    setLastAddedBatch(null);
    await refreshTransactions(activeWallet.id, profile.id);
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center gemini-mesh-bg">
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white px-5 py-3.5 text-sm font-bold text-indigo-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          <span>Đang tải hệ thống Finance Pro...</span>
        </div>
      </div>
    );
  }

  // Mandatory Login & Registration Portal when not authenticated
  if (!profile || !activeWallet) {
    return (
      <AuthScreen
        onAuthenticated={(res) => {
          setProfile(res.profile);
          setUiMode(res.profile.uiMode);
          setWallets(res.wallets);
          const defaultW =
            res.wallets.find((w) => w.id === res.profile.defaultWalletId)?.id ||
            res.wallets[0]?.id ||
            '';
          setActiveWalletId(defaultW);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen transition-colors gemini-mesh-bg">
      {/* STICKY TOP HEADER BAR (User Identity + Clean 2-Mode Switcher + Sign Out) */}
      <header className="sticky top-0 z-30 h-16 border-b border-indigo-100/80 bg-white/85 backdrop-blur-xl dark:border-indigo-500/15 dark:bg-[#0E1322]/85">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          {/* Left: Brand Identity & Logged-In User */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-sky-400 dark:via-indigo-300 dark:to-purple-400 sm:text-lg">
                  Finance Pro
                </span>
                <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-300 md:inline-block">
                  {profile.email}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Tài khoản: <span className="font-extrabold">{profile.displayName}</span> ·{' '}
                <span className="text-indigo-600 dark:text-indigo-300">
                  {activeWallet.name}
                </span>
              </div>
            </div>
          </div>

          {/* Center: 1-Click UI Mode Switcher (Giao diện Chi tiết vs Giao diện Đơn giản) */}
          <div className="inline-flex items-center rounded-2xl border border-indigo-200 bg-slate-100/90 p-1 dark:border-indigo-500/30 dark:bg-[#131B2E]">
            <button
              type="button"
              onClick={() => handleSwitchUiMode('standard')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                uiMode === 'standard'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-indigo-600 dark:text-slate-300'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Giao diện Chi tiết</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchUiMode('senior')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                uiMode === 'senior'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-indigo-600 dark:text-slate-300'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Giao diện Đơn giản</span>
            </button>
          </div>

          {/* Right: Theme Toggle & Sign Out Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-100 bg-white text-slate-600 shadow-2xs transition hover:border-indigo-300 dark:border-indigo-500/20 dark:bg-[#131B2E] dark:text-amber-300"
              title="Đổi giao diện Sáng / Tối"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
              title="Đăng xuất khỏi tài khoản hiện tại"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN DUAL-MODE PERSONAL FINANCE WORKSPACE */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {uiMode === 'standard' ? (
          <StandardModeView
            activeWallet={activeWallet}
            wallets={wallets}
            onSelectWallet={setActiveWalletId}
            transactions={transactions}
            onSubmitNaturalInput={handleSubmitNaturalInput}
            onAddManualTransaction={handleAddManualTransaction}
            onCreateWallet={handleCreateWallet}
            isParsing={isParsing}
            lastAddedBatch={lastAddedBatch}
            onUndoLastBatch={handleUndoLastBatch}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onClearWalletTransactions={handleClearWalletTransactions}
          />
        ) : (
          <SeniorModeView
            activeWallet={activeWallet}
            wallets={wallets}
            onSelectWallet={setActiveWalletId}
            transactions={transactions}
            onSubmitNaturalInput={handleSubmitNaturalInput}
            isParsing={isParsing}
            lastAddedBatch={lastAddedBatch}
            onUndoLastBatch={handleUndoLastBatch}
            onDeleteTransaction={handleDeleteTransaction}
            onSpeakVietnamese={speakVietnamese}
          />
        )}
      </main>
    </div>
  );
}
