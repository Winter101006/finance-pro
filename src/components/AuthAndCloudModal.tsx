'use client';

import { CheckCircle2, Cloud, CloudUpload, Database, KeyRound, Loader2, LogIn, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { UIMode } from '@/types/finance';

interface AuthAndCloudModalProps {
  open: boolean;
  onClose: () => void;
  isCloudConfigured: boolean;
  isLoggedIn: boolean;
  userEmail?: string;
  onSyncLocalToCloud: () => Promise<void>;
  onAuthSuccess: () => void;
}

export function AuthAndCloudModal({
  open,
  onClose,
  isCloudConfigured,
  isLoggedIn,
  userEmail,
  onSyncLocalToCloud,
  onAuthSuccess,
}: AuthAndCloudModalProps) {
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preferredMode, setPreferredMode] = useState<UIMode>('standard');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Chưa cấu hình NEXT_PUBLIC_SUPABASE_URL trong .env.local');
      return;
    }

    setLoading(true);
    try {
      if (authTab === 'login') {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;
        setMessage('Đăng nhập Supabase Cloud thành công!');
        onAuthSuccess();
        onClose();
      } else {
        const { error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || email.split('@')[0],
              ui_mode: preferredMode,
            },
          },
        });
        if (signUpErr) throw signUpErr;
        setMessage('Đăng ký thành công! Hệ thống đã tự động tạo Ví Cá Nhân & Ví Gia Đình.');
        onAuthSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi xác thực Supabase');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncClick = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      await onSyncLocalToCloud();
      setMessage('Đã đồng bộ toàn bộ giao dịch thử nghiệm lên Supabase Cloud thành công!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
      onAuthSuccess();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-2xl dark:border-indigo-500/20 dark:bg-[#131B2E]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-indigo-100/80 px-6 py-4 dark:border-indigo-500/15">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Cấu hình Đám mây &amp; Đồng bộ Tài khoản
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kiến trúc Local-First tự động nâng cấp lên Supabase Cloud
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!isCloudConfigured ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Đang vận hành ở chế độ Local-First (Không cần cấu hình DB)</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Mọi tính năng (AI Gemini bóc tách câu nói tiếng Việt, chuyển đổi tài khoản Sinh viên / Bố Mẹ, Ví cá nhân / Ví gia đình, Hoàn tác 1 chạm) đang hoạt động 100% qua LocalStorage.
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-slate-50/80 p-4 text-xs space-y-2 dark:border-indigo-500/20 dark:bg-white/[0.03]">
                <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-300">
                  <Database className="h-4 w-4" />
                  <span>Cách kích hoạt Supabase Cloud bất cứ lúc nào:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300">
                  <li>Chạy tệp <code>supabase/schema.sql</code> trong SQL Editor của Supabase.</li>
                  <li>Điền <code>NEXT_PUBLIC_SUPABASE_URL</code> và <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> vào <code>.env.local</code>.</li>
                  <li>Ứng dụng sẽ tự động mở khóa đăng nhập đa thiết bị và nút <b>Đồng bộ dữ liệu thử nghiệm lên đám mây</b>.</li>
                </ol>
              </div>
            </div>
          ) : isLoggedIn ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-500/25 dark:bg-indigo-500/10">
                <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                  Đã kết nối tài khoản Supabase Cloud
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {userEmail}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSyncClick}
                disabled={syncing}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-3 px-4 text-xs font-extrabold text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                <span>Đồng bộ dữ liệu thử nghiệm (LocalStorage) lên đám mây</span>
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300"
              >
                Đăng xuất tài khoản Cloud
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setAuthTab('login')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    authTab === 'login'
                      ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Đăng nhập</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab('signup')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    authTab === 'signup'
                      ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Đăng ký mới</span>
                </button>
              </div>

              {authTab === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Tên hiển thị
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="VD: Phạm Ngọc Huân hoặc Cô Mai"
                      className="h-10 w-full rounded-xl border border-indigo-100 bg-slate-50 px-3 text-xs font-medium outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Chế độ giao diện mặc định
                    </label>
                    <select
                      value={preferredMode}
                      onChange={(e) => setPreferredMode(e.target.value as UIMode)}
                      className="h-10 w-full rounded-xl border border-indigo-100 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-slate-900"
                    >
                      <option value="standard">Standard Mode (Dành cho Sinh viên / Người trẻ)</option>
                      <option value="senior">Senior Mode (Chữ cực lớn dành cho Bố Mẹ)</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="24002015@gmail.hus.edu.vn"
                  className="h-10 w-full rounded-xl border border-indigo-100 bg-slate-50 px-3 text-xs font-medium outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mật khẩu
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-xl border border-indigo-100 bg-slate-50 px-3 text-xs font-medium outline-none focus:border-indigo-400 dark:border-indigo-500/20 dark:bg-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-xs font-extrabold text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                <span>{authTab === 'login' ? 'Đăng nhập vào Ví Đám Mây' : 'Tạo Tài Khoản & Ví Mặc Định'}</span>
              </button>
            </form>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
