'use client';

import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { evaluatePasswordStrength } from '@/lib/authSecurity';
import { AVATAR_COLOR_PRESETS, FinanceRepository } from '@/lib/dataAdapter';
import type { UserProfile, Wallet as WalletType } from '@/types/finance';

interface AuthScreenProps {
  onAuthenticated: (payload: {
    profile: UserProfile;
    wallets: WalletType[];
    isCloud: boolean;
  }) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<
    Array<Pick<UserProfile, 'id' | 'email' | 'displayName' | 'avatarText' | 'avatarColor'>>
  >([]);

  const passwordStrength = useMemo(
    () => evaluatePasswordStrength(password),
    [password]
  );

  useEffect(() => {
    const list = FinanceRepository.getSavedAccountsPreview();
    setSavedAccounts(list);
    if (list.length > 0 && !email) {
      setEmail(list[0].email);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await FinanceRepository.signUpUser({
          displayName,
          email,
          password,
          uiMode: 'standard',
        });
        onAuthenticated(res);
      } else if (mode === 'reset') {
        const res = await FinanceRepository.resetUserPassword({
          email,
          newPassword: password,
        });
        onAuthenticated(res);
      } else {
        const res = await FinanceRepository.signInUser({
          email,
          password,
        });
        onAuthenticated(res);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Đã xảy ra lỗi khi xác thực tài khoản.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gemini-mesh-bg flex flex-col justify-between px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      {/* Top Minimal Brand Header */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 sm:h-11 sm:w-11">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent sm:text-xl">
              Finance Pro
            </span>
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs">
              Quản lý Tài chính Cá nhân Thông minh
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-white/85 px-3 py-1 text-[11px] font-bold text-indigo-700 shadow-2xs backdrop-blur-md sm:px-3.5 sm:py-1.5 sm:text-xs">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Bảo mật PBKDF2-SHA256 · Dữ liệu độc lập từng tài khoản</span>
          <span className="sm:hidden">PBKDF2 Bảo mật</span>
        </div>
      </div>

      {/* Main Split Portal (Auth card appears FIRST on Mobile, right side on Desktop) */}
      <div className="mx-auto my-auto grid w-full max-w-6xl grid-cols-1 gap-8 py-6 lg:grid-cols-12 lg:items-center lg:gap-10">
        {/* Auth Card (order-1 on mobile so phone users see Login immediately!) */}
        <div className="order-1 lg:order-2 lg:col-span-6">
          <div className="mx-auto max-w-md rounded-3xl border border-indigo-200/80 bg-white p-5 shadow-[0_20px_60px_rgb(79,70,229,0.12)] sm:p-8">
            {/* Segmented Mode Switcher: Sign In vs Sign Up */}
            <div className="grid grid-cols-2 rounded-2xl border border-indigo-100 bg-slate-100/90 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                }}
                className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl text-xs font-extrabold transition sm:text-sm ${
                  mode === 'signin'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-indigo-600'
                }`}
              >
                <KeyRound className="h-4 w-4" />
                <span>Đăng nhập</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                }}
                className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl text-xs font-extrabold transition sm:text-sm ${
                  mode === 'signup'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-indigo-600'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                <span>Đăng ký nhanh</span>
              </button>
            </div>

            <div className="mt-5">
              <h2 className="text-xl font-extrabold text-slate-900">
                {mode === 'signin'
                  ? 'Chào mừng trở lại!'
                  : mode === 'signup'
                  ? 'Tạo tài khoản cá nhân mới'
                  : 'Đặt lại mật khẩu mới'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'signin'
                  ? 'Đăng nhập để xem sổ thu chi và biểu đồ cá nhân của riêng bạn.'
                  : mode === 'signup'
                  ? 'Chỉ cần 3 thông tin để khởi tạo ví cá nhân hoàn toàn sạch (0 ₫).'
                  : 'Nhập email và mật khẩu mới bạn muốn đặt cho tài khoản.'}
              </p>
            </div>

            {/* Quick-Select Saved Accounts on this Device */}
            {mode === 'signin' && savedAccounts.length > 0 && (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                <div className="mb-2 text-[11px] font-bold text-indigo-800">
                  Tài khoản đã lưu trên máy (chạm để chọn nhanh):
                </div>
                <div className="flex flex-wrap gap-2">
                  {savedAccounts.map((acc, i) => {
                    const active = email.toLowerCase() === acc.email.toLowerCase();
                    const color =
                      acc.avatarColor ||
                      AVATAR_COLOR_PRESETS[i % AVATAR_COLOR_PRESETS.length];
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setEmail(acc.email);
                          setErrorMsg(null);
                        }}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-left transition ${
                          active
                            ? 'border-indigo-500 bg-white shadow-xs ring-2 ring-indigo-500/20'
                            : 'border-indigo-100 bg-white/80 hover:border-indigo-300'
                        }`}
                      >
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black text-white"
                          style={{ backgroundColor: color }}
                        >
                          {acc.avatarText}
                        </span>
                        <div className="leading-tight">
                          <div className="text-xs font-extrabold text-slate-900">
                            {acc.displayName}
                          </div>
                          <div className="text-[10px] text-slate-400">{acc.email}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mt-4 space-y-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                <div>{errorMsg}</div>
                {mode === 'signin' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMsg(null);
                      }}
                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white hover:bg-rose-700"
                    >
                      Đặt lại mật khẩu mới
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setErrorMsg(null);
                      }}
                      className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-rose-700 hover:bg-rose-100"
                    >
                      Chuyển sang Đăng ký
                    </button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">
                    Tên hiển thị của bạn *
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="VD: Phạm Ngọc Huân"
                      className="h-12 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-4 text-base font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white sm:text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Địa chỉ Email *
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-12 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-4 text-base font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    {mode === 'reset' ? 'Mật khẩu mới (tối thiểu 6 ký tự) *' : 'Mật khẩu *'}
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMsg(null);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:underline"
                    >
                      Quên / Đặt lại mật khẩu?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập tối thiểu 6 ký tự"
                    className="h-12 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-12 text-base font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:text-indigo-600"
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu để kiểm tra'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Live Password Strength Meter for Signup & Reset */}
                {(mode === 'signup' || mode === 'reset') && password.length > 0 && (
                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold">
                    <div className="mr-3 flex flex-1 gap-1">
                      {[1, 2, 3, 4].map((lvl) => (
                        <div
                          key={lvl}
                          className="h-1.5 flex-1 rounded-full bg-slate-200 transition-colors"
                          style={{
                            backgroundColor:
                              passwordStrength.score >= lvl
                                ? passwordStrength.color
                                : undefined,
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-105 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang xác thực bảo mật...</span>
                  </>
                ) : mode === 'signin' ? (
                  <>
                    <span>Đăng nhập ngay</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : mode === 'signup' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Tạo tài khoản &amp; Bắt đầu</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Lưu mật khẩu mới &amp; Đăng nhập</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              {mode === 'signin' ? (
                <span>
                  Lần đầu sử dụng?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMsg(null);
                    }}
                    className="font-extrabold text-indigo-600 hover:underline"
                  >
                    Tạo tài khoản mới chỉ trong 5 giây
                  </button>
                </span>
              ) : (
                <span>
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setErrorMsg(null);
                    }}
                    className="font-extrabold text-indigo-600 hover:underline"
                  >
                    Quay lại màn hình Đăng nhập
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Product Value Proposition (Left on desktop, below Login on mobile) */}
        <div className="order-2 space-y-5 lg:order-1 lg:col-span-6 lg:pr-6">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-1.5 text-xs font-extrabold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Trợ lý Thu Chi Cá Nhân · AI Giọng nói</span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[42px] lg:leading-[1.15]">
            Kiểm soát dòng tiền cá nhân{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              mượt mà trên mọi thiết bị.
            </span>
          </h1>

          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            Tối ưu cho cả điện thoại lẫn máy tính. Mọi tài khoản đều bắt đầu sạch sẽ từ{' '}
            <span className="font-bold text-slate-800">0 ₫</span>, hỗ trợ ghi chép bằng
            giọng nói tiếng Việt có sóng âm trực quan, phân tích biểu đồ chuyên sâu và bảo vệ
            bằng mã hóa đa lớp.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="mt-2.5 text-sm font-extrabold text-slate-900">
                Giọng Nói Sóng Âm Trực Quan
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Nói tiếng Việt tự nhiên (&ldquo;ăn sáng 45k, đổ xăng 70k&rdquo;) với sóng âm
                uốn lượn 60fps &amp; nhận diện chữ không độ trễ.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="mt-2.5 text-sm font-extrabold text-slate-900">
                Biểu Đồ &amp; 2 Giao Diện
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Biểu đồ Donut cơ cấu Thu/Chi và Dòng tiền lũy kế 12 tháng, chuyển 1 chạm sang
                giao diện Đơn giản.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-2.5 text-sm font-extrabold text-slate-900">
                Bảo Mật PBKDF2-SHA256
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Mật khẩu băm 100.000 vòng kèm Salt ngẫu nhiên &amp; Session Token có chữ ký chống
                giả mạo.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="mt-2.5 text-sm font-extrabold text-slate-900">
                Chuẩn App Trên Điện Thoại
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Thanh điều hướng dưới ngón tay, ẩn/hiện số dư riêng tư, nhóm giao dịch theo từng
                ngày.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl text-center text-xs text-slate-400">
        Finance Pro · Quản lý Tài chính Cá nhân Thông minh
      </footer>
    </div>
  );
}
