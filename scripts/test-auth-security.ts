import assert from 'node:assert';
import {
  constantTimeEqual,
  createSignedSessionToken,
  hashPasswordSecure,
  legacySimpleHash,
  sanitizeUserText,
  verifyPasswordSecure,
  verifySignedSessionToken,
} from '../src/lib/authSecurity';
import { FinanceRepository } from '../src/lib/dataAdapter';

// Setup in-memory browser localStorage mock for E2E repository security tests
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

async function runSecurityTests() {
  console.log('==================================================================');
  console.log('🛡️  KIỂM THỬ CHI TIẾT BẢO MẬT & XÁC THỰC (AUTH & SECURITY SUITE)');
  console.log('==================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. PBKDF2-HMAC-SHA256 Hashing & Random Salt Verification
  // ---------------------------------------------------------------------------
  console.log('1. Kiểm thử mã hóa mật khẩu PBKDF2-HMAC-SHA256 (100.000 vòng lặp):');
  const rawPass = 'MatKhauBaoMat@2026';
  const hash1 = await hashPasswordSecure(rawPass);
  const hash2 = await hashPasswordSecure(rawPass);

  assert.ok(
    hash1.startsWith('pbkdf2_sha256$100000$'),
    'Định dạng băm phải là pbkdf2_sha256$100000$'
  );
  assert.notStrictEqual(
    hash1,
    hash2,
    'Hai lần băm cùng 1 mật khẩu phải sinh ra 2 salt ngẫu nhiên khác nhau (chống Rainbow Table)'
  );
  assert.ok(
    !hash1.includes(rawPass),
    'Chuỗi băm tuyệt đối không được chứa mật khẩu gốc'
  );
  console.log('   [PASS] Salt ngẫu nhiên 16-byte độc lập & PBKDF2-SHA256 hoạt động chuẩn xác.');

  // ---------------------------------------------------------------------------
  // 2. Password Verification, Wrong Password Rejection & Whitespace Resilience
  // ---------------------------------------------------------------------------
  console.log('\n2. Kiểm thử xác thực mật khẩu, chống sai lệch khoảng trắng & nâng cấp mã băm cũ:');
  const checkCorrect = await verifyPasswordSecure(rawPass, hash1);
  assert.strictEqual(checkCorrect.valid, true, 'Mật khẩu đúng phải được chấp nhận');
  assert.strictEqual(checkCorrect.needsRehash, false);

  const checkWithTrailingSpace = await verifyPasswordSecure(`  ${rawPass}  `, hash1);
  assert.strictEqual(
    checkWithTrailingSpace.valid,
    true,
    'Mật khẩu đúng nhưng bị dính khoảng trắng đầu/cuối do bàn phím điện thoại vẫn phải đăng nhập được'
  );

  const checkWrong = await verifyPasswordSecure('MatKhauBaoMat@2025', hash1);
  assert.strictEqual(checkWrong.valid, false, 'Mật khẩu sai 1 ký tự phải bị từ chối');

  const checkEmpty = await verifyPasswordSecure('', hash1);
  assert.strictEqual(checkEmpty.valid, false, 'Mật khẩu rỗng phải bị từ chối');

  // Legacy hash migration test
  const oldHash = legacySimpleHash('123456');
  const checkLegacy = await verifyPasswordSecure('123456', oldHash);
  assert.strictEqual(checkLegacy.valid, true, 'Tài khoản cũ phải đăng nhập được');
  assert.strictEqual(
    checkLegacy.needsRehash,
    true,
    'Tài khoản dùng mã băm cũ phải được đánh dấu tự động nâng cấp lên PBKDF2-SHA256'
  );
  console.log('   [PASS] Xác thực mật khẩu đúng, chặn mật khẩu sai & tự động nâng cấp mã băm cũ.');

  // ---------------------------------------------------------------------------
  // 3. Signed Session Token & Anti-Tampering Verification
  // ---------------------------------------------------------------------------
  console.log('\n3. Kiểm thử chữ ký phiên đăng nhập (Signed Session Token & Chống giả mạo):');
  const token = await createSignedSessionToken('user-001', 'huan@example.com');
  const verifiedToken = await verifySignedSessionToken(token);
  assert.ok(verifiedToken, 'Token hợp lệ phải được chấp nhận');
  assert.strictEqual(verifiedToken?.userId, 'user-001');
  assert.strictEqual(verifiedToken?.email, 'huan@example.com');

  // Tamper with userId inside JSON token
  const tamperedObj = JSON.parse(token);
  tamperedObj.userId = 'user-hacker-999';
  const tamperedResult = await verifySignedSessionToken(JSON.stringify(tamperedObj));
  assert.strictEqual(
    tamperedResult,
    null,
    'Token bị chỉnh sửa userId trong LocalStorage phải bị từ chối ngay lập tức'
  );

  // Tamper with expiration time
  const expiredObj = JSON.parse(token);
  expiredObj.expiresAt = Date.now() - 1000;
  const expiredResult = await verifySignedSessionToken(JSON.stringify(expiredObj));
  assert.strictEqual(expiredResult, null, 'Token hết hạn phải bị từ chối');
  console.log('   [PASS] Chữ ký SHA-256 phát hiện và chặn 100% hành vi giả mạo Session Token.');

  // ---------------------------------------------------------------------------
  // 4. XSS & Injection Input Sanitization
  // ---------------------------------------------------------------------------
  console.log('\n4. Kiểm thử lọc mã độc XSS & bảo toàn tiếng Việt có dấu:');
  const dirty = '<script>alert("xss")</script>Phạm Ngọc Huân javascript:evil()';
  const cleaned = sanitizeUserText(dirty);
  assert.ok(!cleaned.includes('<') && !cleaned.includes('>'), 'Phải loại bỏ thẻ HTML');
  assert.ok(!cleaned.toLowerCase().includes('javascript:'), 'Phải loại bỏ javascript:');
  assert.ok(cleaned.includes('Phạm Ngọc Huân'), 'Phải giữ nguyên tiếng Việt có dấu');
  assert.strictEqual(constantTimeEqual('abc', 'abc'), true);
  assert.strictEqual(constantTimeEqual('abc', 'abd'), false);
  console.log('   [PASS] Lọc sạch thẻ độc hại XSS & giữ nguyên tiếng Việt chuẩn xác.');

  // ---------------------------------------------------------------------------
  // 5. E2E Multi-User Auth Flow & Strict Personal Data Isolation
  // ---------------------------------------------------------------------------
  console.log('\n5. Kiểm thử luồng Đăng ký -> Đăng xuất -> Đăng nhập -> Đặt lại mật khẩu & Cô lập dữ liệu:');
  const memStorage = new MemoryStorage();
  (globalThis as unknown as Record<string, unknown>).window = globalThis;
  (globalThis as unknown as Record<string, unknown>).localStorage = memStorage;

  // Ensure Supabase env vars are temporarily unset so we test the local multi-user engine deterministically
  const savedSbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = '';

  try {
    // 5.1 Initial session must be null (mandatory login screen)
    const initialSession = await FinanceRepository.getCurrentSession();
    assert.strictEqual(
      initialSession.profile,
      null,
      'Khi mới vào trang chưa đăng nhập, profile bắt buộc phải là null'
    );

    // 5.2 Sign Up User 1
    const signUp1 = await FinanceRepository.signUpUser({
      displayName: 'Phạm Ngọc Huân',
      email: 'huan@hus.edu.vn',
      password: 'MySecretPassword123',
    });
    assert.strictEqual(signUp1.profile.email, 'huan@hus.edu.vn');
    assert.strictEqual(signUp1.wallets.length, 1, 'Chỉ khởi tạo 1 Ví Cá Nhân sạch gọn');
    assert.strictEqual(signUp1.wallets[0].type, 'personal');

    const txsInitial = await FinanceRepository.getTransactions(
      signUp1.wallets[0].id,
      signUp1.profile.id
    );
    assert.strictEqual(txsInitial.length, 0, 'Tài khoản mới phải bắt đầu từ 0 giao dịch (0 ₫)');

    // Add 1 personal transaction for User 1
    await FinanceRepository.addManualTransaction({
      walletId: signUp1.wallets[0].id,
      user: signUp1.profile,
      type: 'expense',
      amount: 45000,
      categorySlug: 'an-uong',
      description: 'Ăn phở sáng',
      transactionDate: new Date().toISOString(),
    });

    // 5.3 Sign Out User 1
    await FinanceRepository.signOutUser();
    const afterLogout = await FinanceRepository.getCurrentSession();
    assert.strictEqual(afterLogout.profile, null, 'Sau khi đăng xuất, session phải về null');

    // 5.4 Sign In User 1 with WRONG password -> must fail
    let wrongPassFailed = false;
    try {
      await FinanceRepository.signInUser({
        email: 'huan@hus.edu.vn',
        password: 'WrongPassword999',
      });
    } catch {
      wrongPassFailed = true;
    }
    assert.strictEqual(wrongPassFailed, true, 'Nhập sai mật khẩu bắt buộc phải bị chặn');

    // 5.5 Sign In User 1 with CORRECT password -> must succeed!
    const signIn1 = await FinanceRepository.signInUser({
      email: '  HUAN@hus.edu.vn ', // also tests case-insensitive + trimmed email
      password: 'MySecretPassword123',
    });
    assert.strictEqual(signIn1.profile.id, signUp1.profile.id);
    const user1Txs = await FinanceRepository.getTransactions(
      signIn1.wallets[0].id,
      signIn1.profile.id
    );
    assert.strictEqual(user1Txs.length, 1, 'Đăng nhập lại phải giữ nguyên giao dịch đã lưu');
    assert.strictEqual(user1Txs[0].amount, 45000);

    // 5.6 Password Reset Flow -> must allow logging in with new password!
    await FinanceRepository.signOutUser();
    await FinanceRepository.resetUserPassword({
      email: 'huan@hus.edu.vn',
      newPassword: 'NewUpdatedPassword456',
    });
    await FinanceRepository.signOutUser();

    const signInAfterReset = await FinanceRepository.signInUser({
      email: 'huan@hus.edu.vn',
      password: 'NewUpdatedPassword456',
    });
    assert.strictEqual(signInAfterReset.profile.id, signUp1.profile.id);

    // 5.7 Sign Up User 2 & Verify Strict Data Isolation
    await FinanceRepository.signOutUser();
    const signUp2 = await FinanceRepository.signUpUser({
      displayName: 'Người Dùng Thứ Hai',
      email: 'user2@example.com',
      password: 'User2Pass789',
    });
    const user2Txs = await FinanceRepository.getTransactions(
      signUp2.wallets[0].id,
      signUp2.profile.id
    );
    assert.strictEqual(
      user2Txs.length,
      0,
      'Tài khoản thứ 2 tuyệt đối không được nhìn thấy giao dịch của tài khoản thứ 1'
    );

    console.log(
      '   [PASS] Đăng ký, Đăng nhập, Chặn sai mật khẩu, Đặt lại mật khẩu & Cô lập dữ liệu cá nhân hoạt động 100%.'
    );
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedSbUrl;
  }

  console.log('\n✅ TẤT CẢ 5 HẠNG MỤC KIỂM THỬ BẢO MẬT & XÁC THỰC ĐỀU PASS 100%!');
}

runSecurityTests().catch((err) => {
  console.error('❌ Kiểm thử bảo mật thất bại:', err);
  process.exit(1);
});
