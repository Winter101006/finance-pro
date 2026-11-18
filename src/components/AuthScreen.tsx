'use client';

import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { FinanceRepository } from '@/lib/dataAdapter';
import type { UIMode, UserProfile, Wallet as WalletType } from '@/types/finance';

interface AuthScreenProps {
  onAuthenticated: (payload: {
    profile: UserProfile;
    wallets: WalletType[];
    isCloud: boolean;
  }) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uiMode, setUiMode] = useState<UIMode>('standard');
  const [monthlyBudget, setMonthlyBudget] = useState('6000000');
  const [familyInviteCode, setFamilyInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
          uiMode,
          monthlyBudget: Number(monthlyBudget) || 6000000,
          familyInviteCode: familyInviteCode.trim() || undefined,
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
      {/* Top Minimal Brand Bar */}
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
              Hệ thống Quản lý Tài chính Đa người dùng &amp; Gia đình
            </p>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs backdrop-blur-md">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Dữ liệu riêng tư theo từng tài khoản · Supabase Cloud</span>
        </div>
      </div>

      {/* Main Split Portal */}
      <div className="mx-auto my-auto grid w-full max-w-6xl grid-cols-1 gap-8 py-8 lg:grid-cols-12 lg:items-center">
        {/* Left 6 Cols: Product Value & Multi-User Architecture */}
        <div className="space-y-6 lg:col-span-6 lg:pr-6">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-1.5 text-xs font-extrabold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Nền tảng Quản lý Thu Chi Thông Minh Thế Hệ Mới</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[42px] lg:leading-[1.15]">
            Quản lý tài chính cá nhân &amp; gia đình trên{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              cùng một nền tảng.
            </span>
          </h1>

          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            Mỗi thành viên sở hữu tài khoản và số liệu độc lập hoàn toàn (bắt đầu từ 0 ₫).
            Hỗ trợ ghi chép bằng giọng nói &amp; ngôn ngữ tự nhiên tiếng Việt với Gemini AI,
            kèm chế độ chữ lớn tương phản cao dành riêng cho Bố Mẹ.
          </p>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Wallet className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Đa Ví &amp; Đa Người Dùng
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Tạo Ví Cá Nhân riêng tư, Ví Tiết Kiệm hoặc chia sẻ Mã mời Ví Chung Gia Đình cho người thân.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Nhập Liệu AI &amp; Thủ Công
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Gõ câu tự nhiên (&ldquo;ăn phở 45k, đổ xăng 70k&rdquo;) hoặc thêm giao dịch chi tiết theo ngày, danh mục.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Chế Độ Chữ Lớn Cho Bố Mẹ
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Giao diện WCAG AAA siêu rõ nét, bấm 1 nút để nói và tự động phát giọng đọc xác nhận tiếng Việt.
              </p>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-white/90 p-4 shadow-xs">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-extrabold text-slate-900">
                Số Liệu Sạch 100%
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Không chèn dữ liệu ảo. Mọi tài khoản mới đều khởi tạo từ 0 ₫, chỉ thống kê giao dịch thực của bạn.
              </p>
            </div>
          </div>
        </div>

        {/* Right 6 Cols: Authentication Card */}
        <div className="lg:col-span-6">
          <div className="mx-auto max-w-lg rounded-3xl border border-indigo-200/80 bg-white p-6 shadow-[0_20px_60px_rgb(79,70,229,0.12)] sm:p-8">
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
                <span>Đăng ký tài khoản mới</span>
              </button>
            </div>

            <div className="mt-5">
              <h2 className="text-xl font-extrabold text-slate-900">
                {mode === 'signin'
                  ? 'Chào mừng quay trở lại!'
                  : 'Tạo tài khoản Finance Pro mới'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'signin'
                  ? 'Đăng nhập bằng email của bạn để mở sổ thu chi cá nhân & gia đình.'
                  : 'Khởi tạo sổ thu chi mới hoàn toàn sạch sẽ (0 ₫) dành riêng cho bạn.'}
              </p>
            </div>

            {errorMsg && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Họ và tên hiển thị *
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="VD: Phạm Ngọc Huân, Mẹ Lan, Bố Minh..."
                    className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mật khẩu (tối thiểu 6 ký tự) *
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-2xl border border-indigo-200 bg-slate-50/70 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <>
                  {/* Choose Default UI Experience */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Chế độ giao diện phù hợp với bạn:
                    </label>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setUiMode('standard')}
                        className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition ${
                          uiMode === 'standard'
                            ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 bg-white hover:border-indigo-200'
                        }`}
                      >
                        <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                        <div>
                          <div className="text-xs font-extrabold text-slate-900">
                            Tiêu chuẩn (Hiện đại)
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            Đầy đủ biểu đồ, bộ lọc, AI Omnibar &amp; quản lý đa ví.
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUiMode('senior')}
                        className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition ${
                          uiMode === 'senior'
                            ? 'border-indigo-900 bg-amber-50/90 ring-2 ring-indigo-900/20'
                            : 'border-slate-200 bg-white hover:border-indigo-200'
                        }`}
                      >
                        <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-indigo-900" />
                        <div>
                          <div className="text-xs font-extrabold text-slate-900">
                            Chữ Lớn (Cho Bố Mẹ)
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600">
                            Nút bấm khổng lồ, đọc xác nhận bằng giọng nói tiếng Việt.
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Initial Monthly Budget & Optional Family Invite Code */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Hạn mức chi tiêu tháng (VNĐ)
                      </label>
                      <input
                        type="number"
                        step="500000"
                        min="100000"
                        value={monthlyBudget}
                        onChange={(e) => setMonthlyBudget(e.target.value)}
                        className="h-10 w-full rounded-xl border border-indigo-200 bg-slate-50/70 px-3 font-mono text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mã Ví Gia Đình (Nếu có)
                      </label>
                      <div className="relative">
                        <Users className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={familyInviteCode}
                          onChange={(e) => setFamilyInviteCode(e.target.value.toUpperCase())}
                          placeholder="VD: FP-8492 (Tùy chọn)"
                          className="h-10 w-full rounded-xl border border-indigo-200 bg-slate-50/70 pl-8 pr-3 font-mono text-xs font-bold uppercase text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-105 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : mode === 'signin' ? (
                  <>
                    <span>Đăng nhập vào hệ thống</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span>Tạo tài khoản &amp; Bắt đầu (0 ₫)</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              {mode === 'signin' ? (
                <span>
                  Chưa có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMsg(null);
                    }}
                    className="font-extrabold text-indigo-600 hover:underline"
                  >
                    Đăng ký tài khoản mới ngay
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
                    Quay lại Đăng nhập
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl text-center text-xs text-slate-400">
        Finance Pro · Multi-User Personal &amp; Family Expense Management
      </footer>
    </div>
  );
}
