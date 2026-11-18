import { GoogleGenAI, Type } from '@google/genai';
import { CATEGORY_BY_SLUG } from '../data/categories';
import type {
  CategorySlug,
  ParsedExpenseItem,
  ParseExpenseResponse,
  TransactionType,
} from '../types/finance';
import {
  buildSpokenConfirmationVi,
  buildSpokenSummaryVi,
  classifyVietnameseCategory,
  parseVietnameseExpenseText,
} from './vietnameseParser';

const VALID_CATEGORY_SLUGS: CategorySlug[] = [
  'an-uong',
  'di-cho',
  'di-chuyen',
  'hoa-don',
  'hoc-tap',
  'mua-sam',
  'suc-khoe',
  'gia-dinh',
  'thu-nhap',
  'khac',
];

const EXPENSE_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  description: 'Danh sách các khoản thu/chi tách ra từ câu nói tiếng Việt.',
  items: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.INTEGER,
        description:
          'Số tiền tính bằng VNĐ nguyên (ví dụ: 45k -> 45000, 1 trăm rưỡi -> 150000, nửa củ -> 500000, 3 lít -> 300000, 2 củ rưỡi -> 2500000).',
      },
      type: {
        type: Type.STRING,
        description: 'Loại giao dịch: "expense" (chi tiêu) hoặc "income" (thu nhập).',
      },
      categorySlug: {
        type: Type.STRING,
        description:
          'Mã danh mục: "an-uong", "di-cho", "di-chuyen", "hoa-don", "hoc-tap", "mua-sam", "suc-khoe", "gia-dinh", "thu-nhap", hoặc "khac".',
      },
      description: {
        type: Type.STRING,
        description: 'Mô tả ngắn gọn, lịch sự bằng tiếng Việt (ví dụ: "Mua thịt bò", "Ăn phở sáng").',
      },
      spokenConfirmationVi: {
        type: Type.STRING,
        description:
          'Câu xác nhận tiếng Việt ngắn gọn rõ ràng (ví dụ: "Đã ghi 150.000 đồng mua thịt bò vào mục Đi chợ").',
      },
    },
    required: ['amount', 'type', 'categorySlug', 'description', 'spokenConfirmationVi'],
    propertyOrdering: [
      'amount',
      'type',
      'categorySlug',
      'description',
      'spokenConfirmationVi',
    ],
  },
};

const SYSTEM_PROMPT = `Bạn là trợ lý tài chính cá nhân thông minh tại Việt Nam.
Nhiệm vụ: Bóc tách câu nói tiếng Việt đời thường thành danh sách các khoản thu/chi chuẩn xác.
Quy tắc quy đổi tiền tiếng Việt bắt buộc:
- "k", "nghìn", "ngàn", "cành" = nhân 1.000 (VD: "45k" = 45000, "850 nghìn" = 850000).
- "chục" = nhân 10.000 (VD: "5 chục" = 50000).
- "trăm", "lít", "xị" = nhân 100.000 (VD: "3 lít" = 300000, "1 trăm rưỡi" = 150000).
- "củ", "triệu", "tr" = nhân 1.000.000 (VD: "nửa củ" = 500000, "2 củ rưỡi" = 2500000, "2tr5" = 2500000).
- Phân biệt chuẩn TIỀN CỘNG ("income", mã "thu-nhap") vs TIỀN TRỪ ("expense"):
  + Tiền nhận được từ người khác ("mẹ cho 75k", "bố gửi 2 triệu", "bạn trả 100k", "lương", "thưởng", "học bổng", "hoàn tiền", "cộng 75k") => type = "income", categorySlug = "thu-nhap".
  + Tiền mình chi ra ("mua thuốc cho mẹ 3 lít", "biếu mẹ 500k", "ăn phở 45k", "đổ xăng 50k") => type = "expense".
- Nếu người dùng nói nhiều khoản trong 1 câu (VD: "sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi"), phải tách thành 2 phần tử riêng biệt trong mảng JSON.
- Chọn đúng categorySlug trong 10 mã: "an-uong", "di-cho", "di-chuyen", "hoa-don", "hoc-tap", "mua-sam", "suc-khoe", "gia-dinh", "thu-nhap", "khac".`;

const PARSE_CACHE = new Map<string, ParseExpenseResponse>();
const MAX_CACHE_ENTRIES = 120;

// Short circuit-breaker timestamp if upstream Gemini times out or is rate-limited
let aiCooldownUntil = 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gemini timeout')), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function sanitizeAiItems(
  rawItems: unknown,
  fallbackText: string,
  nowIso: string,
  forcedType: 'auto' | TransactionType = 'auto'
): ParsedExpenseItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  const localItems = parseVietnameseExpenseText(fallbackText, nowIso, forcedType);

  const valid: ParsedExpenseItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i] as Record<string, unknown>;
    let amount = Number(row?.amount) || 0;
    if (amount > 0 && amount < 1000) {
      amount = localItems[i]?.amount || amount * 1000;
    }
    if (amount <= 0 && localItems[i]) {
      amount = localItems[i].amount;
    }
    if (amount <= 0) continue;

    const description =
      typeof row?.description === 'string' && row.description.trim()
        ? row.description.trim().slice(0, 180)
        : localItems[i]?.description || 'Chi tiêu phát sinh';

    const inferred = classifyVietnameseCategory(`${description} ${fallbackText}`);
    const rawSlug = String(row?.categorySlug || '').trim() as CategorySlug;
    let categorySlug: CategorySlug = VALID_CATEGORY_SLUGS.includes(rawSlug)
      ? rawSlug
      : inferred.categorySlug;

    // Preserve clear Vietnamese income semantics ("mẹ cho 75k", "cộng 75k", ...)
    let type: TransactionType =
      row?.type === 'income' || categorySlug === 'thu-nhap' || inferred.type === 'income'
        ? 'income'
        : 'expense';

    if (type === 'income') {
      categorySlug = 'thu-nhap';
    }

    if (forcedType === 'income') {
      type = 'income';
      categorySlug = 'thu-nhap';
    } else if (forcedType === 'expense') {
      type = 'expense';
      if (categorySlug === 'thu-nhap') {
        categorySlug = 'khac';
      }
    }

    const spokenConfirmationVi =
      forcedType === 'auto' &&
      typeof row?.spokenConfirmationVi === 'string' &&
      row.spokenConfirmationVi.trim().length > 10 &&
      !(inferred.type === 'income' && row?.type !== 'income')
        ? row.spokenConfirmationVi.trim()
        : buildSpokenConfirmationVi(amount, description, categorySlug, type);

    valid.push({
      amount: Math.round(amount),
      type,
      categorySlug,
      description,
      transactionDate: nowIso,
      spokenConfirmationVi,
    });
  }

  return valid;
}

/**
 * Low-latency Smart Dual-Mode Gemini + Vietnamese NLP Expense Parser.
 * - Supports forcedType ('auto' | 'expense' | 'income')
 * - Uses memory LRU cache for < 1ms repeated utterances
 * - Hard 2,500ms wall-clock budget with circuit breaker so mobile users NEVER experience 10s+ stalls
 */
export async function parseExpenseWithGeminiOrFallback(
  rawInput: string,
  forcedType: 'auto' | TransactionType = 'auto'
): Promise<ParseExpenseResponse> {
  const cleaned = rawInput.trim();
  const nowIso = new Date().toISOString();

  if (!cleaned) {
    return {
      items: [],
      spokenSummaryVi: 'Xin vui lòng nói hoặc nhập nội dung thu chi.',
      engine: 'vietnamese-local-nlp',
    };
  }

  const cacheKey = `${forcedType}::${cleaned.toLowerCase()}`;
  const cached = PARSE_CACHE.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      items: cached.items.map((item) => ({ ...item, transactionDate: nowIso })),
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const nowMs = Date.now();

  if (apiKey && nowMs >= aiCooldownUntil) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const forcedInstruction =
        forcedType === 'income'
          ? '\n(LƯU Ý: Người dùng đã chọn sẵn đây là KHOẢN THU / TIỀN CỘNG, bắt buộc set type="income", categorySlug="thu-nhap".)'
          : forcedType === 'expense'
          ? '\n(LƯU Ý: Người dùng đã chọn sẵn đây là KHOẢN CHI / TIỀN TRỪ, bắt buộc set type="expense".)'
          : '';
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: `${SYSTEM_PROMPT}${forcedInstruction}\n\nCâu nói của người dùng: "${cleaned}"`,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: EXPENSE_ARRAY_SCHEMA,
            temperature: 0.1,
          },
        }),
        2500
      );

      const text = response.text || '';
      const parsedJson = JSON.parse(text);
      const items = sanitizeAiItems(parsedJson, cleaned, nowIso, forcedType);
      if (items.length > 0) {
        const res: ParseExpenseResponse = {
          items,
          spokenSummaryVi: buildSpokenSummaryVi(items),
          engine: 'gemini-developer-api',
          modelUsed: 'gemini-3.5-flash-lite',
        };
        if (PARSE_CACHE.size >= MAX_CACHE_ENTRIES) {
          const firstKey = PARSE_CACHE.keys().next().value;
          if (firstKey) PARSE_CACHE.delete(firstKey);
        }
        PARSE_CACHE.set(cacheKey, res);
        return res;
      }
    } catch {
      aiCooldownUntil = Date.now() + 30_000;
    }
  }

  // Deterministic Local Vietnamese NLP Fallback (< 1ms latency)
  const fallbackItems = parseVietnameseExpenseText(cleaned, nowIso, forcedType);

  const normalizedFallback = fallbackItems.map((item) => ({
    ...item,
    categorySlug: (item.categorySlug in CATEGORY_BY_SLUG
      ? item.categorySlug
      : 'khac') as CategorySlug,
  }));

  const fallbackRes: ParseExpenseResponse = {
    items: normalizedFallback,
    spokenSummaryVi: buildSpokenSummaryVi(normalizedFallback),
    engine: 'vietnamese-local-nlp',
    modelUsed: 'vietnamese-regex-nlp-v3',
  };

  if (normalizedFallback.length > 0) {
    if (PARSE_CACHE.size >= MAX_CACHE_ENTRIES) {
      const firstKey = PARSE_CACHE.keys().next().value;
      if (firstKey) PARSE_CACHE.delete(firstKey);
    }
    PARSE_CACHE.set(cacheKey, fallbackRes);
  }

  return fallbackRes;
}
