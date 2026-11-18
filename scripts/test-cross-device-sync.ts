import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

(globalThis as unknown as Record<string, unknown>).WebSocket = class {};

async function testCrossDeviceCloudSync() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  assert.ok(url && key, 'Supabase env vars must exist in .env.local');

  console.log('==================================================================');
  console.log('☁️  KIỂM THỬ ĐỒNG BỘ 1 TÀI KHOẢN GIỮA MÁY TÍNH (PC) & ĐIỆN THOẠI');
  console.log('==================================================================\n');

  // Create two completely isolated clients (Device A = PC, Device B = Phone) with zero shared storage
  const pcClient = createClient(url, key, { auth: { persistSession: false } });
  const phoneClient = createClient(url, key, { auth: { persistSession: false } });

  const sharedEmail = `sync_test_${Date.now()}@gmail.com`;
  const sharedPassword = 'SyncPassword@2026';

  // 1. Device A (PC) registers new account
  const signUpPc = await pcClient.auth.signUp({
    email: sharedEmail,
    password: sharedPassword,
    options: { data: { display_name: 'Phạm Ngọc Huân', ui_mode: 'standard' } },
  });
  assert.ok(!signUpPc.error && signUpPc.data.user, `PC SignUp failed: ${signUpPc.error?.message}`);
  const pcUserId = signUpPc.data.user.id;

  const { data: pcWallets } = await pcClient
    .from('wallets')
    .select('*')
    .eq('owner_id', pcUserId)
    .neq('type', 'family')
    .order('created_at', { ascending: true });
  assert.ok(pcWallets && pcWallets.length >= 1, 'PC must have a Cloud personal wallet');
  const pcWalletId = pcWallets[0].id;
  assert.ok(!pcWalletId.startsWith('w-'), 'Wallet ID must be a real Cloud UUID');

  // 2. Device A (PC) records "+75.000 đ mẹ cho" & "-45.000 đ ăn phở"
  const insPc = await pcClient.from('transactions').insert([
    {
      wallet_id: pcWalletId,
      user_id: pcUserId,
      category_slug: 'thu-nhap',
      amount: 75000,
      type: 'income',
      description: 'Mẹ cho',
    },
    {
      wallet_id: pcWalletId,
      user_id: pcUserId,
      category_slug: 'an-uong',
      amount: 45000,
      type: 'expense',
      description: 'Ăn phở sáng',
    },
  ]);
  assert.ok(!insPc.error, `PC insert tx failed: ${insPc.error?.message}`);
  console.log(`  [PASS] Máy tính (PC) đăng ký & ghi 2 giao dịch vào Cloud UUID: ${pcWalletId.slice(0, 8)}...`);

  // 3. Device B (Phone — completely clean device) signs in with the SAME email & password
  const signInPhone = await phoneClient.auth.signInWithPassword({
    email: sharedEmail,
    password: sharedPassword,
  });
  assert.ok(
    !signInPhone.error && signInPhone.data.user,
    `Phone SignIn failed: ${signInPhone.error?.message}`
  );
  const phoneUserId = signInPhone.data.user.id;
  assert.strictEqual(
    phoneUserId,
    pcUserId,
    'Điện thoại và Máy tính bắt buộc phải trả về CÙNG 1 User UUID!'
  );

  const { data: phoneWallets } = await phoneClient
    .from('wallets')
    .select('*')
    .eq('owner_id', phoneUserId)
    .neq('type', 'family')
    .order('created_at', { ascending: true });
  assert.ok(phoneWallets && phoneWallets.length >= 1);
  assert.strictEqual(
    phoneWallets[0].id,
    pcWalletId,
    'Điện thoại và Máy tính bắt buộc phải mở CÙNG 1 Ví Cá Nhân Cloud UUID!'
  );

  const { data: phoneTxs } = await phoneClient
    .from('transactions')
    .select('*')
    .eq('wallet_id', phoneWallets[0].id);
  assert.strictEqual(phoneTxs?.length, 2, 'Điện thoại phải thấy đủ 2 giao dịch từ Máy tính');
  console.log('  [PASS] Điện thoại đăng nhập cùng Email → Khớp 100% User UUID, Ví Cloud & đủ 2 giao dịch từ PC.');

  // 4. Device B (Phone) adds "-50.000 đ đổ xăng" -> Device A (PC) sees all 3 immediately
  const insPhone = await phoneClient.from('transactions').insert({
    wallet_id: phoneWallets[0].id,
    user_id: phoneUserId,
    category_slug: 'di-chuyen',
    amount: 50000,
    type: 'expense',
    description: 'Đổ xăng',
  });
  assert.ok(!insPhone.error);

  const { data: pcTxsAfter } = await pcClient
    .from('transactions')
    .select('*')
    .eq('wallet_id', pcWalletId);
  assert.strictEqual(pcTxsAfter?.length, 3, 'Máy tính phải thấy ngay giao dịch vừa thêm từ Điện thoại');
  console.log('  [PASS] Điện thoại thêm giao dịch → Máy tính nhận đủ 3 giao dịch đồng bộ 2 chiều.');

  // Clean up test records
  await pcClient.from('transactions').delete().eq('wallet_id', pcWalletId);

  console.log('\n✅ KIỂM THỬ ĐỒNG BỘ MÁY TÍNH <-> ĐIỆN THOẠI TRÊN SUPABASE CLOUD PASS 100%!');
}

testCrossDeviceCloudSync().catch((err) => {
  console.error('❌ Cross-device sync test failed:', err);
  process.exit(1);
});
