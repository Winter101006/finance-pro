import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parseExpenseWithGeminiOrFallback } from '../src/lib/geminiParser';
import { parseVietnameseExpenseText } from '../src/lib/vietnameseParser';

// Load .env.local manually for standalone script execution
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) {
      process.env[m[1]] = m[2];
    }
  }
}

async function runTests() {
  console.log('=== 1. KIỂM THỬ BỘ PHÂN TÍCH TIẾNG VIỆT (UNIT TESTS) ===');

  const singleCases: Array<{
    input: string;
    expectedAmount: number;
    expectedSlug: string;
    expectedType: 'expense' | 'income';
  }> = [
    { input: 'ăn phở 45k', expectedAmount: 45_000, expectedSlug: 'an-uong', expectedType: 'expense' },
    { input: 'đóng tiền điện nước 850 nghìn', expectedAmount: 850_000, expectedSlug: 'hoa-don', expectedType: 'expense' },
    { input: 'đóng tiền mạng 220 ngàn', expectedAmount: 220_000, expectedSlug: 'hoa-don', expectedType: 'expense' },
    { input: 'mua thịt bò 1 trăm rưỡi', expectedAmount: 150_000, expectedSlug: 'di-cho', expectedType: 'expense' },
    { input: 'mừng đám cưới nửa củ', expectedAmount: 500_000, expectedSlug: 'gia-dinh', expectedType: 'expense' },
    { input: 'mua thuốc huyết áp 3 lít', expectedAmount: 300_000, expectedSlug: 'suc-khoe', expectedType: 'expense' },
    { input: 'nhận học bổng 2 củ rưỡi', expectedAmount: 2_500_000, expectedSlug: 'thu-nhap', expectedType: 'income' },
    { input: 'lương trợ giảng 2tr5', expectedAmount: 2_500_000, expectedSlug: 'thu-nhap', expectedType: 'income' },
    { input: 'đổ xăng 5 chục', expectedAmount: 50_000, expectedSlug: 'di-chuyen', expectedType: 'expense' },
    { input: 'mua sách học máy 1 trăm 2', expectedAmount: 120_000, expectedSlug: 'hoc-tap', expectedType: 'expense' },
  ];

  for (const tc of singleCases) {
    const res = parseVietnameseExpenseText(tc.input);
    assert.strictEqual(res.length, 1, `Expected 1 item for "${tc.input}", got ${res.length}`);
    assert.strictEqual(
      res[0].amount,
      tc.expectedAmount,
      `Amount mismatch for "${tc.input}": got ${res[0].amount}, expected ${tc.expectedAmount}`
    );
    assert.strictEqual(
      res[0].categorySlug,
      tc.expectedSlug,
      `Category mismatch for "${tc.input}": got ${res[0].categorySlug}, expected ${tc.expectedSlug}`
    );
    assert.strictEqual(
      res[0].type,
      tc.expectedType,
      `Type mismatch for "${tc.input}": got ${res[0].type}, expected ${tc.expectedType}`
    );
    console.log(`  [PASS] "${tc.input}" -> ${res[0].amount.toLocaleString('vi-VN')} đ (${res[0].categorySlug}) | "${res[0].spokenConfirmationVi}"`);
  }

  // Test compound multi-expense sentence
  const multiInput = 'sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi';
  const multiRes = parseVietnameseExpenseText(multiInput);
  assert.strictEqual(multiRes.length, 2, `Expected 2 items for "${multiInput}"`);
  assert.strictEqual(multiRes[0].amount, 35_000);
  assert.strictEqual(multiRes[1].amount, 150_000);
  assert.strictEqual(multiRes[0].categorySlug, 'di-cho');
  assert.strictEqual(multiRes[1].categorySlug, 'di-cho');
  console.log(`  [PASS] Multi-item: "${multiInput}" -> Tách chuẩn ${multiRes.length} giao dịch (35.000đ + 150.000đ)`);

  console.log('\n=== 2. KIỂM TRA KẾT NỐI THỰC TẾ VỚI GEMINI API KEY (.env.local) ===');
  const liveRes = await parseExpenseWithGeminiOrFallback(
    'sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi'
  );
  console.log('  Engine sử dụng:', liveRes.engine, '| Model:', liveRes.modelUsed);
  console.log('  Câu đọc xác nhận (TTS):', liveRes.spokenSummaryVi);
  console.log('  Số giao dịch trả về:', liveRes.items.length);
  for (const item of liveRes.items) {
    console.log(`   - ${item.description}: ${item.amount.toLocaleString('vi-VN')} VNĐ [${item.categorySlug}] -> "${item.spokenConfirmationVi}"`);
  }
  assert.strictEqual(liveRes.items.length, 2);
  assert.strictEqual(liveRes.items[0].amount, 35_000);
  assert.strictEqual(liveRes.items[1].amount, 150_000);
  console.log('\n✅ TẤT CẢ UNIT TESTS & GEMINI LIVE PIPELINE ĐỀU PASS 100%!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
