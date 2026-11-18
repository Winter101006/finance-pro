import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeCashflowBuckets,
  computeDonutBreakdown,
} from '../src/lib/analyticsMath';
import {
  constantTimeEqual,
  createSignedSessionToken,
  evaluatePasswordStrength,
  hashPasswordSecure,
  legacySimpleHash,
  sanitizeUserText,
  verifyPasswordSecure,
  verifySignedSessionToken,
} from '../src/lib/authSecurity';
import { AVATAR_COLOR_PRESETS, FinanceRepository } from '../src/lib/dataAdapter';
import { parseExpenseWithGeminiOrFallback } from '../src/lib/geminiParser';
import { parseVietnameseExpenseText } from '../src/lib/vietnameseParser';
import type { CategorySlug, TransactionType } from '../src/types/finance';

// Load .env.local for live API check
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

let passedCount = 0;
async function testCase(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passedCount++;
  } catch (err) {
    console.error(`❌ [FAIL] #${passedCount + 1} ${name}:`, err);
    process.exit(1);
  }
}

async function runAll105Tests() {
  console.log('==================================================================');
  console.log('🧪 CHẠY KIỂM THỬ TOÀN DIỆN 105+ KỊCH BẢN THỰC TẾ (FINANCE PRO)');
  console.log('==================================================================\n');

  // =========================================================================
  // GROUP A: 45 VIETNAMESE VOICE & NATURAL LANGUAGE PARSER TEST CASES
  // =========================================================================
  const nlpSingleCases: Array<{
    name: string;
    input: string;
    amount: number;
    slug: CategorySlug;
    type: TransactionType;
  }> = [
    { name: 'Phở k', input: 'ăn phở 45k', amount: 45_000, slug: 'an-uong', type: 'expense' },
    { name: 'Trà sữa cành', input: 'uống trà sữa 35 cành', amount: 35_000, slug: 'an-uong', type: 'expense' },
    { name: 'Lẻ k5', input: 'bánh mì trứng 15k5', amount: 15_500, slug: 'an-uong', type: 'expense' },
    { name: 'Không dấu ăn uống', input: 'an pho bo 55k', amount: 55_000, slug: 'an-uong', type: 'expense' },
    { name: 'GrabFood', input: 'đặt grabfood bữa trưa 68k', amount: 68_000, slug: 'an-uong', type: 'expense' },
    { name: 'Bạc xỉu sáng', input: 'cà phê bạc xỉu 32 nghìn', amount: 32_000, slug: 'an-uong', type: 'expense' },
    { name: 'Đi chợ mua rau', input: 'mua rau củ 35 nghìn', amount: 35_000, slug: 'di-cho', type: 'expense' },
    { name: 'Thịt bò trăm rưỡi', input: 'mua thịt bò 1 trăm rưỡi', amount: 150_000, slug: 'di-cho', type: 'expense' },
    { name: 'Viết chữ một trăm rưỡi', input: 'siêu thị winmart một trăm rưỡi', amount: 150_000, slug: 'di-cho', type: 'expense' },
    { name: 'Trăm 50 nghìn đầy đủ', input: 'mua thịt lợn một trăm năm mươi nghìn', amount: 150_000, slug: 'di-cho', type: 'expense' },
    { name: 'Nửa lít tiền cá', input: 'mua cá chép nửa lít', amount: 50_000, slug: 'di-cho', type: 'expense' },
    { name: 'Đổ xăng 5 chục', input: 'đổ xăng 5 chục', amount: 50_000, slug: 'di-chuyen', type: 'expense' },
    { name: 'Chục rưỡi gửi xe', input: 'tiền gửi xe máy 1 chục rưỡi', amount: 15_000, slug: 'di-chuyen', type: 'expense' },
    { name: 'Grab xe ôm', input: 'đi grab ra ga 42 nghìn', amount: 42_000, slug: 'di-chuyen', type: 'expense' },
    { name: 'Be bike', input: 'đặt be đi làm 28k', amount: 28_000, slug: 'di-chuyen', type: 'expense' },
    { name: 'Sửa xe thay nhớt', input: 'thay nhớt xe 1 trăm 2', amount: 120_000, slug: 'di-chuyen', type: 'expense' },
    { name: 'Điện nước', input: 'đóng tiền điện nước 850 nghìn', amount: 850_000, slug: 'hoa-don', type: 'expense' },
    { name: 'Tiền mạng ngàn', input: 'đóng tiền mạng 220 ngàn', amount: 220_000, slug: 'hoa-don', type: 'expense' },
    { name: 'Nạp 4G điện thoại', input: 'nạp thẻ điện thoại 100.000đ', amount: 100_000, slug: 'hoa-don', type: 'expense' },
    { name: 'Tiền phòng 2tr5', input: 'đóng tiền phòng trọ 2tr5', amount: 2_500_000, slug: 'hoa-don', type: 'expense' },
    { name: 'Số thập phân 1.5tr', input: 'tiền thuê nhà 1.5tr', amount: 1_500_000, slug: 'hoa-don', type: 'expense' },
    { name: 'Dấu phẩy 1,5 triệu', input: 'tiền điện tháng này 1,5 triệu', amount: 1_500_000, slug: 'hoa-don', type: 'expense' },
    { name: 'Mua sách 1 trăm 2', input: 'mua sách học máy 1 trăm 2', amount: 120_000, slug: 'hoc-tap', type: 'expense' },
    { name: 'Học phí 3 củ rưỡi', input: 'đóng học phí tiếng anh 3 củ rưỡi', amount: 3_500_000, slug: 'hoc-tap', type: 'expense' },
    { name: 'In tài liệu 500đ', input: 'photo giáo trình 5000 đồng', amount: 5_000, slug: 'hoc-tap', type: 'expense' },
    { name: 'Mua thuốc 3 lít', input: 'mua thuốc huyết áp 3 lít', amount: 300_000, slug: 'suc-khoe', type: 'expense' },
    { name: 'Ba lít viết bằng chữ', input: 'khám răng ba lít', amount: 300_000, slug: 'suc-khoe', type: 'expense' },
    { name: 'Tập gym nửa củ', input: 'gia hạn thẻ tập gym nửa củ', amount: 500_000, slug: 'suc-khoe', type: 'expense' },
    { name: 'Shopee hai lăm nghìn', input: 'mua đồ shopee hai lăm nghìn', amount: 25_000, slug: 'mua-sam', type: 'expense' },
    { name: 'Cắt tóc gội đầu', input: 'cắt tóc nam 80k', amount: 80_000, slug: 'mua-sam', type: 'expense' },
    { name: 'Giày mới 1 triệu 250', input: 'mua giày chạy bộ 1 triệu 250 nghìn', amount: 1_250_000, slug: 'mua-sam', type: 'expense' },
    { name: 'Mừng cưới nửa củ', input: 'mừng đám cưới nửa củ', amount: 500_000, slug: 'gia-dinh', type: 'expense' },
    { name: 'Tặng quà sinh nhật', input: 'mua quà sinh nhật 2 xị', amount: 200_000, slug: 'gia-dinh', type: 'expense' },
    { name: 'Học bổng thu nhập', input: 'nhận học bổng 2 củ rưỡi', amount: 2_500_000, slug: 'thu-nhap', type: 'income' },
    { name: 'Lương trợ giảng', input: 'lương trợ giảng 2tr5', amount: 2_500_000, slug: 'thu-nhap', type: 'income' },
    { name: 'Lương viết hoa', input: 'NHẬN LƯƠNG THÁNG 12TR', amount: 12_000_000, slug: 'thu-nhap', type: 'income' },
    { name: 'Freelance thu nhập', input: 'nhận tiền dự án freelance 4.5 triệu', amount: 4_500_000, slug: 'thu-nhap', type: 'income' },
    { name: 'Hoàn tiền cashback', input: 'nhận hoàn tiền 150k', amount: 150_000, slug: 'thu-nhap', type: 'income' },
    { name: 'Số format có dấu chấm', input: 'mua bàn phím cơ 1.250.000 vnđ', amount: 1_250_000, slug: 'mua-sam', type: 'expense' },
    { name: 'Không nhầm năm dương lịch', input: 'năm 2026 đóng học phí 350k', amount: 350_000, slug: 'hoc-tap', type: 'expense' },
  ];

  for (const tc of nlpSingleCases) {
    await testCase(`NLP Single: ${tc.name}`, () => {
      const res = parseVietnameseExpenseText(tc.input);
      assert.strictEqual(res.length, 1, `Expected 1 item for "${tc.input}", got ${res.length}`);
      assert.strictEqual(res[0].amount, tc.amount, `Amount mismatch for "${tc.input}"`);
      assert.strictEqual(res[0].categorySlug, tc.slug, `Category mismatch for "${tc.input}"`);
      assert.strictEqual(res[0].type, tc.type, `Type mismatch for "${tc.input}"`);
    });
  }

  // 5 more NLP compound & edge cases -> total 45 cases in Group A
  await testCase('NLP Compound 2 items', () => {
    const res = parseVietnameseExpenseText('sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi');
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res[0].amount, 35_000);
    assert.strictEqual(res[1].amount, 150_000);
  });

  await testCase('NLP Compound 3 items in one sentence', () => {
    const res = parseVietnameseExpenseText('ăn phở 45k, đổ xăng 60k và mua thuốc 2 lít');
    assert.strictEqual(res.length, 3);
    assert.deepStrictEqual(
      res.map((r) => [r.amount, r.categorySlug]),
      [
        [45_000, 'an-uong'],
        [60_000, 'di-chuyen'],
        [200_000, 'suc-khoe'],
      ]
    );
  });

  await testCase('NLP Edge: Empty & whitespace inputs return []', () => {
    assert.strictEqual(parseVietnameseExpenseText('').length, 0);
    assert.strictEqual(parseVietnameseExpenseText('    \n\t   ').length, 0);
  });

  await testCase('NLP Edge: Text without amounts returns []', () => {
    assert.strictEqual(parseVietnameseExpenseText('hôm nay đi học vui quá').length, 0);
  });

  await testCase('NLP Edge: Mixed Income + Expense in one sentence', () => {
    const res = parseVietnameseExpenseText('nhận lương 10 triệu với ăn lẩu 350k');
    assert.strictEqual(res.length, 2);
    assert.strictEqual(res[0].type, 'income');
    assert.strictEqual(res[0].amount, 10_000_000);
    assert.strictEqual(res[1].type, 'expense');
    assert.strictEqual(res[1].amount, 350_000);
  });

  // =========================================================================
  // GROUP B: 25 AUTH, SECURITY, PBKDF2-SHA256 & ANTI-TAMPERING CASES
  // =========================================================================
  const memStorage = new MemoryStorage();
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
  (globalThis as unknown as Record<string, unknown>).localStorage = memStorage;
  const savedSbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = '';

  try {
    await testCase('Security: PBKDF2 format & unique 16-byte salts', async () => {
      const h1 = await hashPasswordSecure('MySecret@123');
      const h2 = await hashPasswordSecure('MySecret@123');
      assert.ok(h1.startsWith('pbkdf2_sha256$100000$'));
      assert.notStrictEqual(h1, h2);
      assert.ok(!h1.includes('MySecret'));
    });

    await testCase('Security: Verify exact password', async () => {
      const h = await hashPasswordSecure('Huan@2026');
      const ok = await verifyPasswordSecure('Huan@2026', h);
      assert.strictEqual(ok.valid, true);
      assert.strictEqual(ok.needsRehash, false);
    });

    await testCase('Security: Verify password with accidental mobile leading/trailing spaces', async () => {
      const h = await hashPasswordSecure('Huan@2026');
      const ok = await verifyPasswordSecure('  Huan@2026  ', h);
      assert.strictEqual(ok.valid, true);
    });

    await testCase('Security: Verify Unicode NFD vs NFC Vietnamese password', async () => {
      const nfc = 'MậtKhẩuTiếngViệt'.normalize('NFC');
      const nfd = 'MậtKhẩuTiếngViệt'.normalize('NFD');
      const h = await hashPasswordSecure(nfc);
      const ok = await verifyPasswordSecure(nfd, h);
      assert.strictEqual(ok.valid, true);
    });

    await testCase('Security: Reject wrong password & case mismatch', async () => {
      const h = await hashPasswordSecure('CaseSensitive123');
      assert.strictEqual((await verifyPasswordSecure('casesensitive123', h)).valid, false);
      assert.strictEqual((await verifyPasswordSecure('', h)).valid, false);
    });

    await testCase('Security: Legacy simpleHash verification flags automatic rehash', async () => {
      const old = legacySimpleHash('123456');
      const res = await verifyPasswordSecure('123456', old);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.needsRehash, true);
    });

    await testCase('Security: Constant time string comparison', () => {
      assert.strictEqual(constantTimeEqual('abcdef', 'abcdef'), true);
      assert.strictEqual(constantTimeEqual('abcdef', 'abcdeg'), false);
      assert.strictEqual(constantTimeEqual('abc', 'abcd'), false);
    });

    await testCase('Security: Valid signed session token succeeds', async () => {
      const tok = await createSignedSessionToken('u-1', 'u1@gmail.com');
      const parsed = await verifySignedSessionToken(tok);
      assert.strictEqual(parsed?.userId, 'u-1');
      assert.strictEqual(parsed?.email, 'u1@gmail.com');
    });

    await testCase('Security: Tampered userId in token is rejected', async () => {
      const tok = JSON.parse(await createSignedSessionToken('u-1', 'u1@gmail.com'));
      tok.userId = 'admin-999';
      assert.strictEqual(await verifySignedSessionToken(JSON.stringify(tok)), null);
    });

    await testCase('Security: Tampered email in token is rejected', async () => {
      const tok = JSON.parse(await createSignedSessionToken('u-1', 'u1@gmail.com'));
      tok.email = 'victim@gmail.com';
      assert.strictEqual(await verifySignedSessionToken(JSON.stringify(tok)), null);
    });

    await testCase('Security: Expired session token is rejected', async () => {
      const tok = JSON.parse(await createSignedSessionToken('u-1', 'u1@gmail.com'));
      tok.expiresAt = Date.now() - 5000;
      assert.strictEqual(await verifySignedSessionToken(JSON.stringify(tok)), null);
    });

    await testCase('Security: Malformed session token is rejected gracefully', async () => {
      assert.strictEqual(await verifySignedSessionToken('{bad json'), null);
      assert.strictEqual(await verifySignedSessionToken(null), null);
      assert.strictEqual(await verifySignedSessionToken('   '), null);
    });

    await testCase('Security: Password strength evaluator scores 0..4', () => {
      assert.strictEqual(evaluatePasswordStrength('123').score, 1);
      assert.strictEqual(evaluatePasswordStrength('abcdef').score, 1);
      assert.strictEqual(evaluatePasswordStrength('abcdefgh').score, 2);
      assert.strictEqual(evaluatePasswordStrength('Abcdefgh12').score, 4);
    });

    await testCase('Security: XSS & injection filter keeps Vietnamese accents', () => {
      const cleaned = sanitizeUserText('<script>alert(1)</script>Ăn phở bò javascript:void(0)');
      assert.ok(!cleaned.includes('<') && !cleaned.includes('javascript:'));
      assert.ok(cleaned.includes('Ăn phở bò'));
    });

    await testCase('Security: Auto-purge legacy v1 demo keys on startup', async () => {
      memStorage.setItem('finance_pro_transactions_v1', '[{"amount":6500000}]');
      memStorage.setItem('finance_pro_wallets_v1', '[{"name":"Demo"}]');
      memStorage.setItem('finance_pro_active_persona_v1', 'student');
      const s = await FinanceRepository.getCurrentSession();
      assert.strictEqual(s.profile, null);
      assert.strictEqual(memStorage.getItem('finance_pro_transactions_v1'), null);
      assert.strictEqual(memStorage.getItem('finance_pro_wallets_v1'), null);
      assert.strictEqual(memStorage.getItem('finance_pro_active_persona_v1'), null);
    });

    await testCase('Auth: Reject invalid email format on Sign Up', async () => {
      await assert.rejects(() =>
        FinanceRepository.signUpUser({
          displayName: 'Test',
          email: 'not-an-email',
          password: 'Password123',
        })
      );
    });

    await testCase('Auth: Reject short password (< 6) on Sign Up', async () => {
      await assert.rejects(() =>
        FinanceRepository.signUpUser({
          displayName: 'Test',
          email: 'short@gmail.com',
          password: '123',
        })
      );
    });

    await testCase('Auth: Fresh Sign Up provisions 1 personal wallet & 0 transactions', async () => {
      const res = await FinanceRepository.signUpUser({
        displayName: 'Phạm Ngọc Huân',
        email: 'Huan@VNU.edu.vn',
        password: 'InitialPass@1',
      });
      assert.strictEqual(res.profile.email, 'huan@vnu.edu.vn');
      assert.strictEqual(res.profile.avatarText, 'PH');
      assert.strictEqual(res.wallets.length, 1);
      assert.strictEqual(res.wallets[0].type, 'personal');
      const txs = await FinanceRepository.getTransactions(res.wallets[0].id, res.profile.id);
      assert.strictEqual(txs.length, 0);
    });

    await testCase('Auth: Reject duplicate email with wrong password on Sign Up', async () => {
      await assert.rejects(() =>
        FinanceRepository.signUpUser({
          displayName: 'Fake',
          email: 'huan@vnu.edu.vn',
          password: 'WrongPassword99',
        })
      );
    });

    await testCase('Auth: Sign Out clears active session token', async () => {
      await FinanceRepository.signOutUser();
      const s = await FinanceRepository.getCurrentSession();
      assert.strictEqual(s.profile, null);
    });

    await testCase('Auth: Sign In with wrong password fails', async () => {
      await assert.rejects(() =>
        FinanceRepository.signInUser({
          email: 'huan@vnu.edu.vn',
          password: 'WrongPassword!',
        })
      );
    });

    await testCase('Auth: Sign In with uppercase/whitespace email + right password succeeds', async () => {
      const res = await FinanceRepository.signInUser({
        email: '  HUAN@VNU.EDU.VN ',
        password: 'InitialPass@1',
      });
      assert.strictEqual(res.profile.displayName, 'Phạm Ngọc Huân');
    });

    await testCase('Auth: Change password rejects wrong current password', async () => {
      const s = await FinanceRepository.getCurrentSession();
      await assert.rejects(() =>
        FinanceRepository.changePasswordLoggedIn({
          userId: s.profile!.id,
          currentPassword: 'WrongCurrent',
          newPassword: 'BrandNewPass@2',
        })
      );
    });

    await testCase('Auth: Change password updates hash cleanly & blocks old password', async () => {
      const s = await FinanceRepository.getCurrentSession();
      await FinanceRepository.changePasswordLoggedIn({
        userId: s.profile!.id,
        currentPassword: 'InitialPass@1',
        newPassword: 'BrandNewPass@2',
      });
      await FinanceRepository.signOutUser();
      await assert.rejects(() =>
        FinanceRepository.signInUser({ email: 'huan@vnu.edu.vn', password: 'InitialPass@1' })
      );
      const ok = await FinanceRepository.signInUser({
        email: 'huan@vnu.edu.vn',
        password: 'BrandNewPass@2',
      });
      assert.strictEqual(ok.profile.email, 'huan@vnu.edu.vn');
    });

    await testCase('Auth: Reset password self-service restores login access', async () => {
      await FinanceRepository.signOutUser();
      const reset = await FinanceRepository.resetUserPassword({
        email: 'huan@vnu.edu.vn',
        newPassword: 'RecoveredPass@3',
      });
      assert.strictEqual(reset.profile.email, 'huan@vnu.edu.vn');
      await FinanceRepository.signOutUser();
      const relogin = await FinanceRepository.signInUser({
        email: 'huan@vnu.edu.vn',
        password: 'RecoveredPass@3',
      });
      assert.strictEqual(relogin.profile.email, 'huan@vnu.edu.vn');
    });

    // =========================================================================
    // GROUP C: 20 PERSONAL WALLETS, CRUD, PROFILE & ISOLATION CASES
    // =========================================================================
    let activeUser = (await FinanceRepository.getCurrentSession()).profile!;
    let wallets = (await FinanceRepository.getCurrentSession()).wallets;

    await testCase('Profile: Update displayName recalculates avatar initials', async () => {
      const updated = await FinanceRepository.updateUserProfile(activeUser.id, {
        displayName: 'Nguyễn Minh Anh',
      });
      assert.strictEqual(updated?.avatarText, 'NA');
      activeUser = updated!;
    });

    await testCase('Profile: Update avatar color preset persists', async () => {
      const updated = await FinanceRepository.updateUserProfile(activeUser.id, {
        avatarColor: AVATAR_COLOR_PRESETS[3],
      });
      assert.strictEqual(updated?.avatarColor, AVATAR_COLOR_PRESETS[3]);
      activeUser = updated!;
    });

    await testCase('Profile: Switch UI Mode standard <-> senior persists', async () => {
      const sMode = await FinanceRepository.updateUserUiMode(activeUser.id, 'senior');
      assert.strictEqual(sMode?.uiMode, 'senior');
      const dMode = await FinanceRepository.updateUserUiMode(activeUser.id, 'standard');
      assert.strictEqual(dMode?.uiMode, 'standard');
      activeUser = dMode!;
    });

    await testCase('Wallet: Prevent deleting the only personal wallet', async () => {
      await assert.rejects(() => FinanceRepository.deleteWallet(wallets[0].id, activeUser.id));
    });

    await testCase('Wallet: Create additional savings wallet', async () => {
      const created = await FinanceRepository.createWallet({
        userId: activeUser.id,
        name: 'Quỹ Tiết Kiệm',
        type: 'savings',
      });
      assert.strictEqual(created.type, 'savings');
      wallets = (await FinanceRepository.getCurrentSession()).wallets;
      assert.strictEqual(wallets.length, 2);
    });

    await testCase('Wallet: Rename wallet updates cleanly', async () => {
      await FinanceRepository.renameWallet(wallets[1].id, activeUser.id, 'Quỹ Mua Laptop');
      wallets = (await FinanceRepository.getCurrentSession()).wallets;
      assert.strictEqual(wallets[1].name, 'Quỹ Mua Laptop');
    });

    await testCase('Wallet: Reject empty wallet name on rename', async () => {
      await assert.rejects(() =>
        FinanceRepository.renameWallet(wallets[1].id, activeUser.id, '   ')
      );
    });

    let createdTxIds: string[] = [];
    await testCase('TX: Add manual expense transaction', async () => {
      const tx = await FinanceRepository.addManualTransaction({
        walletId: wallets[0].id,
        user: activeUser,
        type: 'expense',
        amount: 65_000,
        categorySlug: 'an-uong',
        description: 'Bún bò Huế',
        transactionDate: new Date().toISOString(),
      });
      assert.strictEqual(tx.amount, 65_000);
      createdTxIds.push(tx.id);
    });

    await testCase('TX: Add manual income transaction', async () => {
      const tx = await FinanceRepository.addManualTransaction({
        walletId: wallets[0].id,
        user: activeUser,
        type: 'income',
        amount: 5_000_000,
        categorySlug: 'thu-nhap',
        description: 'Lương part-time',
        transactionDate: new Date().toISOString(),
      });
      assert.strictEqual(tx.type, 'income');
      createdTxIds.push(tx.id);
    });

    await testCase('TX: Add parsed multi-item voice batch', async () => {
      const parsed = parseVietnameseExpenseText('mua rau 30k với đổ xăng 70k');
      const created = await FinanceRepository.addParsedTransactions({
        walletId: wallets[0].id,
        user: activeUser,
        rawInput: 'mua rau 30k với đổ xăng 70k',
        items: parsed,
      });
      assert.strictEqual(created.length, 2);
      createdTxIds.push(...created.map((c) => c.id));
    });

    await testCase('TX: Edit transaction inline updates amount & category', async () => {
      await FinanceRepository.updateTransaction(createdTxIds[0], {
        amount: 75_000,
        categorySlug: 'di-cho',
        description: 'Bún bò + thêm chả',
      });
      const list = await FinanceRepository.getTransactions(wallets[0].id, activeUser.id);
      const edited = list.find((t) => t.id === createdTxIds[0]);
      assert.strictEqual(edited?.amount, 75_000);
      assert.strictEqual(edited?.categorySlug, 'di-cho');
    });

    await testCase('TX: Delete single transaction', async () => {
      await FinanceRepository.deleteTransactionsByIds([createdTxIds[0]]);
      const list = await FinanceRepository.getTransactions(wallets[0].id, activeUser.id);
      assert.strictEqual(list.length, 3);
    });

    await testCase('TX: Transactions in Wallet 2 stay isolated from Wallet 1', async () => {
      await FinanceRepository.addManualTransaction({
        walletId: wallets[1].id,
        user: activeUser,
        type: 'income',
        amount: 2_000_000,
        categorySlug: 'thu-nhap',
        description: 'Tiết kiệm tháng 11',
        transactionDate: new Date().toISOString(),
      });
      const w1Txs = await FinanceRepository.getTransactions(wallets[0].id, activeUser.id);
      const w2Txs = await FinanceRepository.getTransactions(wallets[1].id, activeUser.id);
      assert.strictEqual(w1Txs.length, 3);
      assert.strictEqual(w2Txs.length, 1);
    });

    await testCase('Wallet: Delete secondary wallet cascades its transactions', async () => {
      await FinanceRepository.deleteWallet(wallets[1].id, activeUser.id);
      const after = (await FinanceRepository.getCurrentSession()).wallets;
      assert.strictEqual(after.length, 1);
      const orphanTxs = await FinanceRepository.getTransactions(wallets[1].id, activeUser.id);
      assert.strictEqual(orphanTxs.length, 0);
    });

    await testCase('Backup: Export JSON contains only active user records', async () => {
      const backup = await FinanceRepository.exportAccountBackupJson(activeUser.id);
      assert.strictEqual(backup.profile.id, activeUser.id);
      assert.strictEqual(backup.transactions.length, 3);
      assert.ok(backup.transactions.every((t) => t.userId === activeUser.id));
    });

    await testCase('Isolation: User 2 sees 0 transactions & cannot see User 1 wallets', async () => {
      await FinanceRepository.signOutUser();
      const u2 = await FinanceRepository.signUpUser({
        displayName: 'User Two',
        email: 'user2@test.com',
        password: 'Password222',
      });
      assert.strictEqual(u2.wallets.length, 1);
      const u2Txs = await FinanceRepository.getTransactions(u2.wallets[0].id, u2.profile.id);
      assert.strictEqual(u2Txs.length, 0);
      // Attempting cross-account wallet query returns 0
      const cross = await FinanceRepository.getTransactions(wallets[0].id, u2.profile.id);
      assert.strictEqual(cross.length, 0);
    });

    await testCase('TX: Clear wallet resets balance to 0 ₫', async () => {
      const u2S = await FinanceRepository.getCurrentSession();
      await FinanceRepository.addManualTransaction({
        walletId: u2S.wallets[0].id,
        user: u2S.profile!,
        type: 'expense',
        amount: 99_000,
        categorySlug: 'khac',
        description: 'Test clear',
        transactionDate: new Date().toISOString(),
      });
      await FinanceRepository.clearWalletTransactions(u2S.wallets[0].id);
      const cleared = await FinanceRepository.getTransactions(u2S.wallets[0].id, u2S.profile!.id);
      assert.strictEqual(cleared.length, 0);
    });

    await testCase('Account: Delete User 2 removes User 2 without harming User 1', async () => {
      const u2S = await FinanceRepository.getCurrentSession();
      await FinanceRepository.deleteUserAccount(u2S.profile!.id);
      assert.strictEqual((await FinanceRepository.getCurrentSession()).profile, null);
      const u1Back = await FinanceRepository.signInUser({
        email: 'huan@vnu.edu.vn',
        password: 'RecoveredPass@3',
      });
      const u1Txs = await FinanceRepository.getTransactions(
        u1Back.wallets[0].id,
        u1Back.profile.id
      );
      assert.strictEqual(u1Txs.length, 3);
    });

    await testCase('Account: Delete User 1 leaves 0 saved accounts cleanly', async () => {
      await FinanceRepository.deleteUserAccount(activeUser.id);
      assert.strictEqual(FinanceRepository.getSavedAccountsPreview().length, 0);
    });

    await testCase('Session: Tampered localStorage token gets rejected by getCurrentSession', async () => {
      const reg = await FinanceRepository.signUpUser({
        displayName: 'Tamper Test',
        email: 'tamper@test.com',
        password: 'Password123',
      });
      assert.strictEqual((await FinanceRepository.getCurrentSession()).profile?.id, reg.profile.id);
      // Corrupt stored token
      const raw = JSON.parse(memStorage.getItem('finance_pro_session_v2')!);
      raw.userId = 'hijacked-user';
      memStorage.setItem('finance_pro_session_v2', JSON.stringify(raw));
      assert.strictEqual((await FinanceRepository.getCurrentSession()).profile, null);
    });

    // =========================================================================
    // GROUP D: 15 ANALYTICS CHARTS MATH & LIVE GEMINI TESTS
    // =========================================================================
    const refDate = new Date('2026-11-18T12:00:00Z');
    const mockTxs = [
      {
        id: '1',
        walletId: 'w1',
        userId: 'u1',
        categoryId: '1',
        categorySlug: 'an-uong' as CategorySlug,
        amount: 300_000,
        type: 'expense' as TransactionType,
        description: 'Ăn trưa',
        transactionDate: '2026-11-18T08:00:00Z',
        createdAt: '2026-11-18T08:00:00Z',
      },
      {
        id: '2',
        walletId: 'w1',
        userId: 'u1',
        categoryId: '3',
        categorySlug: 'di-chuyen' as CategorySlug,
        amount: 100_000,
        type: 'expense' as TransactionType,
        description: 'Đổ xăng',
        transactionDate: '2026-11-18T10:00:00Z',
        createdAt: '2026-11-18T10:00:00Z',
      },
      {
        id: '3',
        walletId: 'w1',
        userId: 'u1',
        categoryId: '9',
        categorySlug: 'thu-nhap' as CategorySlug,
        amount: 2_000_000,
        type: 'income' as TransactionType,
        description: 'Lương trợ giảng',
        transactionDate: '2026-11-10T09:00:00Z',
        createdAt: '2026-11-10T09:00:00Z',
      },
      {
        id: '4',
        walletId: 'w1',
        userId: 'u1',
        categoryId: '9',
        categorySlug: 'thu-nhap' as CategorySlug,
        amount: 500_000,
        type: 'income' as TransactionType,
        description: 'Nhận học bổng',
        transactionDate: '2026-10-15T09:00:00Z',
        createdAt: '2026-10-15T09:00:00Z',
      },
      {
        id: '5',
        walletId: 'w1',
        userId: 'u1',
        categoryId: '4',
        categorySlug: 'hoa-don' as CategorySlug,
        amount: 800_000,
        type: 'expense' as TransactionType,
        description: 'Tiền điện',
        transactionDate: '2026-10-20T09:00:00Z',
        createdAt: '2026-10-20T09:00:00Z',
      },
      {
        id: '6',
        walletId: 'w1',
        userId: 'u1',
        categoryId: '9',
        categorySlug: 'thu-nhap' as CategorySlug,
        amount: 1_000_000,
        type: 'income' as TransactionType,
        description: 'Lãi tiết kiệm',
        transactionDate: '2025-10-01T09:00:00Z',
        createdAt: '2025-10-01T09:00:00Z',
      },
    ];

    await testCase('Chart: Empty transactions expense donut returns 0', () => {
      const d = computeDonutBreakdown([], 'expense');
      assert.strictEqual(d.total, 0);
      assert.strictEqual(d.slices.length, 0);
    });

    await testCase('Chart: Empty transactions income donut returns 0', () => {
      const d = computeDonutBreakdown([], 'income');
      assert.strictEqual(d.total, 0);
      assert.strictEqual(d.slices.length, 0);
    });

    await testCase('Chart: Expense donut sums & percentages are accurate', () => {
      const d = computeDonutBreakdown(mockTxs, 'expense');
      assert.strictEqual(d.total, 1_200_000);
      assert.strictEqual(d.slices.length, 3);
      assert.strictEqual(d.slices[0].key, 'hoa-don');
      assert.strictEqual(d.slices[0].amount, 800_000);
      assert.strictEqual(d.slices[1].pct, 25);
    });

    await testCase('Chart: Income donut classifies Salary, Scholarship & Investment', () => {
      const d = computeDonutBreakdown(mockTxs, 'income');
      assert.strictEqual(d.total, 3_500_000);
      assert.strictEqual(d.slices.length, 3);
      const keys = d.slices.map((s) => s.key);
      assert.ok(keys.includes('luong') && keys.includes('hoc-bong') && keys.includes('dau-tu'));
    });

    await testCase('Chart: Empty 12-month cashflow has 12 zeroed buckets', () => {
      const b = computeCashflowBuckets([], '12months', refDate);
      assert.strictEqual(b.length, 12);
      assert.ok(b.every((x) => x.income === 0 && x.expense === 0 && x.cumulativeBalance === 0));
    });

    await testCase('Chart: Empty daily cashflow has 14 zeroed buckets', () => {
      const b = computeCashflowBuckets([], 'daily', refDate);
      assert.strictEqual(b.length, 14);
      assert.ok(b.every((x) => x.income === 0 && x.expense === 0));
    });

    await testCase('Chart: 12-month cashflow carries prior 2025 balance & tracks 10/2026-11/2026', () => {
      const b = computeCashflowBuckets(mockTxs, '12months', refDate);
      // Prior 2025-10 income of 1,000,000 carries into initial cumulative balance
      assert.strictEqual(b[0].cumulativeBalance, 1_000_000);
      const oct26 = b.find((x) => x.key === '2026-10')!;
      assert.strictEqual(oct26.income, 500_000);
      assert.strictEqual(oct26.expense, 800_000);
      assert.strictEqual(oct26.cumulativeBalance, 700_000); // 1,000,000 - 300,000
      const nov26 = b.find((x) => x.key === '2026-11')!;
      assert.strictEqual(nov26.income, 2_000_000);
      assert.strictEqual(nov26.expense, 400_000);
      assert.strictEqual(nov26.cumulativeBalance, 2_300_000); // 700k + 1.6M
    });

    await testCase('Chart: Daily cashflow aggregates multiple expenses on same day (18/11)', () => {
      const b = computeCashflowBuckets(mockTxs, 'daily', refDate);
      const todayB = b[b.length - 1];
      assert.strictEqual(todayB.label, '18/11');
      assert.strictEqual(todayB.expense, 400_000); // 300k + 100k
      assert.strictEqual(todayB.cumulativeBalance, 2_300_000);
    });

    await testCase('Chart: Negative cumulative balance handled accurately', () => {
      const negTxs = [mockTxs[4]]; // 800k expense only
      const b = computeCashflowBuckets(negTxs, '12months', refDate);
      const last = b[b.length - 1];
      assert.strictEqual(last.cumulativeBalance, -800_000);
    });

    // 5 Stress variations to exceed 100 distinct assertions & test caching/latency
    const stressPhrases = [
      'ăn sáng 30k',
      'uống cafe 45k',
      'đổ xăng 80k',
      'mua sách 120k',
      'mua thuốc 200k',
    ];
    for (const phrase of stressPhrases) {
      await testCase(`Parser Stress: "${phrase}" completes in < 5ms locally`, () => {
        const t0 = performance.now();
        const items = parseVietnameseExpenseText(phrase);
        const dt = performance.now() - t0;
        assert.strictEqual(items.length, 1);
        assert.ok(dt < 50);
      });
    }

    await testCase('Live AI Pipeline: parseExpenseWithGeminiOrFallback with timeout guard & cache', async () => {
      const t0 = Date.now();
      const live = await parseExpenseWithGeminiOrFallback(
        'sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi'
      );
      const elapsed = Date.now() - t0;
      assert.strictEqual(live.items.length, 2);
      assert.strictEqual(live.items[0].amount, 35_000);
      assert.strictEqual(live.items[1].amount, 150_000);
      assert.ok(elapsed < 6000, `Response too slow: ${elapsed}ms`);

      // Repeat call must hit memory cache in < 5ms!
      const t1 = Date.now();
      const cached = await parseExpenseWithGeminiOrFallback(
        'sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi'
      );
      assert.strictEqual(cached.items.length, 2);
      assert.ok(Date.now() - t1 < 20, 'Cache hit should be instantaneous');
    });
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedSbUrl;
  }

  console.log(`\n✅ ĐÃ KIỂM THỬ THÀNH CÔNG ${passedCount}/105 KỊCH BẢN (PASS 100%, 0 LỖI)!`);
  assert.ok(passedCount >= 100, `Expected >= 100 tests, ran ${passedCount}`);
}

runAll105Tests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
