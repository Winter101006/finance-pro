import type { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORY_BY_SLUG } from '../data/categories';
import type {
  AccountBackupPayload,
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

// Clean v2 local-only storage keys (used ONLY when Supabase Cloud is not configured)
const USERS_KEY_V2 = 'finance_pro_users_v2';
const SESSION_KEY_V2 = 'finance_pro_session_v2';
const WALLETS_KEY_V2 = 'finance_pro_wallets_v2';
const TXS_KEY_V2 = 'finance_pro_txs_v2';
const AVATAR_COLOR_MAP_KEY = 'finance_pro_avatar_colors_v2';

export const AVATAR_COLOR_PRESETS = [
  '#4F46E5', // Indigo Gemini
  '#2563EB', // Cobalt Blue
  '#7C3AED', // Violet
  '#0D9488', // Emerald Teal
  '#E11D48', // Coral Rose
  '#D97706', // Warm Amber
];

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

function getStoredAvatarColor(userId: string): string {
  if (typeof window === 'undefined') return AVATAR_COLOR_PRESETS[0];
  try {
    const raw = localStorage.getItem(AVATAR_COLOR_MAP_KEY);
    if (!raw) return AVATAR_COLOR_PRESETS[0];
    const map = JSON.parse(raw) as Record<string, string>;
    return map[userId] || AVATAR_COLOR_PRESETS[0];
  } catch {
    return AVATAR_COLOR_PRESETS[0];
  }
}

function saveStoredAvatarColor(userId: string, color: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(AVATAR_COLOR_MAP_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[userId] = color;
    localStorage.setItem(AVATAR_COLOR_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
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
    users[idx] = {
      profile: {
        ...users[idx].profile,
        ...profile,
      },
      passwordHash: passwordHash || users[idx].passwordHash,
    };
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
  return all.filter((w) => w.ownerId === userId && w.type !== 'family');
}

function ensureUserPersonalWalletV2(userId: string): Wallet[] {
  const existing = getPersonalWalletsForUserV2(userId);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const personalWallet: Wallet = {
    id: `w-personal-${userId}`,
    name: 'Ví Cá Nhân',
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

function mapSupabaseWalletRow(w: Record<string, unknown>): Wallet {
  const rawName = String(w.name || 'Ví Cá Nhân');
  return {
    id: String(w.id),
    name: rawName.replace(/\s*\([^)]*\)\s*$/, '') || 'Ví Cá Nhân',
    type: (w.type === 'savings' ? 'savings' : 'personal') as WalletType,
    ownerId: String(w.owner_id),
    memberIds: [String(w.owner_id)],
    monthlyBudget: Number(w.monthly_budget) || 0,
    weeklyBudget: Number(w.weekly_budget) || 0,
    createdAt: String(w.created_at || new Date().toISOString()),
  };
}

/**
 * Guarantees a real Supabase Cloud wallet exists for an authenticated Supabase user.
 * NEVER falls back to a local "w-personal-..." wallet so PC and Phone ALWAYS share the exact same UUID wallet.
 */
async function ensureCloudPersonalWallets(
  supabase: SupabaseClient,
  userId: string
): Promise<Wallet[]> {
  const fetchWallets = async () => {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('owner_id', userId)
      .neq('type', 'family')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Lỗi tải ví từ Supabase Cloud: ${error.message}`);
    return (data || []).map((row) => mapSupabaseWalletRow(row as Record<string, unknown>));
  };

  let wallets = await fetchWallets();
  if (wallets.length > 0) return wallets;

  // Brief retry in case the PostgreSQL on_auth_user_created trigger is still committing
  await new Promise((r) => setTimeout(r, 300));
  wallets = await fetchWallets();
  if (wallets.length > 0) return wallets;

  // Provision a real Cloud personal wallet directly if trigger did not create one
  const { data: createdWallet, error: insertErr } = await supabase
    .from('wallets')
    .insert({
      name: 'Ví Cá Nhân',
      type: 'personal',
      owner_id: userId,
      monthly_budget: 0,
      weekly_budget: 0,
    })
    .select('*')
    .single();

  if (insertErr || !createdWallet) {
    throw new Error(
      `Không thể khởi tạo Ví Cá Nhân trên Supabase Cloud: ${
        insertErr?.message || 'Vui lòng kiểm tra schema.sql trên Supabase.'
      }`
    );
  }

  await supabase
    .from('wallet_members')
    .upsert(
      {
        wallet_id: createdWallet.id,
        user_id: userId,
        role: 'owner',
      },
      { onConflict: 'wallet_id,user_id' }
    )
    .then(() => {});

  return [mapSupabaseWalletRow(createdWallet as Record<string, unknown>)];
}

async function loadCloudProfileAndWallets(
  supabase: SupabaseClient,
  sbUser: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
    created_at?: string;
  }
): Promise<{ profile: UserProfile; wallets: Wallet[]; isCloud: true }> {
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sbUser.id)
    .maybeSingle();

  const wallets = await ensureCloudPersonalWallets(supabase, sbUser.id);
  const cleanEmail = normalizeEmailInput(sbUser.email || '');
  const metaName =
    typeof sbUser.user_metadata?.display_name === 'string'
      ? sbUser.user_metadata.display_name
      : '';
  const displayName = sanitizeUserText(
    profileRow?.display_name || metaName || cleanEmail.split('@')[0] || 'Người dùng',
    80
  );

  const uiMode: UIMode =
    profileRow?.ui_mode === 'senior' || sbUser.user_metadata?.ui_mode === 'senior'
      ? 'senior'
      : 'standard';

  const avatarColor =
    (typeof sbUser.user_metadata?.avatar_color === 'string' &&
      sbUser.user_metadata.avatar_color) ||
    getStoredAvatarColor(sbUser.id);

  // Ensure profile row exists in public.profiles
  if (!profileRow) {
    await supabase
      .from('profiles')
      .upsert(
        {
          id: sbUser.id,
          display_name: displayName,
          ui_mode: uiMode,
          default_wallet_id: wallets[0]?.id || null,
        },
        { onConflict: 'id' }
      )
      .then(() => {});
  }

  const profile: UserProfile = {
    id: sbUser.id,
    email: cleanEmail,
    displayName,
    roleLabel: uiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
    avatarText: getAvatarInitials(displayName),
    avatarColor,
    uiMode,
    defaultWalletId:
      wallets.find((w) => w.id === profileRow?.default_wallet_id)?.id ||
      wallets[0]?.id ||
      '',
    createdAt: profileRow?.created_at || sbUser.created_at || new Date().toISOString(),
  };

  return { profile, wallets, isCloud: true };
}

function translateSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email chưa được đăng ký hoặc mật khẩu chưa chính xác. Bấm biểu tượng con mắt để kiểm tra hoặc dùng "Quên / Đặt lại mật khẩu".';
  }
  if (lower.includes('email not confirmed')) {
    return 'Tài khoản này chưa xác nhận Email. Vui lòng mở hộp thư xác nhận hoặc tắt "Confirm email" trong Supabase Authentication.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Hệ thống vừa nhận quá nhiều yêu cầu liên tiếp. Vui lòng đợi khoảng 1 phút rồi thử lại.';
  }
  if (lower.includes('already registered')) {
    return 'Email này đã có tài khoản trên hệ thống Cloud. Vui lòng chuyển sang tab "Đăng nhập" và nhập đúng mật khẩu của bạn.';
  }
  if (lower.includes('password should be at least')) {
    return 'Mật khẩu cần có tối thiểu 6 ký tự.';
  }
  return `Lỗi xác thực Cloud: ${message}`;
}

export const FinanceRepository = {
  isCloudEnabled(): boolean {
    return isSupabaseConfigured();
  },

  /**
   * List saved local profiles ONLY when running in Local-Only mode (prevents split-brain confusion in Cloud mode)
   */
  getSavedAccountsPreview(): Array<
    Pick<UserProfile, 'id' | 'email' | 'displayName' | 'avatarText' | 'avatarColor'>
  > {
    if (isSupabaseConfigured()) {
      return [];
    }
    return loadUsersV2().map((u) => ({
      id: u.profile.id,
      email: u.profile.email,
      displayName: u.profile.displayName,
      avatarText: u.profile.avatarText,
      avatarColor: u.profile.avatarColor || AVATAR_COLOR_PRESETS[0],
    }));
  },

  /**
   * Returns current authenticated session (Single Source of Truth: Supabase Cloud when configured, else Local PBKDF2).
   */
  async getCurrentSession(): Promise<{
    profile: UserProfile | null;
    wallets: Wallet[];
    isCloud: boolean;
  }> {
    purgeLegacyDemoStorage();

    // 1. CLOUD MODE (Single Source of Truth across PC & Phone)
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          return { profile: null, wallets: [], isCloud: true };
        }

        return await loadCloudProfileAndWallets(supabase, user);
      } catch {
        return { profile: null, wallets: [], isCloud: true };
      }
    }

    // 2. LOCAL-ONLY MODE (when Supabase env vars are empty)
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
          const wallets = ensureUserPersonalWalletV2(found.profile.id);
          return {
            profile: found.profile,
            wallets,
            isCloud: false,
          };
        }
      } else if (rawSession) {
        localStorage.removeItem(SESSION_KEY_V2);
      }
    }

    return { profile: null, wallets: [], isCloud: false };
  },

  /**
   * Register a personal finance account (strictly Cloud when Supabase is configured — NEVER splits into a fake local account).
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

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Vui lòng nhập đúng định dạng Email (ví dụ: ten@gmail.com).');
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      throw new Error('Mật khẩu cần có tối thiểu 6 ký tự để đảm bảo an toàn.');
    }

    // 1. CLOUD MODE (Strict Single Source of Truth)
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            display_name: cleanName,
            ui_mode: uiMode,
            avatar_color: AVATAR_COLOR_PRESETS[0],
          },
        },
      });

      const alreadyExists =
        Boolean(error && error.message.toLowerCase().includes('already registered')) ||
        Boolean(!error && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

      if (alreadyExists) {
        // Account already exists on Supabase Cloud -> attempt sign-in with the provided password
        const signInRes = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (!signInRes.error && signInRes.data.user) {
          return await loadCloudProfileAndWallets(supabase, signInRes.data.user);
        }
        throw new Error(
          'Email này đã được đăng ký trên hệ thống Cloud (dùng chung máy tính & điện thoại). Vui lòng chuyển sang tab "Đăng nhập" và nhập đúng mật khẩu của bạn.'
        );
      }

      if (error) {
        throw new Error(translateSupabaseAuthError(error.message));
      }

      if (!data.user) {
        throw new Error('Không thể khởi tạo tài khoản trên Supabase Cloud. Vui lòng thử lại.');
      }

      if (!data.session) {
        throw new Error(
          'Đăng ký thành công! Vui lòng mở hộp thư Email để bấm link xác nhận rồi quay lại Đăng nhập.'
        );
      }

      return await loadCloudProfileAndWallets(supabase, data.user);
    }

    // 2. LOCAL-ONLY MODE (when Supabase is not configured)
    const existingUsers = loadUsersV2();
    const existingLocal = existingUsers.find(
      (u) => normalizeEmailInput(u.profile.email) === cleanEmail
    );

    if (existingLocal) {
      const check = await verifyPasswordSecure(cleanPassword, existingLocal.passwordHash);
      if (check.valid) {
        return this.signInUser({ email: cleanEmail, password: cleanPassword });
      }
      throw new Error(
        'Email này đã được đăng ký trước đó. Vui lòng chuyển sang tab "Đăng nhập" hoặc chọn "Đặt lại mật khẩu".'
      );
    }

    const passwordHash = await hashPasswordSecure(cleanPassword);
    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const wallets = ensureUserPersonalWalletV2(userId);

    const newProfile: UserProfile = {
      id: userId,
      email: cleanEmail,
      displayName: cleanName,
      roleLabel: uiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
      avatarText: getAvatarInitials(cleanName),
      avatarColor:
        AVATAR_COLOR_PRESETS[existingUsers.length % AVATAR_COLOR_PRESETS.length],
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
      isCloud: false,
    };
  },

  /**
   * Sign in an existing account (strictly Cloud when Supabase is configured — PC & Phone ALWAYS load the exact same UUID user & wallets).
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

    // 1. CLOUD MODE (Strict Single Source of Truth)
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let authRes = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

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

      if (authRes.error || !authRes.data.user) {
        throw new Error(
          translateSupabaseAuthError(authRes.error?.message || 'Invalid login credentials')
        );
      }

      return await loadCloudProfileAndWallets(supabase, authRes.data.user);
    }

    // 2. LOCAL-ONLY MODE (when Supabase is not configured)
    const users = loadUsersV2();
    const localMatch = users.find(
      (u) => normalizeEmailInput(u.profile.email) === cleanEmail
    );

    if (!localMatch) {
      throw new Error(
        'Chưa tìm thấy tài khoản cho Email này trên thiết bị. Bạn hãy bấm "Đăng ký nhanh" để bắt đầu.'
      );
    }

    const verification = await verifyPasswordSecure(
      cleanPassword,
      localMatch.passwordHash
    );

    if (!verification.valid) {
      throw new Error(
        'Mật khẩu chưa chính xác. Bấm biểu tượng con mắt để kiểm tra hoặc chọn "Đặt lại mật khẩu".'
      );
    }

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

    const wallets = ensureUserPersonalWalletV2(localMatch.profile.id);

    return {
      profile: localMatch.profile,
      wallets,
      isCloud: false,
    };
  },

  /**
   * Password Reset:
   * - In Cloud Mode: sends official Supabase password recovery email (never forks a local account!)
   * - In Local-Only Mode: updates local PBKDF2 hash directly
   */
  async resetUserPassword(params: {
    email: string;
    newPassword?: string;
  }): Promise<
    | { resetEmailSent: true; message: string }
    | { resetEmailSent?: false; profile: UserProfile; wallets: Wallet[]; isCloud: boolean }
  > {
    const cleanEmail = normalizeEmailInput(params.email);

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Vui lòng nhập đúng địa chỉ Email cần đặt lại mật khẩu.');
    }

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const redirectTo =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });
      if (error) {
        throw new Error(translateSupabaseAuthError(error.message));
      }
      return {
        resetEmailSent: true,
        message: `Đã gửi liên kết đặt lại mật khẩu tới ${cleanEmail}. Hãy kiểm tra hộp thư (kể cả mục Spam) để đặt lại mật khẩu đồng bộ cho cả máy tính và điện thoại.`,
      };
    }

    const cleanPassword = normalizePasswordInput(params.newPassword || '');
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
      const wallets = ensureUserPersonalWalletV2(localMatch.profile.id);
      return {
        profile: localMatch.profile,
        wallets,
        isCloud: false,
      };
    }

    return this.signUpUser({
      displayName: cleanEmail.split('@')[0],
      email: cleanEmail,
      password: cleanPassword,
      uiMode: 'standard',
    });
  },

  async updateUserProfile(
    userId: string,
    updates: Partial<
      Pick<UserProfile, 'displayName' | 'avatarColor' | 'uiMode' | 'defaultWalletId'>
    >
  ): Promise<UserProfile | null> {
    if (updates.avatarColor) {
      saveStoredAvatarColor(userId, updates.avatarColor);
    }

    const supabase = getSupabaseBrowserClient();
    if (supabase && !userId.startsWith('user-')) {
      const cleanName =
        updates.displayName !== undefined
          ? sanitizeUserText(updates.displayName, 80)
          : undefined;

      await supabase
        .from('profiles')
        .update({
          ...(cleanName ? { display_name: cleanName } : {}),
          ...(updates.uiMode !== undefined ? { ui_mode: updates.uiMode } : {}),
          ...(updates.defaultWalletId !== undefined
            ? { default_wallet_id: updates.defaultWalletId }
            : {}),
        })
        .eq('id', userId);

      if (cleanName || updates.avatarColor || updates.uiMode) {
        await supabase.auth
          .updateUser({
            data: {
              ...(cleanName ? { display_name: cleanName } : {}),
              ...(updates.avatarColor ? { avatar_color: updates.avatarColor } : {}),
              ...(updates.uiMode ? { ui_mode: updates.uiMode } : {}),
            },
          })
          .catch(() => {});
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const refreshed = await loadCloudProfileAndWallets(supabase, user);
        return refreshed.profile;
      }
      return null;
    }

    const users = loadUsersV2();
    let updatedProfile: UserProfile | null = null;

    const next = users.map((u) => {
      if (u.profile.id === userId) {
        const nextName =
          updates.displayName !== undefined
            ? sanitizeUserText(updates.displayName, 80) || u.profile.displayName
            : u.profile.displayName;
        const nextUiMode = updates.uiMode ?? u.profile.uiMode;
        updatedProfile = {
          ...u.profile,
          ...updates,
          displayName: nextName,
          avatarText: getAvatarInitials(nextName),
          roleLabel:
            nextUiMode === 'senior' ? 'Giao diện Đơn giản' : 'Giao diện Chi tiết',
        };
        return { ...u, profile: updatedProfile };
      }
      return u;
    });
    saveUsersV2(next);
    return updatedProfile;
  },

  async changePasswordLoggedIn(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const cleanCurrent = normalizePasswordInput(params.currentPassword);
    const cleanNew = normalizePasswordInput(params.newPassword);

    if (!cleanNew || cleanNew.length < 6) {
      throw new Error('Mật khẩu mới cần có tối thiểu 6 ký tự.');
    }

    const supabase = getSupabaseBrowserClient();
    if (supabase && !params.userId.startsWith('user-')) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      }

      // Verify current password against Supabase Cloud before updating
      const checkRes = await supabase.auth.signInWithPassword({
        email: user.email,
        password: cleanCurrent,
      });
      if (checkRes.error) {
        throw new Error('Mật khẩu hiện tại chưa chính xác.');
      }

      const { error } = await supabase.auth.updateUser({ password: cleanNew });
      if (error) {
        throw new Error(translateSupabaseAuthError(error.message));
      }
      return;
    }

    const users = loadUsersV2();
    const account = users.find((u) => u.profile.id === params.userId);
    if (!account) {
      throw new Error('Không tìm thấy thông tin tài khoản hiện tại.');
    }

    const verifyCurrent = await verifyPasswordSecure(cleanCurrent, account.passwordHash);
    if (!verifyCurrent.valid) {
      throw new Error('Mật khẩu hiện tại chưa chính xác.');
    }

    const freshHash = await hashPasswordSecure(cleanNew);
    upsertLocalUserAccount(account.profile, freshHash);
  },

  async deleteUserAccount(userId: string): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !userId.startsWith('user-')) {
      await supabase.from('transactions').delete().eq('user_id', userId);
      await supabase.from('wallets').delete().eq('owner_id', userId);
      await this.signOutUser();
      return;
    }

    const users = loadUsersV2();
    saveUsersV2(users.filter((u) => u.profile.id !== userId));

    const wallets = loadWalletsV2();
    const ownedWalletIds = new Set(
      wallets.filter((w) => w.ownerId === userId).map((w) => w.id)
    );
    saveWalletsV2(wallets.filter((w) => w.ownerId !== userId));

    const txs = loadTransactionsV2();
    saveTransactionsV2(
      txs.filter((t) => t.userId !== userId && !ownedWalletIds.has(t.walletId))
    );

    await this.signOutUser();
  },

  async exportAccountBackupJson(userId: string): Promise<AccountBackupPayload> {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !userId.startsWith('user-')) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Chưa đăng nhập.');
      const { profile, wallets } = await loadCloudProfileAndWallets(supabase, user);
      const { data: txRows } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false });

      const transactions: FinanceTransaction[] = (txRows || []).map((row) => ({
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

      return {
        version: 2,
        exportedAt: new Date().toISOString(),
        profile,
        wallets,
        transactions,
      };
    }

    const users = loadUsersV2();
    const account = users.find((u) => u.profile.id === userId);
    if (!account) {
      throw new Error('Không tìm thấy hồ sơ tài khoản để sao lưu.');
    }

    const wallets = getPersonalWalletsForUserV2(userId);
    const walletIds = new Set(wallets.map((w) => w.id));
    const allTxs = loadTransactionsV2().filter(
      (t) => t.userId === userId || walletIds.has(t.walletId)
    );

    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      profile: account.profile,
      wallets,
      transactions: allTxs,
    };
  },

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

  async updateUserUiMode(userId: string, uiMode: UIMode): Promise<UserProfile | null> {
    return this.updateUserProfile(userId, { uiMode });
  },

  async createWallet(params: {
    userId: string;
    name: string;
    type: WalletType;
  }): Promise<Wallet> {
    const cleanName = sanitizeUserText(params.name, 60) || 'Ví Cá Nhân Mới';
    const walletType: WalletType = params.type === 'savings' ? 'savings' : 'personal';

    const supabase = getSupabaseBrowserClient();
    if (supabase && !params.userId.startsWith('user-')) {
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

      if (error || !data) {
        throw new Error(`Không thể tạo ví mới trên Cloud: ${error?.message || ''}`);
      }

      await supabase
        .from('wallet_members')
        .upsert(
          {
            wallet_id: data.id,
            user_id: params.userId,
            role: 'owner',
          },
          { onConflict: 'wallet_id,user_id' }
        )
        .then(() => {});

      return {
        ...mapSupabaseWalletRow(data as Record<string, unknown>),
        type: walletType,
      };
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

  async renameWallet(walletId: string, userId: string, newName: string): Promise<void> {
    const clean = sanitizeUserText(newName, 60);
    if (!clean) throw new Error('Tên ví không được để trống.');

    const supabase = getSupabaseBrowserClient();
    if (supabase && !walletId.startsWith('w-')) {
      const { error } = await supabase
        .from('wallets')
        .update({ name: clean })
        .eq('id', walletId)
        .eq('owner_id', userId);
      if (error) throw new Error(error.message);
      return;
    }

    const all = loadWalletsV2();
    saveWalletsV2(
      all.map((w) =>
        w.id === walletId && w.ownerId === userId ? { ...w, name: clean } : w
      )
    );
  },

  async deleteWallet(walletId: string, userId: string): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !walletId.startsWith('w-')) {
      const wallets = await ensureCloudPersonalWallets(supabase, userId);
      if (wallets.length <= 1) {
        throw new Error('Không thể xóa ví cá nhân duy nhất của tài khoản.');
      }
      const { error } = await supabase
        .from('wallets')
        .delete()
        .eq('id', walletId)
        .eq('owner_id', userId);
      if (error) throw new Error(error.message);
      return;
    }

    const userWallets = getPersonalWalletsForUserV2(userId);
    if (userWallets.length <= 1) {
      throw new Error('Không thể xóa ví cá nhân duy nhất của tài khoản.');
    }
    const target = userWallets.find((w) => w.id === walletId);
    if (!target) {
      throw new Error('Không tìm thấy ví hoặc bạn không có quyền xóa.');
    }

    const allWallets = loadWalletsV2();
    saveWalletsV2(allWallets.filter((w) => w.id !== walletId));

    const allTxs = loadTransactionsV2();
    saveTransactionsV2(allTxs.filter((t) => t.walletId !== walletId));
  },

  async getTransactions(walletId: string, userId?: string): Promise<FinanceTransaction[]> {
    if (!walletId) return [];
    const supabase = getSupabaseBrowserClient();

    if (supabase && !walletId.startsWith('w-')) {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .order('transaction_date', { ascending: false });

      if (userId && !userId.startsWith('user-')) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Supabase getTransactions error:', error.message);
        return [];
      }

      return (data || []).map((row) => ({
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
      const payload = items.map((item) => {
        const cat = CATEGORY_BY_SLUG[item.categorySlug] || CATEGORY_BY_SLUG['khac'];
        return {
          wallet_id: walletId,
          user_id: user.id,
          category_id: cat.id,
          category_slug: cat.slug,
          amount: Math.max(1, Math.round(item.amount)),
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

      if (error || !data) {
        throw new Error(
          `Không thể lưu giao dịch lên Supabase Cloud: ${error?.message || 'Lỗi không xác định'}`
        );
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
        amount: Math.max(1, Math.round(item.amount)),
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
          amount: Math.max(1, Math.round(params.amount)),
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
      Pick<
        FinanceTransaction,
        'amount' | 'description' | 'categorySlug' | 'type' | 'transactionDate'
      >
    >
  ): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    const cat = updates.categorySlug ? CATEGORY_BY_SLUG[updates.categorySlug] : undefined;

    if (supabase && !id.startsWith('tx-')) {
      const { error } = await supabase
        .from('transactions')
        .update({
          ...(updates.amount !== undefined
            ? { amount: Math.max(1, Math.round(updates.amount)) }
            : {}),
          ...(updates.description !== undefined
            ? { description: sanitizeUserText(updates.description, 200) }
            : {}),
          ...(updates.type !== undefined ? { type: updates.type } : {}),
          ...(updates.transactionDate !== undefined
            ? { transaction_date: updates.transactionDate }
            : {}),
          ...(cat ? { category_id: cat.id, category_slug: cat.slug } : {}),
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return;
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
      const { error } = await supabase.from('transactions').delete().in('id', ids);
      if (error) throw new Error(error.message);
      return;
    }

    const idSet = new Set(ids);
    const all = loadTransactionsV2();
    saveTransactionsV2(all.filter((t) => !idSet.has(t.id)));
  },

  async clearWalletTransactions(walletId: string): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !walletId.startsWith('w-')) {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('wallet_id', walletId);
      if (error) throw new Error(error.message);
      return;
    }
    const all = loadTransactionsV2();
    saveTransactionsV2(all.filter((t) => t.walletId !== walletId));
  },
};
