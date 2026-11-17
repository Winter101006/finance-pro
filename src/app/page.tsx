'use client';

import {
  Cloud,
  GraduationCap,
  HeartHandshake,
  Moon,
  Sparkles,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthAndCloudModal } from '@/components/AuthAndCloudModal';
import { SeniorModeView } from '@/components/SeniorModeView';
import { StandardModeView } from '@/components/StandardModeView';
import { DEMO_PROFILES, DEMO_WALLETS } from '@/data/categories';
import {
  FinanceRepository,
  resetLocalDemoData,
  setLocalPersona,
  type DemoPersonaKey,
} from '@/lib/dataAdapter';
import type {
  FinanceTransaction,
  ParseExpenseResponse,
  UIMode,
  UserProfile,
  Wallet,
} from '@/types/finance';

export default function FinanceProPage() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(DEMO_PROFILES.student);
  const [uiMode, setUiMode] = useState<UIMode>('standard');
  const [wallets, setWallets] = useState<Wallet[]>(DEMO_WALLETS);
  const [activeWalletId, setActiveWalletId] = useState<string>(DEMO_WALLETS[0].id);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [isCloud, setIsCloud] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
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

  const refreshProfileAndWallets = useCallback(async () => {
    const res = await FinanceRepository.getCurrentUserProfile();
    setIsCloud(res.isCloud);
    if (res.profile) {
      setProfile(res.profile);
      setUiMode(res.profile.uiMode);
      const list = res.wallets.length > 0 ? res.wallets : DEMO_WALLETS;
      setWallets(list);
      const defaultW =
        list.find((w) => w.id === res.profile?.defaultWalletId)?.id || list[0].id;
      setActiveWalletId(defaultW);
    } else {
      // Cloud configured but not logged in yet -> use local student preview until logged in
      setProfile(DEMO_PROFILES.student);
      setWallets(DEMO_WALLETS);
      setActiveWalletId(DEMO_WALLETS[0].id);
    }
  }, []);

  const refreshTransactions = useCallback(async (walletId: string) => {
    if (!walletId) return;
    const list = await FinanceRepository.getTransactions(walletId);
    setTransactions(list);
  }, []);

  useEffect(() => {
    setHydrated(true);
    refreshProfileAndWallets();
  }, [refreshProfileAndWallets]);

  useEffect(() => {
    if (hydrated && activeWalletId) {
      refreshTransactions(activeWalletId);
    }
  }, [hydrated, activeWalletId, refreshTransactions]);

  // Manage dark mode class (Senior Mode always uses high-contrast light surface for WCAG AAA)
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode && uiMode === 'standard') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode, uiMode]);

  const activeWallet = useMemo(
    () => wallets.find((w) => w.id === activeWalletId) || wallets[0] || DEMO_WALLETS[0],
    [wallets, activeWalletId]
  );

  // Switch between Student (Standard Mode) & Parent (Senior Mode) in 1 click
  const handleSwitchPersonaAndMode = async (targetPersona: DemoPersonaKey) => {
    setLastAddedBatch(null);
    if (!FinanceRepository.isCloudEnabled()) {
      const nextProfile = setLocalPersona(targetPersona);
      setProfile(nextProfile);
      setUiMode(nextProfile.uiMode);
      setActiveWalletId(nextProfile.defaultWalletId);
      await refreshTransactions(nextProfile.defaultWalletId);
    } else {
      const nextMode: UIMode = targetPersona === 'parent' ? 'senior' : 'standard';
      setUiMode(nextMode);
      const targetWallet = wallets.find((w) =>
        targetPersona === 'parent' ? w.type === 'family' : w.type === 'personal'
      );
      if (targetWallet) {
        setActiveWalletId(targetWallet.id);
      }
    }
  };

  // Submit natural Vietnamese input to /api/parse-expense (Gemini AI + Vietnamese NLP fallback)
  const handleSubmitNaturalInput = async (rawText: string) => {
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
          speakVietnamese(parsed.spokenSummaryVi || 'Chưa nghe rõ số tiền, xin nói lại.');
        }
        return;
      }

      const created = await FinanceRepository.addParsedTransactions({
        walletId: activeWallet.id,
        user: profile,
        rawInput: rawText,
        items: parsed.items,
      });

      await refreshTransactions(activeWallet.id);

      const engineLabel =
        parsed.engine === 'gemini-developer-api' || parsed.engine === 'gemini-vertex-express'
          ? `Gemini AI (${parsed.modelUsed || '3.5-flash-lite'})`
          : 'Vietnamese NLP';

      setLastAddedBatch({
        ids: created.map((c) => c.id),
        summary: parsed.spokenSummaryVi,
        engine: engineLabel,
      });

      // Automatically speak confirmation aloud in Senior Mode
      if (uiMode === 'senior') {
        speakVietnamese(parsed.spokenSummaryVi);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleUndoLastBatch = async () => {
    if (!lastAddedBatch || lastAddedBatch.ids.length === 0) return;
    await FinanceRepository.deleteTransactionsByIds(lastAddedBatch.ids);
    setLastAddedBatch(null);
    await refreshTransactions(activeWallet.id);
    if (uiMode === 'senior') {
      speakVietnamese('Đã xóa khoản chi vừa ghi.');
    }
  };

  const handleUpdateTransaction = async (
    id: string,
    updates: Partial<Pick<FinanceTransaction, 'amount' | 'description' | 'categorySlug' | 'type'>>
  ) => {
    await FinanceRepository.updateTransaction(id, updates);
    await refreshTransactions(activeWallet.id);
  };

  const handleDeleteTransaction = async (id: string) => {
    await FinanceRepository.deleteTransactionsByIds([id]);
    await refreshTransactions(activeWallet.id);
  };

  const handleUpdateBudget = async (monthly: number, weekly: number) => {
    await FinanceRepository.updateWalletBudget(activeWallet.id, monthly, weekly);
    await refreshProfileAndWallets();
  };

  const handleResetDemo = () => {
    const res = resetLocalDemoData();
    setWallets(res.wallets);
    setLastAddedBatch(null);
    refreshTransactions(activeWallet.id);
  };

  const handleSyncLocalToCloud = async () => {
    await FinanceRepository.syncLocalDataToCloud(activeWallet.id, profile.id);
    await refreshTransactions(activeWallet.id);
  };

  return (
    <div
      className={`min-h-screen transition-colors ${
        uiMode === 'senior' ? 'bg-[#FFFDF9] text-slate-950' : 'gemini-mesh-bg'
      }`}
    >
      {/* STICKY TOP HEADER BAR (Dual-Mode Switcher + Persona + Cloud Status) */}
      <header
        className={`sticky top-0 z-30 h-16 border-b backdrop-blur-xl ${
          uiMode === 'senior'
            ? 'border-b-4 border-indigo-950 bg-white'
            : 'border-indigo-100/80 bg-white/85 dark:border-indigo-500/15 dark:bg-[#0E1322]/85'
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent dark:from-sky-400 dark:via-indigo-300 dark:to-purple-400 sm:text-lg">
                  Finance Pro
                </span>
                <span className="hidden rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-300 md:inline-block">
                  Gemini AI · Dual-UX
                </span>
              </div>
              <div className="hidden text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:block">
                {profile.displayName} · {activeWallet.name}
              </div>
            </div>
          </div>

          {/* Center: 1-Click Dual-Mode & Persona Switcher */}
          <div className="inline-flex items-center rounded-2xl border-2 border-indigo-200 bg-slate-100/90 p-1 dark:border-indigo-500/30 dark:bg-[#131B2E]">
            <button
              type="button"
              onClick={() => handleSwitchPersonaAndMode('student')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                uiMode === 'standard'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-indigo-600 dark:text-slate-300'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              <span>Sinh viên (Standard)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchPersonaAndMode('parent')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                uiMode === 'senior'
                  ? 'bg-indigo-900 text-white shadow-sm'
                  : 'text-slate-700 hover:text-indigo-600 dark:text-slate-300'
              }`}
            >
              <HeartHandshake className="h-4 w-4" />
              <span>Bố / Mẹ (Chữ Lớn)</span>
            </button>
          </div>

          {/* Right: Cloud Status & Theme Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCloudModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 shadow-2xs transition hover:bg-indigo-50 dark:border-indigo-500/25 dark:bg-[#131B2E] dark:text-indigo-300"
            >
              {isCloud ? (
                <>
                  <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="hidden sm:inline">Supabase Cloud</span>
                </>
              ) : (
                <>
                  <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="hidden sm:inline">Local-First (Đám mây)</span>
                </>
              )}
            </button>

            {uiMode === 'standard' && (
              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-100 bg-white text-slate-600 shadow-2xs transition hover:border-indigo-300 dark:border-indigo-500/20 dark:bg-[#131B2E] dark:text-amber-300"
                title="Đổi giao diện Sáng / Tối"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN DUAL-MODE WORKSPACE */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {uiMode === 'standard' ? (
          <StandardModeView
            activeWallet={activeWallet}
            wallets={wallets}
            onSelectWallet={setActiveWalletId}
            transactions={transactions}
            onSubmitNaturalInput={handleSubmitNaturalInput}
            isParsing={isParsing}
            lastAddedBatch={lastAddedBatch}
            onUndoLastBatch={handleUndoLastBatch}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onUpdateBudget={handleUpdateBudget}
            onResetDemoData={handleResetDemo}
          />
        ) : (
          <SeniorModeView
            activeWallet={activeWallet}
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

      {/* Cloud & Auth Configuration Modal */}
      <AuthAndCloudModal
        open={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        isCloudConfigured={FinanceRepository.isCloudEnabled()}
        isLoggedIn={isCloud && Boolean(profile.email)}
        userEmail={profile.email}
        onSyncLocalToCloud={handleSyncLocalToCloud}
        onAuthSuccess={() => {
          refreshProfileAndWallets();
        }}
      />
    </div>
  );
}
