import {
  CATEGORY_BY_SLUG,
  createInitialDemoTransactions,
  DEMO_PROFILES,
  DEMO_WALLETS,
} from '../data/categories';
import type {
  CategorySlug,
  FinanceTransaction,
  ParsedExpenseItem,
  UIMode,
  UserProfile,
  Wallet,
} from '../types/finance';
import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase/client';

const LOCAL_TX_KEY = 'finance_pro_transactions_v1';
const LOCAL_WALLETS_KEY = 'finance_pro_wallets_v1';
const LOCAL_PERSONA_KEY = 'finance_pro_active_persona_v1';

export type DemoPersonaKey = 'student' | 'parent';

function isLocalDemoWallet(walletId: string): boolean {
  return walletId.startsWith('wallet-');
}

export function getLocalPersona(): DemoPersonaKey {
  if (typeof window === 'undefined') return 'student';
  const saved = localStorage.getItem(LOCAL_PERSONA_KEY);
  return saved === 'parent' ? 'parent' : 'student';
}

export function setLocalPersona(persona: DemoPersonaKey): UserProfile {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_PERSONA_KEY, persona);
  }
  return DEMO_PROFILES[persona];
}

export function loadLocalWallets(): Wallet[] {
  if (typeof window === 'undefined') return DEMO_WALLETS;
  try {
    const raw = localStorage.getItem(LOCAL_WALLETS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_WALLETS_KEY, JSON.stringify(DEMO_WALLETS));
      return DEMO_WALLETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEMO_WALLETS;
  } catch {
    return DEMO_WALLETS;
  }
}

export function saveLocalWallets(wallets: Wallet[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_WALLETS_KEY, JSON.stringify(wallets));
}

export function loadLocalTransactions(): FinanceTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_TX_KEY);
    if (!raw) {
      const initial = createInitialDemoTransactions();
      localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : createInitialDemoTransactions();
  } catch {
    return createInitialDemoTransactions();
  }
}

export function saveLocalTransactions(txs: FinanceTransaction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(txs));
}

export function resetLocalDemoData(): {
  wallets: Wallet[];
  transactions: FinanceTransaction[];
} {
  const initialTx = createInitialDemoTransactions();
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_WALLETS_KEY, JSON.stringify(DEMO_WALLETS));
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(initialTx));
  }
  return { wallets: DEMO_WALLETS, transactions: initialTx };
}

/**
 * Unified Repository Adapter (Local-First -> Supabase Cloud Ready)
 */
export const FinanceRepository = {
  isCloudEnabled(): boolean {
    return isSupabaseConfigured();
  },

  async getCurrentUserProfile(): Promise<{
    profile: UserProfile | null;
    wallets: Wallet[];
    isCloud: boolean;
  }> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const persona = getLocalPersona();
      return {
        profile: DEMO_PROFILES[persona],
        wallets: loadLocalWallets(),
        isCloud: false,
      };
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { profile: null, wallets: [], isCloud: false };
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const { data: walletRows } = await supabase
        .from('wallets')
        .select('*')
        .order('created_at', { ascending: true });

      const wallets: Wallet[] = (walletRows || []).map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        ownerId: w.owner_id,
        monthlyBudget: Number(w.monthly_budget) || 6000000,
        weeklyBudget: Number(w.weekly_budget) || 1500000,
        createdAt: w.created_at,
      }));

      const displayName =
        profileRow?.display_name || user.email?.split('@')[0] || 'Người dùng Cloud';
      const uiMode: UIMode = profileRow?.ui_mode === 'senior' ? 'senior' : 'standard';

      const profile: UserProfile = {
        id: user.id,
        email: user.email || '',
        displayName,
        roleLabel:
          uiMode === 'senior'
            ? 'Tài khoản Phụ huynh (Cloud)'
            : 'Tài khoản Tiêu chuẩn (Cloud)',
        avatarText: displayName.slice(0, 2).toUpperCase(),
        uiMode,
        defaultWalletId: profileRow?.default_wallet_id || wallets[0]?.id || '',
        createdAt: profileRow?.created_at || new Date().toISOString(),
      };

      return { profile, wallets, isCloud: true };
    } catch {
      return { profile: null, wallets: [], isCloud: false };
    }
  },

  async getTransactions(walletId: string): Promise<FinanceTransaction[]> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isLocalDemoWallet(walletId)) {
      const all = loadLocalTransactions();
      return all
        .filter((t) => t.walletId === walletId)
        .sort(
          (a, b) =>
            new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
        );
    }

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('transaction_date', { ascending: false });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      walletId: row.wallet_id,
      userId: row.user_id,
      categoryId: row.category_id || CATEGORY_BY_SLUG['khac'].id,
      categorySlug: (row.category_slug || 'khac') as CategorySlug,
      amount: Number(row.amount),
      type: row.type,
      description: row.description,
      rawInput: row.raw_input || undefined,
      transactionDate: row.transaction_date,
      createdAt: row.created_at,
    }));
  },

  async addParsedTransactions(params: {
    walletId: string;
    user: UserProfile;
    rawInput: string;
    items: ParsedExpenseItem[];
  }): Promise<FinanceTransaction[]> {
    const { walletId, user, rawInput, items } = params;
    const supabase = getSupabaseBrowserClient();

    if (!supabase || isLocalDemoWallet(walletId)) {
      const currentAll = loadLocalTransactions();
      const created: FinanceTransaction[] = items.map((item, idx) => {
        const cat = CATEGORY_BY_SLUG[item.categorySlug] || CATEGORY_BY_SLUG['khac'];
        return {
          id: `tx-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          walletId,
          userId: user.id,
          userDisplayName: user.displayName,
          categoryId: cat.id,
          categorySlug: cat.slug,
          amount: Math.round(item.amount),
          type: item.type,
          description: item.description,
          rawInput,
          transactionDate: item.transactionDate || new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
      });
      const updated = [...created, ...currentAll];
      saveLocalTransactions(updated);
      return created;
    }

    const payload = items.map((item) => {
      const cat = CATEGORY_BY_SLUG[item.categorySlug] || CATEGORY_BY_SLUG['khac'];
      return {
        wallet_id: walletId,
        user_id: user.id,
        category_id: cat.id,
        category_slug: cat.slug,
        amount: Math.round(item.amount),
        type: item.type,
        description: item.description,
        raw_input: rawInput,
        transaction_date: item.transactionDate || new Date().toISOString(),
      };
    });

    const { data, error } = await supabase.from('transactions').insert(payload).select('*');
    if (error || !data) {
      throw new Error(error?.message || 'Không thể lưu giao dịch lên Supabase');
    }

    return data.map((row) => ({
      id: row.id,
      walletId: row.wallet_id,
      userId: row.user_id,
      userDisplayName: user.displayName,
      categoryId: row.category_id || CATEGORY_BY_SLUG['khac'].id,
      categorySlug: (row.category_slug || 'khac') as CategorySlug,
      amount: Number(row.amount),
      type: row.type,
      description: row.description,
      rawInput: row.raw_input || undefined,
      transactionDate: row.transaction_date,
      createdAt: row.created_at,
    }));
  },

  async updateTransaction(
    id: string,
    updates: Partial<Pick<FinanceTransaction, 'amount' | 'description' | 'categorySlug' | 'type'>>
  ): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    const cat = updates.categorySlug ? CATEGORY_BY_SLUG[updates.categorySlug] : undefined;

    if (!supabase || id.startsWith('tx-')) {
      const all = loadLocalTransactions();
      const next = all.map((t) =>
        t.id === id
          ? {
              ...t,
              ...updates,
              categoryId: cat ? cat.id : t.categoryId,
            }
          : t
      );
      saveLocalTransactions(next);
      return;
    }

    await supabase
      .from('transactions')
      .update({
        ...(updates.amount !== undefined ? { amount: Math.round(updates.amount) } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.type !== undefined ? { type: updates.type } : {}),
        ...(cat ? { category_id: cat.id, category_slug: cat.slug } : {}),
      })
      .eq('id', id);
  },

  async deleteTransactionsByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const supabase = getSupabaseBrowserClient();

    if (!supabase || ids.every((id) => id.startsWith('tx-'))) {
      const idSet = new Set(ids);
      const all = loadLocalTransactions();
      saveLocalTransactions(all.filter((t) => !idSet.has(t.id)));
      return;
    }

    await supabase.from('transactions').delete().in('id', ids);
  },

  async updateWalletBudget(
    walletId: string,
    monthlyBudget: number,
    weeklyBudget: number
  ): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isLocalDemoWallet(walletId)) {
      const wallets = loadLocalWallets().map((w) =>
        w.id === walletId ? { ...w, monthlyBudget, weeklyBudget } : w
      );
      saveLocalWallets(wallets);
      return;
    }

    await supabase
      .from('wallets')
      .update({ monthly_budget: monthlyBudget, weekly_budget: weeklyBudget })
      .eq('id', walletId);
  },

  /**
   * Syncs LocalStorage trial transactions to the user's active Supabase Cloud wallet
   */
  async syncLocalDataToCloud(targetWalletId: string, userId: string): Promise<number> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return 0;

    const localTxs = loadLocalTransactions();
    if (localTxs.length === 0) return 0;

    const rows = localTxs.map((t) => {
      const cat = CATEGORY_BY_SLUG[t.categorySlug] || CATEGORY_BY_SLUG['khac'];
      return {
        wallet_id: targetWalletId,
        user_id: userId,
        category_id: cat.id,
        category_slug: cat.slug,
        amount: Math.round(t.amount),
        type: t.type,
        description: t.description,
        raw_input: t.rawInput || t.description,
        transaction_date: t.transactionDate,
      };
    });

    const { error } = await supabase.from('transactions').insert(rows);
    if (error) {
      throw new Error(error.message);
    }
    return rows.length;
  },
};
