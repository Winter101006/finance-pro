'use client';

import {
  BarChart3,
  BookOpen,
  Home,
  LayoutDashboard,
  Loader2,
  Mic,
  Moon,
  Sparkles,
  Sun,
  User as UserIcon,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccountCenter } from '@/components/AccountCenterModal';
import { AuthScreen } from '@/components/AuthScreen';
import { SeniorModeView } from '@/components/SeniorModeView';
import { type MobileNavTab, StandardModeView } from '@/components/StandardModeView';
import { VoiceRecorderSheet } from '@/components/VoiceRecorderSheet';
import { CATEGORY_BY_SLUG } from '@/data/categories';
import { AVATAR_COLOR_PRESETS, FinanceRepository } from '@/lib/dataAdapter';
import { buildSpokenSummaryVi, parseVietnameseExpenseText } from '@/lib/vietnameseParser';
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
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('overview');
  const [lastAddedBatch, setLastAddedBatch] = useState<{
    batchToken: string;
    ids: string[];
    summary: string;
    engine: string;
  } | null>(null);

  // Tracks undone optimistic batch tokens so late async responses never resurrect undone items
  const undoneBatchTokensRef = useRef<Set<string>>(new Set());

  const speakVietnamese = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.96;
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
      setActiveWalletId((prev) => {
        if (prev && res.wallets.some((w) => w.id === prev)) return prev;
        return (
          res.wallets.find((w) => w.id === res.profile?.defaultWalletId)?.id ||
          res.wallets[0].id
        );
      });
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
    setAccountModalOpen(false);
    setMobileTab('overview');
  };

  const handleDeleteAccount = async () => {
    if (!profile) return;
    await FinanceRepository.deleteUserAccount(profile.id);
    setProfile(null);
    setWallets([]);
    setActiveWalletId('');
    setTransactions([]);
    setLastAddedBatch(null);
    setAccountModalOpen(false);
    setMobileTab('overview');
  };

  // Zero-delay Optimistic AI / NLP Expense Submission
  const handleSubmitNaturalInput = async (
    rawText: string,
    forcedType: 'auto' | TransactionType = 'auto'
  ) => {
    if (!profile || !activeWallet) return;
    const cleanText = rawText.trim();
    if (!cleanText) return;

    const batchToken = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    // Step 1: 0ms Optimistic On-Device Parse so user experiences ZERO wait delay
    const optimisticParsed = parseVietnameseExpenseText(cleanText, nowIso, forcedType);
    const optimisticIds: string[] = [];

    if (optimisticParsed.length > 0) {
      const tempRows: FinanceTransaction[] = optimisticParsed.map((item, idx) => {
        const cat = CATEGORY_BY_SLUG[item.categorySlug] || CATEGORY_BY_SLUG['khac'];
        const tempId = `opt-${batchToken}-${idx}`;
        optimisticIds.push(tempId);
        return {
          id: tempId,
          walletId: activeWallet.id,
          userId: profile.id,
          userDisplayName: profile.displayName,
          categoryId: cat.id,
          categorySlug: cat.slug,
          amount: Math.round(item.amount),
          type: item.type,
          description: item.description,
          rawInput: cleanText,
          transactionDate: item.transactionDate,
          createdAt: nowIso,
        };
      });

      setTransactions((prev) => [...tempRows, ...prev]);
      const summary = buildSpokenSummaryVi(optimisticParsed);
      setLastAddedBatch({
        batchToken,
        ids: optimisticIds,
        summary,
        engine: 'Xử lý tức thì (0ms)',
      });
      if (uiMode === 'senior') {
        speakVietnamese(summary);
      }
    } else {
      setIsParsing(true);
    }

    try {
      // Step 2: Confirm / refine via backend (/api/parse-expense has 2.5s timeout + cache)
      const response = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, forcedType }),
      });

      const parsed: ParseExpenseResponse = await response.json();
      const finalItems =
        parsed.items && parsed.items.length > 0 ? parsed.items : optimisticParsed;

      // Remove temporary optimistic placeholder rows
      if (optimisticIds.length > 0) {
        const optSet = new Set(optimisticIds);
        setTransactions((prev) => prev.filter((t) => !optSet.has(t.id)));
      }

      if (undoneBatchTokensRef.current.has(batchToken)) {
        return;
      }

      if (!finalItems || finalItems.length === 0) {
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
        rawInput: cleanText,
        items: finalItems,
      });

      // Race check again in case Undo was pressed during persistence
      if (undoneBatchTokensRef.current.has(batchToken)) {
        await FinanceRepository.deleteTransactionsByIds(created.map((c) => c.id));
        return;
      }

      await refreshTransactions(activeWallet.id, profile.id);

      const engineLabel =
        parsed.engine === 'gemini-developer-api' ||
        parsed.engine === 'gemini-vertex-express'
          ? `Gemini AI (${parsed.modelUsed || '3.5-flash-lite'})`
          : 'Vietnamese NLP (Tức thì)';

      setLastAddedBatch({
        batchToken,
        ids: created.map((c) => c.id),
        summary: parsed.spokenSummaryVi || buildSpokenSummaryVi(finalItems),
        engine: engineLabel,
      });

      if (uiMode === 'senior' && optimisticParsed.length === 0) {
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
      batchToken: `manual-${created.id}`,
      ids: [created.id],
      summary: `Đã lưu ${params.type === 'income' ? 'khoản thu' : 'khoản chi'} "${
        params.description
      }" (${params.amount.toLocaleString('vi-VN')} ₫)`,
      engine: 'Nhập thủ công',
    });
  };

  const handleCreateWallet = async (params: { name: string; type: WalletType }) => {
    if (!profile) return;
    const created = await FinanceRepository.createWallet({
      userId: profile.id,
      ...params,
    });
    await refreshSession();
    setActiveWalletId(created.id);
  };

  const handleRenameWallet = async (walletId: string, newName: string) => {
    if (!profile) return;
    await FinanceRepository.renameWallet(walletId, profile.id, newName);
    await refreshSession();
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (!profile) return;
    await FinanceRepository.deleteWallet(walletId, profile.id);
    const res = await FinanceRepository.getCurrentSession();
    setWallets(res.wallets);
    if (res.wallets.length > 0 && activeWalletId === walletId) {
      setActiveWalletId(res.wallets[0].id);
    }
  };

  const handleUndoLastBatch = async () => {
    if (!lastAddedBatch || !activeWallet || !profile) return;
    undoneBatchTokensRef.current.add(lastAddedBatch.batchToken);

    const optIds = lastAddedBatch.ids.filter((id) => id.startsWith('opt-'));
    const persistedIds = lastAddedBatch.ids.filter((id) => !id.startsWith('opt-'));

    if (optIds.length > 0) {
      const optSet = new Set(optIds);
      setTransactions((prev) => prev.filter((t) => !optSet.has(t.id)));
    }
    if (persistedIds.length > 0) {
      await FinanceRepository.deleteTransactionsByIds(persistedIds);
      await refreshTransactions(activeWallet.id, profile.id);
    }
    setLastAddedBatch(null);
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
    if (id.startsWith('opt-')) {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    await FinanceRepository.deleteTransactionsByIds([id]);
    await refreshTransactions(activeWallet.id, profile.id);
  };

  const handleClearWalletTransactions = async () => {
    if (!activeWallet || !profile) return;
    await FinanceRepository.clearWalletTransactions(activeWallet.id);
    setLastAddedBatch(null);
    await refreshTransactions(activeWallet.id, profile.id);
  };

  const exportCsvQuick = () => {
    if (!activeWallet) return;
    const rows = [
      ['ID', 'Thời gian', 'Ví', 'Loại', 'Danh mục', 'Nội dung', 'Số tiền (VNĐ)'],
      ...transactions.map((t) => [
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
          setMobileTab('overview');
        }}
      />
    );
  }

  const avatarBg = profile.avatarColor || AVATAR_COLOR_PRESETS[0];

  return (
    <div className="min-h-screen transition-colors gemini-mesh-bg">
      {/* =====================================================================
          RESPONSIVE STICKY TOP HEADER BAR
         ===================================================================== */}
      <header className="sticky top-0 z-30 h-14 border-b border-indigo-100/80 bg-white/85 backdrop-blur-xl dark:border-indigo-500/15 dark:bg-[#0E1322]/85 sm:h-16">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-3.5 sm:px-6">
          {/* Left: Brand Identity */}
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25 sm:h-10 sm:w-10">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-sky-400 dark:via-indigo-300 dark:to-purple-400 sm:text-lg">
                  Finance Pro
                </span>
              </div>
              <div className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {activeWallet.name} · {profile.displayName}
              </div>
            </div>
          </div>

          {/* Center: Mode Switcher (Compact on Mobile, Full Pill on Desktop) */}
          <div className="hidden items-center rounded-2xl border border-indigo-200 bg-slate-100/90 p-1 dark:border-indigo-500/30 dark:bg-[#131B2E] lg:inline-flex">
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

          {/* Right: Mobile Mode Chip + Theme Toggle + Account Center Avatar Button */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Quick Mobile Mode Switcher */}
            <button
              type="button"
              onClick={() =>
                handleSwitchUiMode(uiMode === 'standard' ? 'senior' : 'standard')
              }
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/80 px-2.5 text-[11px] font-extrabold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-200 lg:hidden"
            >
              {uiMode === 'standard' ? (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  <span>Đơn giản</span>
                </>
              ) : (
                <>
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span>Chi tiết</span>
                </>
              )}
            </button>

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
              onClick={() => setAccountModalOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-2xl border border-indigo-200 bg-white pl-1.5 pr-2.5 text-xs font-extrabold text-slate-800 shadow-2xs transition hover:border-indigo-400 dark:border-indigo-500/30 dark:bg-[#131B2E] dark:text-white"
              title="Mở Trung tâm Tài khoản & Bảo mật"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-xl text-[10px] font-black text-white"
                style={{ backgroundColor: avatarBg }}
              >
                {profile.avatarText}
              </span>
              <span className="hidden max-w-[110px] truncate sm:inline">
                {profile.displayName}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* =====================================================================
          MAIN WORKSPACE
         ===================================================================== */}
      <main className="mx-auto max-w-7xl px-3.5 pt-4 sm:px-6 sm:pt-6">
        {/* On mobile, if user selected the "Tài khoản" tab in bottom bar, show inline Account Center */}
        {mobileTab === 'account' ? (
          <div className="pb-28 lg:hidden">
            <AccountCenter
              profile={profile}
              wallets={wallets}
              activeWalletId={activeWallet.id}
              transactionsCount={transactions.length}
              uiMode={uiMode}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
              onChangeUiMode={handleSwitchUiMode}
              onSelectWallet={(wId) => {
                setActiveWalletId(wId);
                setMobileTab('overview');
              }}
              onCreateWallet={handleCreateWallet}
              onRenameWallet={handleRenameWallet}
              onDeleteWallet={handleDeleteWallet}
              onProfileUpdated={setProfile}
              onSignOut={handleSignOut}
              onDeleteAccount={handleDeleteAccount}
              onExportCsv={exportCsvQuick}
            />
          </div>
        ) : null}

        <div className={mobileTab === 'account' ? 'hidden lg:block' : 'block'}>
          {uiMode === 'standard' ? (
            <StandardModeView
              activeWallet={activeWallet}
              wallets={wallets}
              onSelectWallet={setActiveWalletId}
              transactions={transactions}
              onSubmitNaturalInput={handleSubmitNaturalInput}
              onOpenVoiceSheet={() => setVoiceSheetOpen(true)}
              onAddManualTransaction={handleAddManualTransaction}
              manualModalOpen={manualModalOpen}
              onSetManualModalOpen={setManualModalOpen}
              onCreateWallet={handleCreateWallet}
              isParsing={isParsing}
              lastAddedBatch={lastAddedBatch}
              onUndoLastBatch={handleUndoLastBatch}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onClearWalletTransactions={handleClearWalletTransactions}
              mobileTab={mobileTab}
              onChangeMobileTab={setMobileTab}
            />
          ) : (
            <SeniorModeView
              activeWallet={activeWallet}
              wallets={wallets}
              onSelectWallet={setActiveWalletId}
              transactions={transactions}
              onSubmitNaturalInput={handleSubmitNaturalInput}
              onOpenVoiceSheet={() => setVoiceSheetOpen(true)}
              isParsing={isParsing}
              lastAddedBatch={lastAddedBatch}
              onUndoLastBatch={handleUndoLastBatch}
              onDeleteTransaction={handleDeleteTransaction}
              onSpeakVietnamese={speakVietnamese}
            />
          )}
        </div>
      </main>

      {/* =====================================================================
          MOBILE BOTTOM NAVIGATION BAR WITH RAISED VOICE AI FAB (Phone UX)
         ===================================================================== */}
      <nav
        aria-label="Điều hướng điện thoại"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-indigo-100/90 bg-white/95 pb-safe shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-indigo-500/20 dark:bg-[#0E1322]/95 lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <button
            type="button"
            onClick={() => setMobileTab('overview')}
            className={`flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-extrabold transition ${
              mobileTab === 'overview'
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <Home className="h-5 w-5" />
            <span>Tổng quan</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (uiMode === 'senior') handleSwitchUiMode('standard');
              setMobileTab('charts');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-extrabold transition ${
              mobileTab === 'charts'
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span>Biểu đồ</span>
          </button>

          {/* Center Raised Voice Studio Mic Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setVoiceSheetOpen(true)}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-[0_8px_24px_rgba(79,70,229,0.45)] ring-4 ring-white transition active:scale-95 dark:ring-[#0E1322]"
              title="Nói ghi nhanh với Sóng âm AI"
            >
              <Mic className="h-6 w-6" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (uiMode === 'senior') handleSwitchUiMode('standard');
              setMobileTab('ledger');
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-extrabold transition ${
              mobileTab === 'ledger'
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <BookOpen className="h-5 w-5" />
            <span>Sổ chi</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('account')}
            className={`flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-extrabold transition ${
              mobileTab === 'account'
                ? 'text-indigo-600 dark:text-indigo-300'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <UserIcon className="h-5 w-5" />
            <span>Tài khoản</span>
          </button>
        </div>
      </nav>

      {/* =====================================================================
          LIVE 60FPS FLUID WAVEFORM VOICE STUDIO SHEET
         ===================================================================== */}
      <VoiceRecorderSheet
        open={voiceSheetOpen}
        onClose={() => setVoiceSheetOpen(false)}
        onSubmitTranscript={handleSubmitNaturalInput}
        isSubmitting={isParsing}
      />

      {/* =====================================================================
          ACCOUNT CENTER MODAL (Desktop / Quick Avatar Click)
         ===================================================================== */}
      {accountModalOpen && (
        <AccountCenter
          asModal
          onClose={() => setAccountModalOpen(false)}
          profile={profile}
          wallets={wallets}
          activeWalletId={activeWallet.id}
          transactionsCount={transactions.length}
          uiMode={uiMode}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onChangeUiMode={handleSwitchUiMode}
          onSelectWallet={setActiveWalletId}
          onCreateWallet={handleCreateWallet}
          onRenameWallet={handleRenameWallet}
          onDeleteWallet={handleDeleteWallet}
          onProfileUpdated={setProfile}
          onSignOut={handleSignOut}
          onDeleteAccount={handleDeleteAccount}
          onExportCsv={exportCsvQuick}
        />
      )}
    </div>
  );
}
