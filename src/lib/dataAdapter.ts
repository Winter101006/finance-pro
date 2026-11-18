import { CATEGORY_BY_SLUG } from '../data/categories';
import type {
  CategorySlug,
  FinanceTransaction,
  ParsedExpenseItem,
  TransactionType,
  UIMode,
  UserProfile,
  Wallet,
  WalletType,
} from '../types/finance';
import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase/client';

// Legacy v1 keys to purge so no old fake/demo numbers ever remain
const LEGACY_KEYS = [
  'finance_pro_transactions_v1',
  'finance_pro_wallets_v1',
  'finance_pro_active_persona_v1',
];

// Clean v2 multi-user storage keys (0 fake data)
const USERS_KEY_V2 = 'finance_pro_users_v2';
const SESSION_KEY_V2 = 'finance_pro_session_v2';
const WALLETS_KEY_V2 = 'finance_pro_wallets_v2';
const TXS_KEY_V2 = 'finance_pro_txs_v2';

interface StoredAccountV2 {
  profile: UserProfile;
  passwordHash: string;
}

function purgeLegacyDemoStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_KEYS) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors
  }
}

function simpleHash(password: string): string {
  let hash = 5381;
  for (let i = 0; i < password.length; i++) {
    hash = (hash * 33) ^ password.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FP-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function loadUsersV2(): StoredAccountV2[] {
  if (typeof window === 'undefined') return [];
  purgeLegacyDemoStorage();
  try {
    const raw = localStorage.getItem(USERS_KEY_V2);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsersV2(users: StoredAccountV2[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USERS_KEY_V2, JSON.stringify(users));
}

function loadWalletsV2(): Wallet[] {
  if (typeof window === 'undefined') return [];
  purgeLegacyDemoStorage();
  try {
    const raw = localStorage.getItem(WALLETS_KEY_V2);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWalletsV2(wallets: Wallet[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WALLETS_KEY_V2, JSON.stringify(wallets));
}

function loadTransactionsV2(): FinanceTransaction[] {
  if (typeof window === 'undefined') return [];
  purgeLegacyDemoStorage();
  try {
    const raw = localStorage.getItem(TXS_KEY_V2);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTransactionsV2(txs: FinanceTransaction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TXS_KEY_V2, JSON.stringify(txs));
}

function getWalletsForUserV2(userId: string): Wallet[] {
  const all = loadWalletsV2();
  return all.filter(
    (w) => w.ownerId === userId || (Array.isArray(w.memberIds) && w.memberIds.includes(userId))
  );
}

function ensureUserWalletsV2(
  userId: string,
  displayName: string,
  monthlyBudget = 6000000
): Wallet[] {
  const existing = getWalletsForUserV2(userId);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const weeklyBudget = Math.round(monthlyBudget / 4);

  const personalWallet: Wallet = {
    id: `w-personal-${userId}`,
    name: `Ví Cá Nhân (${displayName})`,
    type: 'personal',
    ownerId: userId,
    memberIds: [userId],
    monthlyBudget,
    weeklyBudget,
    createdAt: now,
  };

  const familyWallet: Wallet = {
    id: `w-family-${userId}`,
    name: 'Ví Chung Gia Đình',
    type: 'family',
    ownerId: userId,
    inviteCode: generateInviteCode(),
    memberIds: [userId],
    monthlyBudget: monthlyBudget * 2,
    weeklyBudget: weeklyBudget * 2,
    createdAt: now,
  };

  const all = loadWalletsV2();
  const updated = [...all, personalWallet, familyWallet];
  saveWalletsV2(updated);
  return [personalWallet, familyWallet];
}

export const FinanceRepository = {
  isCloudEnabled(): boolean {
    return isSupabaseConfigured();
  },

  /**
   * Returns current authenticated session or null if not logged in.
   * Never returns pre-filled fake demo data.
   */
  async getCurrentSession(): Promise<{
    profile: UserProfile | null;
    wallets: Wallet[];
    isCloud: boolean;
  }> {
    purgeLegacyDemoStorage();

    // 1. Check local multi-user session first for instant hydration
    let localProfile: UserProfile | null = null;
    if (typeof window !== 'undefined') {
      const sessionUserId = localStorage.getItem(SESSION_KEY_V2);
      if (sessionUserId) {
        const users = loadUsersV2();
        const found = users.find((u) => u.profile.id === sessionUserId);
        if (found) {
          localProfile = found.profile;
        }
      }
    }

    // 2. Check Supabase Auth session if configured
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          const { data: walletRows, error: walletErr } = await supabase
            .from('wallets')
            .select('*')
            .order('created_at', { ascending: true });

          const displayName =
            profileRow?.display_name ||
            user.user_metadata?.display_name ||
            localProfile?.displayName ||
            user.email?.split('@')[0] ||
            'Người dùng';

          const uiMode: UIMode =
            profileRow?.ui_mode === 'senior' ||
            user.user_metadata?.ui_mode === 'senior' ||
            localProfile?.uiMode === 'senior'
              ? 'senior'
              : 'standard';

          let wallets: Wallet[] = [];
          if (!walletErr && walletRows && walletRows.length > 0) {
            wallets = walletRows.map((w) => ({
              id: w.id,
              name: w.name,
              type: w.type as WalletType,
              ownerId: w.owner_id,
              inviteCode: `FP-${String(w.id).slice(0, 4).toUpperCase()}`,
              memberIds: [w.owner_id],
              monthlyBudget: Number(w.monthly_budget) || 6000000,
              weeklyBudget: Number(w.weekly_budget) || 1500000,
              createdAt: w.created_at,
            }));
          } else {
            // Fallback to local wallets if schema.sql hasn't been executed on Supabase yet
            wallets = ensureUserWalletsV2(user.id, displayName);
          }

          const profile: UserProfile = {
            id: user.id,
            email: user.email || localProfile?.email || '',
            displayName,
            roleLabel:
              uiMode === 'senior' ? 'Giao diện Chữ Lớn (Bố / Mẹ)' : 'Giao diện Tiêu Chuẩn',
            avatarText: getAvatarInitials(displayName),
            uiMode,
            defaultWalletId:
              profileRow?.default_wallet_id ||
              localProfile?.defaultWalletId ||
              wallets[0]?.id ||
              '',
            createdAt: profileRow?.created_at || new Date().toISOString(),
          };

          if (typeof window !== 'undefined') {
            localStorage.setItem(SESSION_KEY_V2, profile.id);
          }

          return {
            profile,
            wallets,
            isCloud: !walletErr && Boolean(walletRows && walletRows.length > 0),
          };
        }
      } catch {
        // Fallback to local session if network/Supabase table isn't ready
      }
    }

    if (localProfile) {
      const wallets = ensureUserWalletsV2(localProfile.id, localProfile.displayName);
      return {
        profile: localProfile,
        wallets,
        isCloud: false,
      };
    }

    return { profile: null, wallets: [], isCloud: false };
  },

  /**
   * Register a brand-new user account with 0 transactions.
   */
  async signUpUser(params: {
    displayName: string;
    email: string;
    password: string;
    uiMode: UIMode;
    monthlyBudget?: number;
    familyInviteCode?: string;
  }): Promise<{ profile: UserProfile; wallets: Wallet[]; isCloud: boolean }> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.displayName.trim() || cleanEmail.split('@')[0];
    const budget =
      params.monthlyBudget && params.monthlyBudget >= 100000
        ? Math.round(params.monthlyBudget)
        : 6000000;

    if (!cleanEmail || !params.password || params.password.length < 6) {
      throw new Error('Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.');
    }

    const existingUsers = loadUsersV2();
    if (existingUsers.some((u) => u.profile.email.toLowerCase() === cleanEmail)) {
      throw new Error('Email này đã được đăng ký. Vui lòng chuyển sang mục Đăng nhập.');
    }

    let userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let isCloudConnected = false;

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: params.password,
          options: {
            data: {
              display_name: cleanName,
              ui_mode: params.uiMode,
            },
          },
        });
        if (!error && data.user) {
          userId = data.user.id;
          isCloudConnected = Boolean(data.session);
        }
      } catch {
        // Proceed with local multi-user account creation so registration never fails
      }
    }

    const wallets = ensureUserWalletsV2(userId, cleanName, budget);

    // If user entered a family invite code during sign up, join that family wallet
    if (params.familyInviteCode && params.familyInviteCode.trim()) {
      const code = params.familyInviteCode.trim().toUpperCase();
      const allWallets = loadWalletsV2();
      const targetFamily = allWallets.find(
        (w) => w.inviteCode && w.inviteCode.toUpperCase() === code
      );
      if (targetFamily) {
        const members = new Set(targetFamily.memberIds || [targetFamily.ownerId]);
        members.add(userId);
        targetFamily.memberIds = Array.from(members);
        saveWalletsV2(allWallets);
      }
    }

    const updatedWallets = getWalletsForUserV2(userId);
    const defaultWallet =
      params.uiMode === 'senior'
        ? updatedWallets.find((w) => w.type === 'family') || updatedWallets[0]
        : updatedWallets[0];

    const newProfile: UserProfile = {
      id: userId,
      email: cleanEmail,
      displayName: cleanName,
      roleLabel:
        params.uiMode === 'senior'
          ? 'Giao diện Chữ Lớn (Bố / Mẹ)'
          : 'Giao diện Tiêu Chuẩn',
      avatarText: getAvatarInitials(cleanName),
      uiMode: params.uiMode,
      defaultWalletId: defaultWallet.id,
      createdAt: new Date().toISOString(),
    };

    saveUsersV2([
      ...existingUsers,
      {
        profile: newProfile,
        passwordHash: simpleHash(params.password),
      },
    ]);

    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY_V2, newProfile.id);
    }

    return {
      profile: newProfile,
      wallets: updatedWallets,
      isCloud: isCloudConnected,
    };
  },

  /**
   * Sign in an existing user account.
   */
  async signInUser(params: {
    email: string;
    password: string;
  }): Promise<{ profile: UserProfile; wallets: Wallet[]; isCloud: boolean }> {
    const cleanEmail = params.email.trim().toLowerCase();
    const users = loadUsersV2();
    const localMatch = users.find((u) => u.profile.email.toLowerCase() === cleanEmail);

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: params.password,
        });

        if (!error && data.user) {
          if (typeof window !== 'undefined') {
            localStorage.setItem(SESSION_KEY_V2, data.user.id);
          }
          const session = await this.getCurrentSession();
          if (session.profile) {
            return {
              profile: session.profile,
              wallets: session.wallets,
              isCloud: session.isCloud,
            };
          }
        }
      } catch {
        // Fallback to local multi-user registry check below
      }
    }

    if (!localMatch) {
      throw new Error(
        'Không tìm thấy tài khoản với email này. Bạn hãy bấm sang tab "Đăng ký tài khoản mới" để tạo tài khoản.'
      );
    }

    if (localMatch.passwordHash !== simpleHash(params.password)) {
      throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại.');
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY_V2, localMatch.profile.id);
    }

    const wallets = ensureUserWalletsV2(
      localMatch.profile.id,
      localMatch.profile.displayName
    );

    return {
      profile: localMatch.profile,
      wallets,
      isCloud: false,
    };
  },

  /**
   * Sign out current user.
   */
  async signOutUser(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY_V2);
    }
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore network errors on signOut
      }
    }
  },

  /**
   * Update user's preferred UI Mode (Standard vs Senior Mode)
   */
  async updateUserUiMode(userId: string, uiMode: UIMode): Promise<UserProfile | null> {
    const users = loadUsersV2();
    let updatedProfile: UserProfile | null = null;
    const next = users.map((u) => {
      if (u.profile.id === userId) {
        updatedProfile = {
          ...u.profile,
          uiMode,
          roleLabel:
            uiMode === 'senior' ? 'Giao diện Chữ Lớn (Bố / Mẹ)' : 'Giao diện Tiêu Chuẩn',
        };
        return { ...u, profile: updatedProfile };
      }
      return u;
    });
    saveUsersV2(next);

    const supabase = getSupabaseBrowserClient();
    if (supabase && !userId.startsWith('user-')) {
      try {
        await supabase.from('profiles').update({ ui_mode: uiMode }).eq('id', userId);
      } catch {
        // ignore
      }
    }
    return updatedProfile;
  },

  /**
   * Create a new wallet (Personal, Family Shared, or Savings)
   */
  async createWallet(params: {
    userId: string;
    name: string;
    type: WalletType;
    monthlyBudget: number;
    weeklyBudget: number;
  }): Promise<Wallet> {
    const cleanName = params.name.trim() || 'Ví mới';
    const monthly = Math.max(100000, Math.round(params.monthlyBudget));
    const weekly = Math.max(50000, Math.round(params.weeklyBudget));

    const supabase = getSupabaseBrowserClient();
    if (supabase && !params.userId.startsWith('user-')) {
      try {
        const { data, error } = await supabase
          .from('wallets')
          .insert({
            name: cleanName,
            type: params.type === 'savings' ? 'personal' : params.type,
            owner_id: params.userId,
            monthly_budget: monthly,
            weekly_budget: weekly,
          })
          .select('*')
          .single();

        if (!error && data) {
          await supabase.from('wallet_members').insert({
            wallet_id: data.id,
            user_id: params.userId,
            role: 'owner',
          });
          return {
            id: data.id,
            name: data.name,
            type: params.type,
            ownerId: data.owner_id,
            inviteCode: `FP-${String(data.id).slice(0, 4).toUpperCase()}`,
            memberIds: [params.userId],
            monthlyBudget: Number(data.monthly_budget),
            weeklyBudget: Number(data.weekly_budget),
            createdAt: data.created_at,
          };
        }
      } catch {
        // Fallback to local wallet creation
      }
    }

    const newWallet: Wallet = {
      id: `w-${params.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      type: params.type,
      ownerId: params.userId,
      inviteCode: params.type === 'family' ? generateInviteCode() : undefined,
      memberIds: [params.userId],
      monthlyBudget: monthly,
      weeklyBudget: weekly,
      createdAt: new Date().toISOString(),
    };

    const all = loadWalletsV2();
    saveWalletsV2([...all, newWallet]);
    return newWallet;
  },

  /**
   * Join an existing Family Wallet by Invite Code (Multi-User Family Collaboration)
   */
  async joinFamilyWalletByCode(userId: string, inviteCode: string): Promise<Wallet> {
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode) {
      throw new Error('Vui lòng nhập mã mời Ví Gia Đình (ví dụ: FP-8492).');
    }

    const all = loadWalletsV2();
    const target = all.find(
      (w) => w.inviteCode && w.inviteCode.toUpperCase() === cleanCode
    );

    if (!target) {
      throw new Error(
        `Không tìm thấy Ví Gia Đình nào có mã "${cleanCode}". Hãy kiểm tra lại mã mời từ tài khoản người thân.`
      );
    }

    const members = new Set(target.memberIds || [target.ownerId]);
    members.add(userId);
    target.memberIds = Array.from(members);
    saveWalletsV2(all);
    return target;
  },

  async getTransactions(walletId: string): Promise<FinanceTransaction[]> {
    if (!walletId) return [];
    const supabase = getSupabaseBrowserClient();

    if (supabase && !walletId.startsWith('w-')) {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('wallet_id', walletId)
          .order('transaction_date', { ascending: false });

        if (!error && data) {
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
        }
      } catch {
        // Fallback to local v2 store
      }
    }

    const all = loadTransactionsV2();
    return all
      .filter((t) => t.walletId === walletId)
      .sort(
        (a, b) =>
          new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );
  },

  async addParsedTransactions(params: {
    walletId: string;
    user: UserProfile;
    rawInput: string;
    items: ParsedExpenseItem[];
  }): Promise<FinanceTransaction[]> {
    const { walletId, user, rawInput, items } = params;
    const supabase = getSupabaseBrowserClient();

    if (supabase && !walletId.startsWith('w-') && !user.id.startsWith('user-')) {
      try {
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

        const { data, error } = await supabase
          .from('transactions')
          .insert(payload)
          .select('*');

        if (!error && data) {
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
        }
      } catch {
        // Fallback to local v2 storage
      }
    }

    const currentAll = loadTransactionsV2();
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

    saveTransactionsV2([...created, ...currentAll]);
    return created;
  },

  /**
   * Add a manual structured transaction (Income or Expense with custom Date & Category)
   */
  async addManualTransaction(params: {
    walletId: string;
    user: UserProfile;
    type: TransactionType;
    amount: number;
    categorySlug: CategorySlug;
    description: string;
    transactionDate: string;
  }): Promise<FinanceTransaction> {
    const created = await this.addParsedTransactions({
      walletId: params.walletId,
      user: params.user,
      rawInput: params.description,
      items: [
        {
          amount: Math.round(params.amount),
          type: params.type,
          categorySlug: params.categorySlug,
          description: params.description.trim(),
          transactionDate: params.transactionDate || new Date().toISOString(),
          spokenConfirmationVi: `Đã ghi ${
            params.type === 'income' ? 'khoản thu' : 'khoản chi'
          } ${params.description.trim()} số tiền ${Math.round(params.amount)} đồng.`,
        },
      ],
    });
    return created[0];
  },

  async updateTransaction(
    id: string,
    updates: Partial<
      Pick<FinanceTransaction, 'amount' | 'description' | 'categorySlug' | 'type'>
    >
  ): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    const cat = updates.categorySlug ? CATEGORY_BY_SLUG[updates.categorySlug] : undefined;

    if (supabase && !id.startsWith('tx-')) {
      try {
        await supabase
          .from('transactions')
          .update({
            ...(updates.amount !== undefined
              ? { amount: Math.round(updates.amount) }
              : {}),
            ...(updates.description !== undefined
              ? { description: updates.description }
              : {}),
            ...(updates.type !== undefined ? { type: updates.type } : {}),
            ...(cat ? { category_id: cat.id, category_slug: cat.slug } : {}),
          })
          .eq('id', id);
        return;
      } catch {
        // Fallback to local v2
      }
    }

    const all = loadTransactionsV2();
    const next = all.map((t) =>
      t.id === id
        ? {
            ...t,
            ...updates,
            categoryId: cat ? cat.id : t.categoryId,
          }
        : t
    );
    saveTransactionsV2(next);
  },

  async deleteTransactionsByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const supabase = getSupabaseBrowserClient();

    if (supabase && ids.every((id) => !id.startsWith('tx-'))) {
      try {
        await supabase.from('transactions').delete().in('id', ids);
        return;
      } catch {
        // Fallback to local v2
      }
    }

    const idSet = new Set(ids);
    const all = loadTransactionsV2();
    saveTransactionsV2(all.filter((t) => !idSet.has(t.id)));
  },

  async clearWalletTransactions(walletId: string): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !walletId.startsWith('w-')) {
      try {
        await supabase.from('transactions').delete().eq('wallet_id', walletId);
      } catch {
        // ignore
      }
    }
    const all = loadTransactionsV2();
    saveTransactionsV2(all.filter((t) => t.walletId !== walletId));
  },

  async updateWalletBudget(
    walletId: string,
    monthlyBudget: number,
    weeklyBudget: number
  ): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !walletId.startsWith('w-')) {
      try {
        await supabase
          .from('wallets')
          .update({ monthly_budget: monthlyBudget, weekly_budget: weeklyBudget })
          .eq('id', walletId);
      } catch {
        // ignore
      }
    }

    const wallets = loadWalletsV2().map((w) =>
      w.id === walletId ? { ...w, monthlyBudget, weeklyBudget } : w
    );
    saveWalletsV2(wallets);
  },
};
