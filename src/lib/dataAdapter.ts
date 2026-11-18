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
import {
  createSignedSessionToken,
  hashPasswordSecure,
  normalizeEmailInput,
  normalizePasswordInput,
  sanitizeUserText,
  verifyPasswordSecure,
  verifySignedSessionToken,
} from './authSecurity';
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

export interface StoredAccountV2 {
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

function getAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function loadUsersV2(): StoredAccountV2[] {
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

function upsertLocalUserAccount(profile: UserProfile, passwordHash: string): void {
  const users = loadUsersV2();
  const cleanEmail = normalizeEmailInput(profile.email);
  const idx = users.findIndex(
    (u) =>
      u.profile.id === profile.id ||
      normalizeEmailInput(u.profile.email) === cleanEmail
  );
  if (idx >= 0) {
    users[idx] = { profile, passwordHash: passwordHash || users[idx].passwordHash };
    saveUsersV2(users);
  } else {
    saveUsersV2([...users, { profile, passwordHash }]);
  }
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

function getPersonalWalletsForUserV2(userId: string): Wallet[] {
  const all = loadWalletsV2();
  // Filter to personal/savings wallets owned by this user
  return all.filter((w) => w.ownerId === userId && w.type !== 'family');
}

function ensureUserPersonalWalletV2(userId: string, displayName: string): Wallet[] {
  const existing = getPersonalWalletsForUserV2(userId);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const personalWallet: Wallet = {
    id: `w-personal-${userId}`,
    name: `Ví Cá Nhân`,
    type: 'personal',
    ownerId: userId,
    memberIds: [userId],
    monthlyBudget: 0,
    weeklyBudget: 0,
    createdAt: now,
  };

  const all = loadWalletsV2().filter(
    (w) => !(w.ownerId === userId && w.type === 'family')
  );
  saveWalletsV2([...all, personalWallet]);
  return [personalWallet];
}

export const FinanceRepository = {
  isCloudEnabled(): boolean {
    return isSupabaseConfigured();
  },

  /**
   * List saved user profiles on this browser (without exposing password hashes)
   */
  getSavedAccountsPreview(): Array<Pick<UserProfile, 'id' | 'email' | 'displayName' | 'avatarText'>> {
    return loadUsersV2().map((u) => ({
      id: u.profile.id,
      email: u.profile.email,
      displayName: u.profile.displayName,
      avatarText: u.profile.avatarText,
    }));
  },

  /**
   * Returns current authenticated session or null if not logged in.
   */
  async getCurrentSession(): Promise<{
    profile: UserProfile | null;
    wallets: Wallet[];
    isCloud: boolean;
  }> {
    purgeLegacyDemoStorage();

    // 1. Verify signed local session token
    let localProfile: UserProfile | null = null;
    if (typeof window !== 'undefined') {
      const rawSession = localStorage.getItem(SESSION_KEY_V2);
      const verified = await verifySignedSessionToken(rawSession);
      if (verified) {
        const users = loadUsersV2();
        const found = users.find(
          (u) =>
            u.profile.id === verified.userId ||
            (verified.email &&
              normalizeEmailInput(u.profile.email) === normalizeEmailInput(verified.email))
        );
        if (found) {
          localProfile = found.profile;
        }
      } else if (rawSession) {
        // Tampered or expired session token -> remove it
        localStorage.removeItem(SESSION_KEY_V2);
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
            .eq('owner_id', user.id)
            .neq('type', 'family')
            .order('created_at', { ascending: true });

          const displayName = sanitizeUserText(
            profileRow?.display_name ||
              user.user_metadata?.display_name ||
              localProfile?.displayName ||
              user.email?.split('@')[0] ||
              'Người dùng',
            80
          );

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
              name: w.name.replace(/\s*\([^)]*\)\s*$/, '') || 'Ví Cá Nhân',
              type: (w.type as WalletType) || 'personal',
              ownerId: w.owner_id,
              memberIds: [w.owner_id],
              monthlyBudget: Number(w.monthly_budget) || 0,
              weeklyBudget: Number(w.weekly_budget) || 0,
              createdAt: w.created_at,
            }));
          } else {
            wallets = ensureUserPersonalWalletV2(user.id, displayName);
          }

          const profile: UserProfile = {
            id: user.id,
            email: normalizeEmailInput(user.email || localProfile?.email || ''),
            displayName,
            roleLabel: uiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
            avatarText: getAvatarInitials(displayName),
            uiMode,
            defaultWalletId: wallets[0]?.id || '',
            createdAt: profileRow?.created_at || new Date().toISOString(),
          };

          if (typeof window !== 'undefined') {
            const token = await createSignedSessionToken(profile.id, profile.email);
            localStorage.setItem(SESSION_KEY_V2, token);
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
      const wallets = ensureUserPersonalWalletV2(
        localProfile.id,
        localProfile.displayName
      );
      return {
        profile: localProfile,
        wallets,
        isCloud: false,
      };
    }

    return { profile: null, wallets: [], isCloud: false };
  },

  /**
   * Register a personal finance account with PBKDF2-SHA256 password security and 0 fake data.
   */
  async signUpUser(params: {
    displayName: string;
    email: string;
    password: string;
    uiMode?: UIMode;
  }): Promise<{ profile: UserProfile; wallets: Wallet[]; isCloud: boolean }> {
    const cleanEmail = normalizeEmailInput(params.email);
    const cleanPassword = normalizePasswordInput(params.password);
    const cleanName =
      sanitizeUserText(params.displayName, 80) || cleanEmail.split('@')[0];
    const uiMode: UIMode = params.uiMode === 'senior' ? 'senior' : 'standard';

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Vui lòng nhập địa chỉ email hợp lệ.');
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      throw new Error('Mật khẩu cần có tối thiểu 6 ký tự để đảm bảo an toàn.');
    }

    const existingUsers = loadUsersV2();
    const existingLocal = existingUsers.find(
      (u) => normalizeEmailInput(u.profile.email) === cleanEmail
    );

    // If email already exists locally AND the user entered the right password, sign them right in!
    if (existingLocal) {
      const check = await verifyPasswordSecure(
        cleanPassword,
        existingLocal.passwordHash
      );
      if (check.valid) {
        return this.signInUser({ email: cleanEmail, password: cleanPassword });
      }
      throw new Error(
        'Email này đã được đăng ký trước đó. Vui lòng chuyển sang tab "Đăng nhập" hoặc bấm "Đặt lại mật khẩu".'
      );
    }

    const passwordHash = await hashPasswordSecure(cleanPassword);
    let userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let isCloudConnected = false;
    let cloudWallets: Wallet[] = [];

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              display_name: cleanName,
              ui_mode: uiMode,
            },
          },
        });

        if (!error && data.user) {
          userId = data.user.id;
          isCloudConnected = Boolean(data.session);

          const { data: walletRows } = await supabase
            .from('wallets')
            .select('*')
            .eq('owner_id', userId)
            .neq('type', 'family')
            .order('created_at', { ascending: true });

          if (walletRows && walletRows.length > 0) {
            cloudWallets = walletRows.map((w) => ({
              id: w.id,
              name: w.name.replace(/\s*\([^)]*\)\s*$/, '') || 'Ví Cá Nhân',
              type: (w.type as WalletType) || 'personal',
              ownerId: w.owner_id,
              memberIds: [w.owner_id],
              monthlyBudget: 0,
              weeklyBudget: 0,
              createdAt: w.created_at,
            }));
          }
        } else if (
          error &&
          error.message.toLowerCase().includes('already registered')
        ) {
          // Account already exists in Supabase -> try signing in with the provided password
          const signInAttempt = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword,
          });
          if (!signInAttempt.error && signInAttempt.data.user) {
            userId = signInAttempt.data.user.id;
            isCloudConnected = true;
          }
        }
      } catch {
        // Proceed with local multi-user account creation so registration never blocks
      }
    }

    const wallets =
      cloudWallets.length > 0
        ? cloudWallets
        : ensureUserPersonalWalletV2(userId, cleanName);

    const newProfile: UserProfile = {
      id: userId,
      email: cleanEmail,
      displayName: cleanName,
      roleLabel: uiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
      avatarText: getAvatarInitials(cleanName),
      uiMode,
      defaultWalletId: wallets[0].id,
      createdAt: new Date().toISOString(),
    };

    upsertLocalUserAccount(newProfile, passwordHash);

    if (typeof window !== 'undefined') {
      const token = await createSignedSessionToken(newProfile.id, newProfile.email);
      localStorage.setItem(SESSION_KEY_V2, token);
    }

    return {
      profile: newProfile,
      wallets,
      isCloud: isCloudConnected,
    };
  },

  /**
   * Sign in an existing user account with resilient Cloud + Local PBKDF2 verification.
   */
  async signInUser(params: {
    email: string;
    password: string;
  }): Promise<{ profile: UserProfile; wallets: Wallet[]; isCloud: boolean }> {
    const cleanEmail = normalizeEmailInput(params.email);
    const cleanPassword = normalizePasswordInput(params.password);

    if (!cleanEmail || !cleanPassword) {
      throw new Error('Vui lòng nhập đầy đủ Email và Mật khẩu.');
    }

    const users = loadUsersV2();
    const localMatch = users.find(
      (u) => normalizeEmailInput(u.profile.email) === cleanEmail
    );

    // 1. Try Supabase Auth first if configured
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        let authRes = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        // If exact password had accidental leading/trailing space, retry with trimmed password
        if (
          authRes.error &&
          cleanPassword.trim() !== cleanPassword &&
          cleanPassword.trim().length >= 6
        ) {
          authRes = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword.trim(),
          });
        }

        if (!authRes.error && authRes.data.user) {
          const sbUser = authRes.data.user;

          // Fetch profile & personal wallets directly without a second getUser() call
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sbUser.id)
            .single();

          const { data: walletRows, error: walletErr } = await supabase
            .from('wallets')
            .select('*')
            .eq('owner_id', sbUser.id)
            .neq('type', 'family')
            .order('created_at', { ascending: true });

          const displayName = sanitizeUserText(
            profileRow?.display_name ||
              sbUser.user_metadata?.display_name ||
              localMatch?.profile.displayName ||
              cleanEmail.split('@')[0],
            80
          );

          const uiMode: UIMode =
            profileRow?.ui_mode === 'senior' ||
            sbUser.user_metadata?.ui_mode === 'senior' ||
            localMatch?.profile.uiMode === 'senior'
              ? 'senior'
              : 'standard';

          let wallets: Wallet[] = [];
          if (!walletErr && walletRows && walletRows.length > 0) {
            wallets = walletRows.map((w) => ({
              id: w.id,
              name: w.name.replace(/\s*\([^)]*\)\s*$/, '') || 'Ví Cá Nhân',
              type: (w.type as WalletType) || 'personal',
              ownerId: w.owner_id,
              memberIds: [w.owner_id],
              monthlyBudget: 0,
              weeklyBudget: 0,
              createdAt: w.created_at,
            }));
          } else {
            wallets = ensureUserPersonalWalletV2(sbUser.id, displayName);
          }

          const profile: UserProfile = {
            id: sbUser.id,
            email: cleanEmail,
            displayName,
            roleLabel:
              uiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
            avatarText: getAvatarInitials(displayName),
            uiMode,
            defaultWalletId: wallets[0]?.id || '',
            createdAt:
              profileRow?.created_at ||
              localMatch?.profile.createdAt ||
              new Date().toISOString(),
          };

          // Sync PBKDF2 hash locally so offline/fast login always stays in sync
          const freshHash = await hashPasswordSecure(cleanPassword);
          upsertLocalUserAccount(profile, freshHash);

          if (typeof window !== 'undefined') {
            const token = await createSignedSessionToken(profile.id, profile.email);
            localStorage.setItem(SESSION_KEY_V2, token);
          }

          return {
            profile,
            wallets,
            isCloud: !walletErr && Boolean(walletRows && walletRows.length > 0),
          };
        }
      } catch {
        // Fallback to local PBKDF2 check below
      }
    }

    // 2. Verify against Local Multi-User Account Registry (PBKDF2-SHA256)
    if (!localMatch) {
      throw new Error(
        'Tài khoản với email này chưa được đăng ký trên hệ thống. Bạn hãy bấm sang mục "Đăng ký" (chỉ mất 5 giây) để khởi tạo tài khoản.'
      );
    }

    const verification = await verifyPasswordSecure(
      cleanPassword,
      localMatch.passwordHash
    );

    if (!verification.valid) {
      throw new Error(
        'Mật khẩu chưa chính xác. Bạn có thể bấm biểu tượng 👁️ để kiểm tra ký tự hoặc chọn "Đặt lại mật khẩu" bên dưới.'
      );
    }

    // Automatically upgrade legacy hash to PBKDF2-SHA256 if needed
    if (verification.needsRehash) {
      const upgradedHash = await hashPasswordSecure(cleanPassword);
      upsertLocalUserAccount(localMatch.profile, upgradedHash);
    }

    if (typeof window !== 'undefined') {
      const token = await createSignedSessionToken(
        localMatch.profile.id,
        localMatch.profile.email
      );
      localStorage.setItem(SESSION_KEY_V2, token);
    }

    const wallets = ensureUserPersonalWalletV2(
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
   * Self-service Password Reset so a user is never locked out of their personal account
   */
  async resetUserPassword(params: {
    email: string;
    newPassword: string;
  }): Promise<{ profile: UserProfile; wallets: Wallet[]; isCloud: boolean }> {
    const cleanEmail = normalizeEmailInput(params.email);
    const cleanPassword = normalizePasswordInput(params.newPassword);

    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Vui lòng nhập đúng địa chỉ Email cần đặt lại mật khẩu.');
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      throw new Error('Mật khẩu mới cần có tối thiểu 6 ký tự.');
    }

    const users = loadUsersV2();
    const localMatch = users.find(
      (u) => normalizeEmailInput(u.profile.email) === cleanEmail
    );

    const newHash = await hashPasswordSecure(cleanPassword);

    if (localMatch) {
      upsertLocalUserAccount(localMatch.profile, newHash);
      if (typeof window !== 'undefined') {
        const token = await createSignedSessionToken(
          localMatch.profile.id,
          localMatch.profile.email
        );
        localStorage.setItem(SESSION_KEY_V2, token);
      }
      const wallets = ensureUserPersonalWalletV2(
        localMatch.profile.id,
        localMatch.profile.displayName
      );
      return {
        profile: localMatch.profile,
        wallets,
        isCloud: false,
      };
    }

    // If the email wasn't in local storage yet, create/provision the account with the new password
    return this.signUpUser({
      displayName: cleanEmail.split('@')[0],
      email: cleanEmail,
      password: cleanPassword,
      uiMode: 'standard',
    });
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
   * Update user's preferred UI Mode (Giao diện Chi tiết vs Giao diện Đơn giản)
   */
  async updateUserUiMode(userId: string, uiMode: UIMode): Promise<UserProfile | null> {
    const users = loadUsersV2();
    let updatedProfile: UserProfile | null = null;
    const next = users.map((u) => {
      if (u.profile.id === userId) {
        updatedProfile = {
          ...u.profile,
          uiMode,
          roleLabel: uiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
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
   * Create an additional personal wallet (e.g. Ví Tiền Mặt, Tài Khoản Ngân Hàng, Quỹ Tiết Kiệm)
   */
  async createWallet(params: {
    userId: string;
    name: string;
    type: WalletType;
  }): Promise<Wallet> {
    const cleanName = sanitizeUserText(params.name, 60) || 'Ví Cá Nhân Mới';
    const walletType: WalletType = params.type === 'savings' ? 'savings' : 'personal';

    const supabase = getSupabaseBrowserClient();
    if (supabase && !params.userId.startsWith('user-')) {
      try {
        const { data, error } = await supabase
          .from('wallets')
          .insert({
            name: cleanName,
            type: 'personal',
            owner_id: params.userId,
            monthly_budget: 0,
            weekly_budget: 0,
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
            type: walletType,
            ownerId: data.owner_id,
            memberIds: [params.userId],
            monthlyBudget: 0,
            weeklyBudget: 0,
            createdAt: data.created_at,
          };
        }
      } catch {
        // Fallback to local wallet creation
      }
    }

    const newWallet: Wallet = {
      id: `w-${walletType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      type: walletType,
      ownerId: params.userId,
      memberIds: [params.userId],
      monthlyBudget: 0,
      weeklyBudget: 0,
      createdAt: new Date().toISOString(),
    };

    const all = loadWalletsV2();
    saveWalletsV2([...all, newWallet]);
    return newWallet;
  },

  async getTransactions(walletId: string, userId?: string): Promise<FinanceTransaction[]> {
    if (!walletId) return [];
    const supabase = getSupabaseBrowserClient();

    if (supabase && !walletId.startsWith('w-')) {
      try {
        let query = supabase
          .from('transactions')
          .select('*')
          .eq('wallet_id', walletId)
          .order('transaction_date', { ascending: false });

        if (userId && !userId.startsWith('user-')) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (!error && data) {
          return data.map((row) => ({
            id: row.id,
            walletId: row.wallet_id,
            userId: row.user_id,
            categoryId: row.category_id || CATEGORY_BY_SLUG['khac'].id,
            categorySlug: (row.category_slug || 'khac') as CategorySlug,
            amount: Number(row.amount),
            type: row.type,
            description: sanitizeUserText(row.description, 200),
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
      .filter((t) => t.walletId === walletId && (!userId || t.userId === userId))
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
            amount: Math.max(0, Math.round(item.amount)),
            type: item.type,
            description: sanitizeUserText(item.description, 200),
            raw_input: sanitizeUserText(rawInput, 300),
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
        amount: Math.max(0, Math.round(item.amount)),
        type: item.type,
        description: sanitizeUserText(item.description, 200),
        rawInput: sanitizeUserText(rawInput, 300),
        transactionDate: item.transactionDate || new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    });

    saveTransactionsV2([...created, ...currentAll]);
    return created;
  },

  async addManualTransaction(params: {
    walletId: string;
    user: UserProfile;
    type: TransactionType;
    amount: number;
    categorySlug: CategorySlug;
    description: string;
    transactionDate: string;
  }): Promise<FinanceTransaction> {
    const cleanDesc = sanitizeUserText(params.description, 200);
    const created = await this.addParsedTransactions({
      walletId: params.walletId,
      user: params.user,
      rawInput: cleanDesc,
      items: [
        {
          amount: Math.max(0, Math.round(params.amount)),
          type: params.type,
          categorySlug: params.categorySlug,
          description: cleanDesc,
          transactionDate: params.transactionDate || new Date().toISOString(),
          spokenConfirmationVi: `Đã ghi ${
            params.type === 'income' ? 'khoản thu' : 'khoản chi'
          } ${cleanDesc} số tiền ${Math.round(params.amount)} đồng.`,
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
              ? { amount: Math.max(0, Math.round(updates.amount)) }
              : {}),
            ...(updates.description !== undefined
              ? { description: sanitizeUserText(updates.description, 200) }
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
            description:
              updates.description !== undefined
                ? sanitizeUserText(updates.description, 200)
                : t.description,
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
};
