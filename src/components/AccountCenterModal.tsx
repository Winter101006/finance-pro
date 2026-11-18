'use client';

import {
  Check,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  Wallet as WalletIcon,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { evaluatePasswordStrength } from '@/lib/authSecurity';
import { AVATAR_COLOR_PRESETS, FinanceRepository } from '@/lib/dataAdapter';
import type { UIMode, UserProfile, Wallet, WalletType } from '@/types/finance';

interface AccountCenterProps {
  profile: UserProfile;
  wallets: Wallet[];
  activeWalletId: string;
  transactionsCount: number;
  uiMode: UIMode;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onChangeUiMode: (mode: UIMode) => Promise<void>;
  onSelectWallet: (walletId: string) => void;
  onCreateWallet: (params: { name: string; type: WalletType }) => Promise<void>;
  onRenameWallet: (walletId: string, newName: string) => Promise<void>;
  onDeleteWallet: (walletId: string) => Promise<void>;
  onProfileUpdated: (updated: UserProfile) => void;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onExportCsv: () => void;
  onClose?: () => void;
  asModal?: boolean;
}

export function AccountCenter({
  profile,
  wallets,
  activeWalletId,
  transactionsCount,
  uiMode,
  darkMode,
  onToggleDarkMode,
  onChangeUiMode,
  onSelectWallet,
  onCreateWallet,
  onRenameWallet,
  onDeleteWallet,
  onProfileUpdated,
  onSignOut,
  onDeleteAccount,
  onExportCsv,
  onClose,
  asModal = false,
}: AccountCenterProps) {
  const [nameInput, setNameInput] = useState(profile.displayName);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileToast, setProfileToast] = useState<string | null>(null);

  // Password change state
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [showPwdChars, setShowPwdChars] = useState(false);
  const [pwdStatus, setPwdStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );
  const [savingPwd, setSavingPwd] = useState(false);

  // Wallet creation / rename state
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletType, setNewWalletType] = useState<WalletType>('personal');
  const [renamingWalletId, setRenamingWalletId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [walletErr, setWalletErr] = useState<string | null>(null);

  // Delete account confirmation
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);

  const strength = useMemo(() => evaluatePasswordStrength(newPwd), [newPwd]);
  const avatarBg = profile.avatarColor || AVATAR_COLOR_PRESETS[0];

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setSavingProfile(true);
    setProfileToast(null);
    try {
      const updated = await FinanceRepository.updateUserProfile(profile.id, {
        displayName: nameInput.trim(),
      });
      if (updated) {
        onProfileUpdated(updated);
        setProfileToast('Đã cập nhật tên hiển thị thành công.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSelectColor = async (color: string) => {
    const updated = await FinanceRepository.updateUserProfile(profile.id, {
      avatarColor: color,
    });
    if (updated) {
      onProfileUpdated(updated);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdStatus(null);
    setSavingPwd(true);
    try {
      await FinanceRepository.changePasswordLoggedIn({
        userId: profile.id,
        currentPassword: currentPwd,
        newPassword: newPwd,
      });
      setCurrentPwd('');
      setNewPwd('');
      setPwdStatus({
        type: 'ok',
        msg: 'Đổi mật khẩu thành công! Mật khẩu mới đã được mã hóa PBKDF2-SHA256.',
      });
    } catch (err) {
      setPwdStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Không thể đổi mật khẩu.',
      });
    } finally {
      setSavingPwd(false);
    }
  };

  const handleExportJsonBackup = async () => {
    const payload = await FinanceRepository.exportAccountBackupJson(profile.id);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance_pro_backup_${profile.email.split('@')[0]}.json`;
    a.click();
  };

  const content = (
    <div className="space-y-5">
      {/* 1. PROFILE HERO CARD */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-5 text-white shadow-lg shadow-indigo-500/20 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/40 text-lg font-black text-white shadow-md"
              style={{ backgroundColor: avatarBg }}
            >
              {profile.avatarText}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black tracking-tight sm:text-xl">
                {profile.displayName}
              </h2>
              <p className="truncate font-mono text-xs text-indigo-100">{profile.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 backdrop-blur-md">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                  <span>PBKDF2-SHA256</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5">
                  <span>{wallets.length} ví · {transactionsCount} giao dịch</span>
                </span>
              </div>
            </div>
          </div>

          {asModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. PROFILE EDIT & AVATAR COLOR */}
      <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] space-y-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
          <User className="h-4 w-4 text-indigo-600" />
          <span>Thông tin cá nhân &amp; Giao diện</span>
        </div>

        <form onSubmit={handleSaveName} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Tên hiển thị của bạn"
            className="h-11 flex-1 rounded-2xl border border-indigo-200 bg-slate-50 px-4 text-base font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white sm:text-sm"
          />
          <button
            type="submit"
            disabled={savingProfile}
            className="h-11 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-xs font-extrabold text-white shadow-sm hover:brightness-105"
          >
            {savingProfile ? 'Đang lưu...' : 'Lưu tên mới'}
          </button>
        </form>

        {profileToast && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <Check className="h-4 w-4" />
            <span>{profileToast}</span>
          </div>
        )}

        {/* Avatar Color Picker */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
            <Palette className="h-3.5 w-3.5 text-indigo-500" />
            <span>Màu đại diện:</span>
          </span>
          <div className="flex items-center gap-2">
            {AVATAR_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleSelectColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  avatarBg === c
                    ? 'scale-110 border-slate-900 dark:border-white'
                    : 'border-transparent opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Chọn màu ${c}`}
              />
            ))}
          </div>
        </div>

        {/* UI Mode & Theme Row */}
        <div className="grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3 dark:border-white/10 sm:grid-cols-2">
          <div className="grid grid-cols-2 rounded-2xl border border-indigo-100 bg-slate-100/90 p-1 dark:border-indigo-500/20 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => onChangeUiMode('standard')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition ${
                uiMode === 'standard'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Chi tiết</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeUiMode('senior')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-extrabold transition ${
                uiMode === 'senior'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Đơn giản</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-slate-50 px-4 text-xs font-extrabold text-slate-700 hover:bg-indigo-50 dark:border-indigo-500/20 dark:bg-slate-900 dark:text-slate-200"
          >
            {darkMode ? (
              <>
                <Sun className="h-4 w-4 text-amber-400" />
                <span>Chuyển giao diện Sáng</span>
              </>
            ) : (
              <>
                <Moon className="h-4 w-4 text-indigo-600" />
                <span>Chuyển giao diện Tối</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. WALLET MANAGER */}
      <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
            <WalletIcon className="h-4 w-4 text-indigo-600" />
            <span>Quản lý Ví Cá Nhân ({wallets.length})</span>
          </div>
        </div>

        {walletErr && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {walletErr}
          </div>
        )}

        <div className="space-y-2">
          {wallets.map((w) => {
            const isCurrent = w.id === activeWalletId;
            const isRenaming = renamingWalletId === w.id;
            return (
              <div
                key={w.id}
                className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition ${
                  isCurrent
                    ? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/15'
                    : 'border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]'
                }`}
              >
                {isRenaming ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      className="h-9 flex-1 rounded-xl border border-indigo-300 bg-white px-3 text-xs font-bold text-slate-900 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (renameText.trim()) {
                          await onRenameWallet(w.id, renameText.trim());
                          setRenamingWalletId(null);
                        }
                      }}
                      className="h-9 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingWalletId(null)}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectWallet(w.id);
                        if (asModal && onClose) onClose();
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <WalletIcon className="h-4 w-4 shrink-0 text-indigo-600" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-extrabold text-slate-900 dark:text-white">
                          {w.name}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-400">
                          {w.type === 'savings' ? 'Quỹ Tiết Kiệm' : 'Ví Chi Tiêu Cá Nhân'}
                          {isCurrent ? ' · Đang mở' : ''}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingWalletId(w.id);
                          setRenameText(w.name);
                          setWalletErr(null);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600"
                        title="Đổi tên ví"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>

                      {wallets.length > 1 && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setWalletErr(null);
                              await onDeleteWallet(w.id);
                            } catch (err) {
                              setWalletErr(
                                err instanceof Error ? err.message : 'Không thể xóa ví.'
                              );
                            }
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Xóa ví phụ này"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Add wallet compact form */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newWalletName.trim()) return;
            await onCreateWallet({ name: newWalletName.trim(), type: newWalletType });
            setNewWalletName('');
          }}
          className="flex flex-col gap-2 pt-1 sm:flex-row"
        >
          <input
            type="text"
            value={newWalletName}
            onChange={(e) => setNewWalletName(e.target.value)}
            placeholder="Tên ví mới (VD: Quỹ Tiết Kiệm)..."
            className="h-10 flex-1 rounded-xl border border-indigo-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
          />
          <select
            value={newWalletType}
            onChange={(e) => setNewWalletType(e.target.value as WalletType)}
            className="h-10 rounded-xl border border-indigo-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white"
          >
            <option value="personal">Chi tiêu</option>
            <option value="savings">Tiết kiệm</option>
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-extrabold text-white hover:bg-indigo-700"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>Thêm ví</span>
          </button>
        </form>
      </div>

      {/* 4. SECURITY & CHANGE PASSWORD */}
      <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
            <KeyRound className="h-4 w-4 text-indigo-600" />
            <span>Bảo mật &amp; Đổi mật khẩu</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPwdForm((v) => !v);
              setPwdStatus(null);
            }}
            className="text-xs font-extrabold text-indigo-600 hover:underline dark:text-indigo-300"
          >
            {showPwdForm ? 'Thu gọn' : 'Đổi mật khẩu'}
          </button>
        </div>

        {showPwdForm && (
          <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPwdChars ? 'text' : 'password'}
                required
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Mật khẩu hiện tại"
                className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50 pl-10 pr-10 text-base font-semibold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPwdChars((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showPwdChars ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <div>
              <input
                type={showPwdChars ? 'text' : 'password'}
                required
                minLength={6}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50 px-4 text-base font-semibold text-slate-900 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-white sm:text-sm"
              />
              {newPwd && (
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold">
                  <div className="flex flex-1 gap-1 mr-3">
                    {[1, 2, 3, 4].map((lvl) => (
                      <div
                        key={lvl}
                        className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700"
                        style={{
                          backgroundColor:
                            strength.score >= lvl ? strength.color : undefined,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            {pwdStatus && (
              <div
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  pwdStatus.type === 'ok'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {pwdStatus.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={savingPwd}
              className="h-11 w-full rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-xs font-extrabold text-white"
            >
              {savingPwd ? 'Đang cập nhật bảo mật...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </form>
        )}
      </div>

      {/* 5. DATA BACKUP & SIGN OUT */}
      <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-indigo-500/20 dark:bg-[#131B2E] space-y-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
          <Database className="h-4 w-4 text-indigo-600" />
          <span>Sao lưu &amp; Phiên đăng nhập</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={onExportCsv}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-200"
          >
            <Download className="h-4 w-4" />
            <span>Xuất bảng tính CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJsonBackup}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-slate-50 px-4 text-xs font-extrabold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <Database className="h-4 w-4 text-purple-500" />
            <span>Sao lưu JSON cá nhân</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 text-sm font-extrabold text-white shadow-sm hover:bg-rose-700"
        >
          <LogOut className="h-4 w-4" />
          <span>Đăng xuất khỏi tài khoản này</span>
        </button>

        {/* Delete Account Safe Confirmation */}
        <div className="pt-1 text-center">
          {!confirmDeleteStep ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteStep(true)}
              className="text-xs font-semibold text-slate-400 hover:text-rose-600 hover:underline"
            >
              Xóa vĩnh viễn tài khoản &amp; dữ liệu cá nhân
            </button>
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs space-y-2 dark:border-rose-500/30 dark:bg-rose-950/30">
              <div className="font-bold text-rose-700 dark:text-rose-300">
                Hành động này sẽ xóa sạch toàn bộ ví và giao dịch của {profile.email}. Bạn chắc chắn chứ?
              </div>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  className="rounded-xl bg-rose-700 px-3.5 py-1.5 font-extrabold text-white"
                >
                  Xác nhận xóa vĩnh viễn
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStep(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 font-bold text-slate-700"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (asModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-indigo-200/80 bg-[#F4F7FB] p-5 pb-safe shadow-2xl dark:border-indigo-500/30 dark:bg-[#0B0F19] sm:rounded-3xl sm:p-6">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
          {content}
        </div>
      </div>
    );
  }

  return content;
}
