import { CATEGORY_BY_SLUG } from '../data/categories';
import type { CategorySlug, ParsedExpenseItem, TransactionType } from '../types/finance';

const VIETNAMESE_WORD_NUMBERS: Record<string, number> = {
  một: 1,
  mot: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  bon: 4,
  tư: 4,
  tu: 4,
  năm: 5,
  nam: 5,
  lăm: 5,
  lam: 5,
  sáu: 6,
  sau: 6,
  bảy: 7,
  bay: 7,
  bẩy: 7,
  tám: 8,
  tam: 8,
  chín: 9,
  chin: 9,
  mười: 10,
  muoi: 10,
};

/**
 * Replaces spoken Vietnamese number words right before currency units with digits
 * e.g., "một trăm rưỡi" -> "1 trăm rưỡi", "hai lăm nghìn" -> "25 nghìn"
 */
export function normalizeVietnameseSpokenNumbers(input: string): string {
  let s = input.trim().normalize('NFC');

  // Compound spoken tens ("mười lăm", "hai mươi lăm", "hai lăm", "hai mươi")
  s = s.replace(/(^|\s)mười\s+(một|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín)(?=\s|$)/gi, (_, prefix, unit) => {
    const u = VIETNAMESE_WORD_NUMBERS[unit.toLowerCase()] || 0;
    return `${prefix}${10 + u}`;
  });
  s = s.replace(
    /(^|\s)(hai|ba|bốn|năm|sáu|bảy|tám|chín)\s+(?:mươi\s+)?(mốt|một|hai|ba|bốn|tư|lăm|sáu|bảy|bẩy|tám|chín)(?=\s|$)/gi,
    (full, prefix, tens, unit) => {
      const t = VIETNAMESE_WORD_NUMBERS[tens.toLowerCase()];
      const u = unit.toLowerCase() === 'mốt' ? 1 : VIETNAMESE_WORD_NUMBERS[unit.toLowerCase()];
      if (t !== undefined && u !== undefined && unit.toLowerCase() !== 'lít' && unit.toLowerCase() !== 'trăm') {
        return `${prefix}${t * 10 + u}`;
      }
      return full;
    }
  );
  s = s.replace(
    /(^|\s)(hai|ba|bốn|năm|sáu|bảy|tám|chín)\s+mươi(?=\s|$)/gi,
    (_, prefix, tens) => {
      const t = VIETNAMESE_WORD_NUMBERS[tens.toLowerCase()] || 2;
      return `${prefix}${t * 10}`;
    }
  );

  // Normalize "một trăm 50 nghìn" -> "1 trăm 50 nghìn"
  const unitPattern =
    '(?=\\s*(?:trăm|tram|nghìn|nghin|ngàn|ngan|triệu|trieu|củ|cu|lít|lit|xị|xi|chục|chuc|cành|canh|k(?:\\s|$|[.,])|đ(?:\\s|$)|đồng|dong))';
  const wordKeys = Object.keys(VIETNAMESE_WORD_NUMBERS).join('|');
  const regex = new RegExp(`(^|[\\s,.;:()\\/-])(${wordKeys})${unitPattern}`, 'gi');

  s = s.replace(regex, (full, prefix, word) => {
    const val = VIETNAMESE_WORD_NUMBERS[word.toLowerCase()];
    return val !== undefined ? `${prefix}${val}` : full;
  });

  // Also convert "trăm hai", "trăm 50" style remaining number word after trăm/triệu
  s = s.replace(
    /(trăm|tram|triệu|trieu|củ|cu|lít|lit)\s+(một|hai|ba|bốn|tư|năm|sáu|bảy|bẩy|tám|chín)(?=\s*(?:nghìn|ngàn|k|đồng|đ|$|[.,]))/gi,
    (full, unitWord, numWord) => {
      const val = VIETNAMESE_WORD_NUMBERS[numWord.toLowerCase()];
      return val !== undefined ? `${unitWord} ${val}` : full;
    }
  );

  return s;
}

export interface ExtractedAmountMatch {
  amount: number;
  rawMatch: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Extracts all Vietnamese colloquial and formal money expressions in order of appearance.
 * Uses Unicode-aware boundaries so accented Vietnamese words match reliably.
 */
export function extractVietnameseAmounts(rawText: string): ExtractedAmountMatch[] {
  const normalized = normalizeVietnameseSpokenNumbers(rawText);

  const B_START = '(?:^|(?<=[\\s,.;:!?()\\/-]))';
  const B_END = '(?=$|[\\s,.;:!?()\\/-])';
  const OPT_K = '(?:\\s*(?:nghìn|nghin|ngàn|ngan|k|đồng|dong|đ))?';

  const combinedRegex = new RegExp(
    [
      // 1. "nửa củ", "nửa triệu" -> 500,000
      `(?<nuaCu>${B_START}nửa\\s*(?:củ|triệu)${B_END})`,
      // 2. "nửa lít", "nửa trăm" -> 50,000
      `(?<nuaLit>${B_START}nửa\\s*(?:lít|trăm)${B_END})`,
      // 3. "2 củ rưỡi", "2 triệu rưỡi", "2tr rưỡi" -> X.5 * 1,000,000
      `(?<cuRuoi>${B_START}\\d+(?:[.,]\\d+)?\\s*(?:củ|triệu|tr)\\s*rưỡi${B_END})`,
      // 4. "2tr5", "2 củ 5", "2 triệu 500", "1 triệu 250 nghìn" -> X * 1,000,000 + Y
      `(?<cuLe>${B_START}\\d+\\s*(?:củ|triệu|tr)\\s*\\d{1,3}${OPT_K}${B_END})`,
      // 5. "2.5 triệu", "2,5 củ", "3 triệu", "1 củ", "1.5tr"
      `(?<cuPlain>${B_START}\\d+(?:[.,]\\d+)?\\s*(?:củ|triệu|tr|m)${B_END})`,
      // 6. "1 trăm rưỡi", "1 lít rưỡi", "1 xị rưỡi" -> X.5 * 100,000
      `(?<tramRuoi>${B_START}\\d+(?:[.,]\\d+)?\\s*(?:trăm(?:\\s*(?:nghìn|ngàn))?|lít|xị)\\s*rưỡi${OPT_K}${B_END})`,
      // 7. "1 trăm 2", "2 lít 5", "1 trăm 50 nghìn" -> X * 100,000 + Y
      `(?<tramLe>${B_START}\\d+\\s*(?:trăm|lít|xị)\\s*\\d{1,2}${OPT_K}${B_END})`,
      // 8. "3 lít", "2 trăm nghìn", "2 trăm" -> X * 100,000
      `(?<tramPlain>${B_START}\\d+(?:[.,]\\d+)?\\s*(?:trăm(?:\\s*(?:nghìn|ngàn|k))?|lít|xị)${B_END})`,
      // 9. "3 chục rưỡi" -> X.5 * 10,000
      `(?<chucRuoi>${B_START}\\d+\\s*chục\\s*rưỡi${OPT_K}${B_END})`,
      // 10. "5 chục" -> X * 10,000
      `(?<chucPlain>${B_START}\\d+(?:[.,]\\d+)?\\s*chục${OPT_K}${B_END})`,
      // 11. "45k5", "45k", "850 nghìn", "850 ngàn", "50 cành"
      `(?<nghinLe>${B_START}\\d+\\s*k\\s*\\d${B_END})`,
      `(?<nghinPlain>${B_START}\\d+(?:[.,]\\d+)?\\s*(?:k|nghìn|nghin|ngàn|ngan|cành|canh)(?:\\s*(?:đồng|đ))?${B_END})`,
      // 12. Explicit currency VND ("500 đ", "150.000đ", "1.250.000 đồng", "45000")
      `(?<vndCurrency>${B_START}(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{3,9})\\s*(?:đồng|dong|vnđ|vnd|đ)${B_END})`,
      `(?<vndFull>${B_START}(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{4,9})${B_END})`,
    ].join('|'),
    'gi'
  );

  const results: ExtractedAmountMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(normalized)) !== null) {
    const g = match.groups || {};
    const rawMatch = match[0];
    let amount = 0;

    const parseNum = (s: string) => parseFloat(s.replace(',', '.'));

    if (g.nuaCu) {
      amount = 500_000;
    } else if (g.nuaLit) {
      amount = 50_000;
    } else if (g.cuRuoi) {
      const m = g.cuRuoi.match(/(\d+(?:[.,]\d+)?)/);
      amount = m ? Math.round((parseNum(m[1]) + 0.5) * 1_000_000) : 1_500_000;
    } else if (g.cuLe) {
      const m = g.cuLe.match(/(\d+)\s*(?:củ|triệu|tr)\s*(\d{1,3})/i);
      if (m) {
        const major = parseInt(m[1], 10) * 1_000_000;
        const minorStr = m[2];
        const minor =
          minorStr.length === 1
            ? parseInt(minorStr, 10) * 100_000
            : minorStr.length === 2
              ? parseInt(minorStr, 10) * 10_000
              : parseInt(minorStr, 10) * 1_000;
        amount = major + minor;
      }
    } else if (g.cuPlain) {
      const m = g.cuPlain.match(/(\d+(?:[.,]\d+)?)/);
      amount = m ? Math.round(parseNum(m[1]) * 1_000_000) : 0;
    } else if (g.tramRuoi) {
      const m = g.tramRuoi.match(/(\d+(?:[.,]\d+)?)/);
      amount = m ? Math.round((parseNum(m[1]) + 0.5) * 100_000) : 150_000;
    } else if (g.tramLe) {
      const m = g.tramLe.match(/(\d+)\s*(?:trăm|lít|xị)\s*(\d{1,2})/i);
      if (m) {
        const major = parseInt(m[1], 10) * 100_000;
        const minorStr = m[2];
        const minor =
          minorStr.length === 1
            ? parseInt(minorStr, 10) * 10_000
            : parseInt(minorStr, 10) * 1_000;
        amount = major + minor;
      }
    } else if (g.tramPlain) {
      const m = g.tramPlain.match(/(\d+(?:[.,]\d+)?)/);
      amount = m ? Math.round(parseNum(m[1]) * 100_000) : 0;
    } else if (g.chucRuoi) {
      const m = g.chucRuoi.match(/(\d+)/);
      amount = m ? Math.round((parseInt(m[1], 10) + 0.5) * 10_000) : 15_000;
    } else if (g.chucPlain) {
      const m = g.chucPlain.match(/(\d+(?:[.,]\d+)?)/);
      amount = m ? Math.round(parseNum(m[1]) * 10_000) : 0;
    } else if (g.nghinLe) {
      const m = g.nghinLe.match(/(\d+)\s*k\s*(\d)/i);
      if (m) {
        amount = parseInt(m[1], 10) * 1_000 + parseInt(m[2], 10) * 100;
      }
    } else if (g.nghinPlain) {
      const m = g.nghinPlain.match(/(\d+(?:[.,]\d+)?)/);
      amount = m ? Math.round(parseNum(m[1]) * 1_000) : 0;
    } else if (g.vndCurrency) {
      const digitsOnly = g.vndCurrency.replace(/[^\d]/g, '');
      amount = parseInt(digitsOnly, 10) || 0;
    } else if (g.vndFull) {
      // Avoid misreading calendar years like "năm 2026" as 2,026 VND
      const beforeContext = normalized.slice(Math.max(0, match.index - 8), match.index).toLowerCase();
      if (/năm\s*$/.test(beforeContext)) {
        amount = 0;
      } else {
        const digitsOnly = g.vndFull.replace(/[^\d]/g, '');
        amount = parseInt(digitsOnly, 10) || 0;
      }
    }

    if (amount > 0 && amount <= 100_000_000_000) {
      results.push({
        amount,
        rawMatch,
        startIndex: match.index,
        endIndex: match.index + rawMatch.length,
      });
    }
  }

  return results;
}

function hasKeyword(text: string, keywords: string[]): boolean {
  const padded = ` ${text.toLowerCase().replace(/[.,;:!?()"/\\-]/g, ' ')} `;
  return keywords.some((kw) => padded.includes(` ${kw.toLowerCase()} `));
}

/**
 * Infers categorySlug and transaction type ('expense' | 'income') from Vietnamese description.
 */
export function classifyVietnameseCategory(text: string): {
  categorySlug: CategorySlug;
  type: TransactionType;
} {
  // 1. Income keywords (check explicit income phrases first)
  if (
    hasKeyword(text, [
      'lương',
      'luong',
      'thưởng',
      'thuong',
      'học bổng',
      'hoc bong',
      'trợ cấp',
      'tro cap',
      'thu nhập',
      'thu nhap',
      'nhận tiền',
      'nhan tien',
      'nhận được',
      'được cho',
      'bán hàng',
      'hoàn tiền',
      'cashback',
      'thù lao',
      'thu lao',
      'freelance',
      'lãi tiết kiệm',
      'cổ tức',
    ])
  ) {
    return { categorySlug: 'thu-nhap', type: 'income' };
  }

  // 2. Ready-to-eat dishes & drinks checked BEFORE raw market groceries (so "bánh mì trứng", "bún cá", "phở bò" map to Ăn uống)
  if (
    hasKeyword(text, [
      'ăn',
      'uống',
      'phở',
      'pho',
      'bún',
      'bun',
      'bún chả',
      'bún bò',
      'bún đậu',
      'bún cá',
      'miến',
      'hủ tiếu',
      'mì quảng',
      'xôi',
      'cháo',
      'cơm',
      'com',
      'cơm tấm',
      'bánh',
      'bánh mì',
      'bánh cuốn',
      'trà sữa',
      'trà chanh',
      'trà đá',
      'matcha',
      'cà phê',
      'ca phe',
      'coffee',
      'cafe',
      'bạc xỉu',
      'highlands',
      'phúc long',
      'nhậu',
      'lẩu',
      'nướng',
      'ăn sáng',
      'ăn trưa',
      'ăn tối',
      'ăn vặt',
      'căn tin',
      'cantin',
      'grabfood',
      'shopeefood',
      'gà rán',
      'pizza',
      'nước ngọt',
    ])
  ) {
    return { categorySlug: 'an-uong', type: 'expense' };
  }

  // 3. Đi chợ (Raw groceries / Market)
  if (
    hasKeyword(text, [
      'đi chợ',
      'di cho',
      'mua rau',
      'rau',
      'thịt',
      'thit',
      'thịt bò',
      'thịt lợn',
      'thịt heo',
      'cá',
      'trứng',
      'gạo',
      'hoa quả',
      'trái cây',
      'hành',
      'tỏi',
      'đậu',
      'tôm',
      'gà',
      'sườn',
      'nấu ăn',
      'siêu thị',
      'winmart',
      'coopmart',
      'bách hóa',
      'bách hóa xanh',
      'tiền chợ',
    ])
  ) {
    return { categorySlug: 'di-cho', type: 'expense' };
  }

  // 4. Di chuyển (Transport, fuel, ride-hailing, parking)
  if (
    hasKeyword(text, [
      'xăng',
      'xang',
      'đổ xăng',
      'do xang',
      'grab',
      'xanh sm',
      'be',
      'taxi',
      'xe ôm',
      'xe buýt',
      'bus',
      'gửi xe',
      'giữ xe',
      'vé xe',
      'tàu',
      'vé máy bay',
      'sửa xe',
      'rửa xe',
      'thay nhớt',
      'di chuyển',
      'cầu đường',
    ])
  ) {
    return { categorySlug: 'di-chuyen', type: 'expense' };
  }

  // 5. Hóa đơn điện nước (Bills, rent, utilities, phone, internet)
  if (
    hasKeyword(text, [
      'điện',
      'nước',
      'điện nước',
      'tiền điện',
      'tiền nước',
      'tiền nhà',
      'tiền phòng',
      'thuê nhà',
      'thuê phòng',
      'wifi',
      'internet',
      'tiền mạng',
      'đóng tiền mạng',
      'cáp',
      'nạp thẻ',
      'nạp điện thoại',
      'tiền điện thoại',
      'cước 4g',
      'đăng ký 4g',
      'sim',
      'hóa đơn',
      'rác',
      'phí dịch vụ',
    ])
  ) {
    return { categorySlug: 'hoa-don', type: 'expense' };
  }

  // 6. Học tập (Tuition, books, courses, stationery, AI tools)
  if (
    hasKeyword(text, [
      'học phí',
      'hoc phi',
      'sách',
      'sach',
      'mua sách',
      'vở',
      'bút',
      'in ấn',
      'in tài liệu',
      'photo',
      'khóa học',
      'học tập',
      'giáo trình',
      'tiếng anh',
      'ielts',
      'toeic',
      'chatgpt',
      'gemini',
      'server',
      'tên miền',
      'văn phòng phẩm',
    ])
  ) {
    return { categorySlug: 'hoc-tap', type: 'expense' };
  }

  // 7. Sức khỏe (Medicine, hospital, pharmacy, fitness)
  if (
    hasKeyword(text, [
      'thuốc',
      'thuoc',
      'mua thuốc',
      'khám',
      'khám bệnh',
      'bệnh viện',
      'nha khoa',
      'răng',
      'vitamin',
      'thực phẩm chức năng',
      'huyết áp',
      'bảo hiểm y tế',
      'sức khỏe',
      'gym',
      'tập gym',
      'thể thao',
      'cầu lông',
      'bơi',
    ])
  ) {
    return { categorySlug: 'suc-khoe', type: 'expense' };
  }

  // 8. Gia đình / Hiếu hỉ / Quà tặng
  if (
    hasKeyword(text, [
      'gia đình',
      'bố mẹ',
      'ông bà',
      'con cái',
      'mừng đám cưới',
      'đám cưới',
      'đám giỗ',
      'hiếu hỉ',
      'lì xì',
      'quà tết',
      'sinh nhật',
      'tặng quà',
      'sữa cho',
    ])
  ) {
    return { categorySlug: 'gia-dinh', type: 'expense' };
  }

  // 9. Mua sắm (Clothes, electronics, e-commerce, personal care)
  if (
    hasKeyword(text, [
      'mua sắm',
      'quần áo',
      'giày',
      'dép',
      'áo',
      'quần',
      'túi',
      'shopee',
      'lazada',
      'tiki',
      'tiktok shop',
      'mỹ phẩm',
      'sữa rửa mặt',
      'kem chống nắng',
      'dầu gội',
      'xà phòng',
      'nước giặt',
      'cắt tóc',
      'gội đầu',
      'đồ gia dụng',
      'tai nghe',
      'chuột',
      'bàn phím',
    ])
  ) {
    return { categorySlug: 'mua-sam', type: 'expense' };
  }

  return { categorySlug: 'khac', type: 'expense' };
}

export function formatVndNumber(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}

export function buildSpokenConfirmationVi(
  amount: number,
  description: string,
  categorySlug: CategorySlug,
  type: TransactionType
): string {
  const categoryName = CATEGORY_BY_SLUG[categorySlug]?.name || 'Khác';
  const cleanDesc = description.trim();
  const formattedAmt = formatVndNumber(amount);
  const actionVerb = type === 'income' ? 'Đã ghi khoản thu' : 'Đã ghi';
  return `${actionVerb} ${formattedAmt} đồng ${cleanDesc.toLowerCase()} vào mục ${categoryName}`;
}

function cleanClauseDescription(rawClause: string, matchedMoneyText: string): string {
  let desc = rawClause.replace(matchedMoneyText, ' ');
  desc = desc
    .replace(
      /^(?:sáng|trưa|chiều|tối|đêm|hôm nay|hôm qua|vừa|mới|rồi|với|và|cùng|thêm|lại|còn|tiếp|nữa|tôi|mình|em|con|\s|,|\.|;|-)+/gi,
      ''
    )
    .replace(/(?:\s+hết|\s+mất|\s+tất cả|\s+giá|\s+khoảng|\s+tầm)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!desc) {
    return 'Chi tiêu phát sinh';
  }
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

/**
 * Main local Vietnamese NLP parser (< 1ms execution) that supports single & multi-transaction utterances.
 */
export function parseVietnameseExpenseText(rawText: string, nowIso?: string): ParsedExpenseItem[] {
  const timestamp = nowIso || new Date().toISOString();
  const normalized = normalizeVietnameseSpokenNumbers(rawText);
  const matches = extractVietnameseAmounts(normalized);

  if (matches.length === 0) {
    return [];
  }

  const items: ParsedExpenseItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const prevEnd = i === 0 ? 0 : matches[i - 1].endIndex;
    const nextStart = i + 1 < matches.length ? matches[i + 1].startIndex : normalized.length;

    let segment = normalized.slice(prevEnd, current.endIndex);

    const beforeOnly = normalized
      .slice(prevEnd, current.startIndex)
      .replace(/^[\s,.;+\-&]+|(?:với|và|rồi|cộng|thêm)\s*$/gi, '')
      .trim();

    if (!beforeOnly && i === matches.length - 1) {
      segment = normalized.slice(prevEnd, nextStart);
    }

    const description = cleanClauseDescription(segment, current.rawMatch);
    const { categorySlug, type } = classifyVietnameseCategory(description + ' ' + segment);
    const spokenConfirmationVi = buildSpokenConfirmationVi(
      current.amount,
      description,
      categorySlug,
      type
    );

    items.push({
      amount: current.amount,
      type,
      categorySlug,
      description,
      transactionDate: timestamp,
      spokenConfirmationVi,
    });
  }

  return items;
}

export function buildSpokenSummaryVi(items: ParsedExpenseItem[]): string {
  if (items.length === 0) {
    return 'Hệ thống chưa nghe rõ số tiền. Bạn hãy nói kèm số tiền (ví dụ: ăn sáng 45 nghìn).';
  }
  if (items.length === 1) {
    return items[0].spokenConfirmationVi + '.';
  }
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const details = items
    .map(
      (item) =>
        `${formatVndNumber(item.amount)} đồng ${item.description.toLowerCase()} (${CATEGORY_BY_SLUG[item.categorySlug]?.name || 'Khác'})`
    )
    .join(', và ');
  return `Đã ghi ${items.length} khoản gồm: ${details}. Tổng cộng ${formatVndNumber(total)} đồng.`;
}
