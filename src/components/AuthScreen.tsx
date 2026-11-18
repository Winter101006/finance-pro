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
import { useEffect, useState } from 'react';
import { FinanceRepository } from '@/lib/dataAdapter';
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
    Array<Pick<UserProfile, 'id' | 'email' | 'displayName' | 'avatarText'>>
  >([]);

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
    <div className="min-h-screen gemini-mesh-bg flex flex-col justify-between px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Minimal Brand Header */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Finance Pro
            </span>
            <p className="text-xs font-medium text-slate-500">
              Nền tảng Quản lý Tài chính Cá nhân Thông minh
            </p>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/85 px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs backdrop-blur-md">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Bảo mật PBKDF2-SHA256 · Dữ liệu độc lập từng tài khoản</span>
        </div>
      </div>

      {/* Main Split Portal */}
      <div className="mx-auto my-auto grid w-full max-w-6xl grid-cols-1 gap-10 py-8 lg:grid-cols-12 lg:items-center">
        {/* Left 6 Cols: Professional Personal Finance Value Proposition */}
        <div className="space-y-6 lg:col-span-6 lg:pr-6">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-1.5 text-xs font-extrabold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Sổ Thu Chi Cá Nhân · Gemini AI</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[42px] lg:leading-[1.15]">
            Kiểm soát dòng tiền cá nhân{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              nhanh, chuẩn và bảo mật.
            </span>
          </h1>

          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            Mỗi tài khoản sở hữu không gian tài chính cá nhân riêng biệt, bắt đầu từ{' '}
            <span className="font-bold text-slate-800">0 ₫</span>. Hỗ trợ bóc tách câu nói
            tự nhiên tiếng Việt bằng AI hoặc nhập thủ công chi tiết, kèm 2 chế độ hiển thị
            linh hoạt.
          </p>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Nhập Liệu AI Tự Nhiên
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Gõ hoặc nói một câu (&ldquo;ăn sáng 45k, đổ xăng 70k&rdquo;), hệ thống tự động
                tách khoản và phân loại danh mục.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                2 Chế Độ Giao Diện
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Chuyển đổi 1 chạm giữa <strong>Giao diện Chi tiết</strong> (biểu đồ, bộ lọc) và{' '}
                <strong>Giao diện Đơn giản</strong> (nút lớn, thao tác nhanh).
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Mã Hóa Mật Khẩu Chuẩn
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Mật khẩu được băm bằng thuật toán PBKDF2-HMAC-SHA256 kèm salt ngẫu nhiên và
                phiên đăng nhập có chữ ký bảo vệ.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Số Liệu Sạch 100%
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Không chứa dữ liệu mẫu dư thừa. Chỉ thống kê và lưu trữ chính xác các giao dịch
                của riêng bạn.
              </p>
            </div>
          </div>
        </div>

        {/* Right 6 Cols: Clean, Effortless Auth Card */}
        <div className="lg:col-span-6">
          <div className="mx-auto max-w-md rounded-3xl border border-indigo-200/80 bg-white p-6 shadow-[0_20px_60px_rgb(79,70,229,0.12)] sm:p-8">
            {/* Segmented Mode Switcher: Sign In vs Sign Up */}
            <div className="grid grid-cols-2 rounded-2xl border border-indigo-100 bg-slate-100/90 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold transition sm:text-sm ${
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
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold transition sm:text-sm ${
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
                  ? 'Đăng nhập tài khoản cá nhân'
                  : mode === 'signup'
                  ? 'Tạo tài khoản cá nhân mới'
                  : 'Đặt lại mật khẩu mới'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'signin'
                  ? 'Nhập email và mật khẩu để truy cập sổ thu chi của bạn.'
                  : mode === 'signup'
                  ? 'Chỉ cần 3 thông tin cơ bản để tạo ngay sổ thu chi cá nhân (0 ₫).'
                  : 'Nhập email tài khoản và mật khẩu mới bạn muốn cập nhật.'}
              </p>
            </div>

            {/* Quick-Select Saved Accounts on this Browser */}
            {mode === 'signin' && savedAccounts.length > 0 && (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                <div className="text-[11px] font-bold text-indigo-800 mb-2">
                  Tài khoản đã tạo trên trình duyệt này (chạm để điền nhanh):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {savedAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setErrorMsg(null);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold transition ${
                        email.toLowerCase() === acc.email.toLowerCase()
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-indigo-200 bg-white text-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      <span>{acc.displayName}</span>
                      <span className="opacity-75 text-[10px]">({acc.email})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 space-y-2">
                <div>{errorMsg}</div>
                {mode === 'signin' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMsg(null);
                      }}
                      className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-rose-700"
                    >
                      Đặt lại mật khẩu mới
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setErrorMsg(null);
                      }}
                      className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-extrabold text-rose-700 hover:bg-rose-100"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
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
                      className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Địa chỉ Email *
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
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
                      Đặt lại mật khẩu?
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
                    className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-11 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-indigo-600"
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu để kiểm tra'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
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
                    <span>Tạo tài khoản &amp; Vào sổ thu chi</span>
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
      </div>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl text-center text-xs text-slate-400">
        Finance Pro · Hệ thống Quản lý Tài chính Cá nhân Thông minh
      </footer>
    </div>
  );
}
