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
        description: 'Số tiền tính bằng VNĐ nguyên (ví dụ: 45k -> 45000, 1 trăm rưỡi -> 150000, nửa củ -> 500000, 3 lít -> 300000, 2 củ rưỡi -> 2500000).',
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
          'Câu xác nhận tiếng Việt lễ phép để đọc cho người lớn tuổi nghe (ví dụ: "Đã ghi 150.000 đồng mua thịt bò vào mục Đi chợ").',
      },
    },
    required: ['amount', 'type', 'categorySlug', 'description', 'spokenConfirmationVi'],
    propertyOrdering: ['amount', 'type', 'categorySlug', 'description', 'spokenConfirmationVi'],
  },
};

const SYSTEM_PROMPT = `Bạn là trợ lý kế toán gia đình thông minh tại Việt Nam.
Nhiệm vụ: Bóc tách câu nói tiếng Việt đời thường thành danh sách các khoản thu/chi chuẩn xác.
Quy tắc quy đổi tiền tiếng Việt bắt buộc:
- "k", "nghìn", "ngàn", "cành" = nhân 1.000 (VD: "45k" = 45000, "850 nghìn" = 850000).
- "chục" = nhân 10.000 (VD: "5 chục" = 50000).
- "trăm", "lít", "xị" = nhân 100.000 (VD: "3 lít" = 300000, "1 trăm rưỡi" = 150000).
- "củ", "triệu", "tr" = nhân 1.000.000 (VD: "nửa củ" = 500000, "2 củ rưỡi" = 2500000, "2tr5" = 2500000).
- Nếu người dùng nói nhiều khoản trong 1 câu (VD: "sáng mua rau 35 nghìn với mua thịt bò 1 trăm rưỡi"), phải tách thành 2 phần tử riêng biệt trong mảng JSON.
- Chọn đúng categorySlug trong 10 mã: "an-uong", "di-cho", "di-chuyen", "hoa-don", "hoc-tap", "mua-sam", "suc-khoe", "gia-dinh", "thu-nhap", "khac".`;

interface WorkingClientCache {
  mode: 'vertex-express' | 'developer-interactions' | 'developer-models';
  model: string;
}

let cachedStrategy: WorkingClientCache | null = null;

function sanitizeAiItems(rawItems: unknown, fallbackText: string, nowIso: string): ParsedExpenseItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  // Also run local parser to cross-check slang multipliers if needed
  const localItems = parseVietnameseExpenseText(fallbackText, nowIso);

  const valid: ParsedExpenseItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const row = rawItems[i] as Record<string, unknown>;
    let amount = Number(row?.amount) || 0;
    // If AI returned unscaled small number (e.g. 150 instead of 150000), fix from local parser or scale by 1000
    if (amount > 0 && amount < 1000) {
      amount = localItems[i]?.amount || amount * 1000;
    }
    if (amount <= 0 && localItems[i]) {
      amount = localItems[i].amount;
    }
    if (amount <= 0) continue;

    const description =
      typeof row?.description === 'string' && row.description.trim()
        ? row.description.trim()
        : localItems[i]?.description || 'Chi tiêu phát sinh';

    const inferred = classifyVietnameseCategory(description);
    const rawSlug = String(row?.categorySlug || '').trim() as CategorySlug;
    const categorySlug: CategorySlug = VALID_CATEGORY_SLUGS.includes(rawSlug)
      ? rawSlug
      : inferred.categorySlug;

    const type: TransactionType =
      row?.type === 'income' || categorySlug === 'thu-nhap' ? 'income' : 'expense';

    const spokenConfirmationVi =
      typeof row?.spokenConfirmationVi === 'string' && row.spokenConfirmationVi.trim().length > 10
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
 * Smart Dual-Mode Gemini + Vietnamese NLP Expense Parser.
 * Automatically handles "AQ." Vertex AI Express keys, standard Gemini Developer keys,
 * and falls back seamlessly to the deterministic Vietnamese NLP parser.
 */
export async function parseExpenseWithGeminiOrFallback(
  rawInput: string
): Promise<ParseExpenseResponse> {
  const cleaned = rawInput.trim();
  const nowIso = new Date().toISOString();

  if (!cleaned) {
    return {
      items: [],
      spokenSummaryVi: 'Xin vui lòng nói hoặc nhập nội dung chi tiêu.',
      engine: 'vietnamese-local-nlp',
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (apiKey) {
    const isVertexExpressKey = apiKey.startsWith('AQ.');

    // Candidate strategies ordered by verified live response speed & reliability:
    // 1. Developer API with gemini-3.5-flash-lite & gemini-3.8-flash (works immediately with AQ. key on generativelanguage.googleapis.com)
    // 2. Vertex AI Express mode (vertexai: true) if Vertex AI API is enabled on the Google Cloud project
    const candidates: WorkingClientCache[] = cachedStrategy
      ? [cachedStrategy]
      : [
          { mode: 'developer-models', model: 'gemini-3.5-flash-lite' },
          { mode: 'developer-models', model: 'gemini-3.8-flash' },
          { mode: 'developer-interactions', model: 'gemini-3.5-flash-lite' },
          ...(isVertexExpressKey
            ? [
                { mode: 'vertex-express' as const, model: 'gemini-3.5-flash-lite' },
                { mode: 'vertex-express' as const, model: 'gemini-2.5-flash' },
              ]
            : []),
        ];

    for (const candidate of candidates) {
      try {
        if (candidate.mode === 'developer-interactions') {
          const ai = new GoogleGenAI({ apiKey });
          const interaction = await ai.interactions.create({
            model: candidate.model,
            system_instruction: SYSTEM_PROMPT,
            input: `Bóc tách câu chi tiêu sau thành JSON mảng: "${cleaned}"`,
            response_format: {
              type: 'text',
              mime_type: 'application/json',
            } as unknown as Record<string, unknown>,
          });
          const text = interaction.output_text || '';
          const parsedJson = JSON.parse(text);
          const items = sanitizeAiItems(
            Array.isArray(parsedJson) ? parsedJson : parsedJson?.items,
            cleaned,
            nowIso
          );
          if (items.length > 0) {
            cachedStrategy = candidate;
            return {
              items,
              spokenSummaryVi: buildSpokenSummaryVi(items),
              engine: 'gemini-developer-api',
              modelUsed: candidate.model,
            };
          }
        } else {
          const ai =
            candidate.mode === 'vertex-express'
              ? new GoogleGenAI({ vertexai: true, apiKey })
              : new GoogleGenAI({ apiKey });

          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: `${SYSTEM_PROMPT}\n\nCâu nói của người dùng: "${cleaned}"`,
            config: {
              responseMimeType: 'application/json',
              responseJsonSchema: EXPENSE_ARRAY_SCHEMA,
              temperature: 0.1,
            },
          });

          const text = response.text || '';
          const parsedJson = JSON.parse(text);
          const items = sanitizeAiItems(parsedJson, cleaned, nowIso);
          if (items.length > 0) {
            cachedStrategy = candidate;
            return {
              items,
              spokenSummaryVi: buildSpokenSummaryVi(items),
              engine:
                candidate.mode === 'vertex-express'
                  ? 'gemini-vertex-express'
                  : 'gemini-developer-api',
              modelUsed: candidate.model,
            };
          }
        }
      } catch {
        // Try next candidate strategy or fallback to local Vietnamese NLP parser
      }
    }
  }

  // Deterministic Local Vietnamese NLP Fallback (< 1ms latency, 100% offline-resilient)
  const fallbackItems = parseVietnameseExpenseText(cleaned, nowIso);

  // Ensure every categorySlug maps to a valid category
  const normalizedFallback = fallbackItems.map((item) => ({
    ...item,
    categorySlug: (item.categorySlug in CATEGORY_BY_SLUG
      ? item.categorySlug
      : 'khac') as CategorySlug,
  }));

  return {
    items: normalizedFallback,
    spokenSummaryVi: buildSpokenSummaryVi(normalizedFallback),
    engine: 'vietnamese-local-nlp',
    modelUsed: 'vietnamese-regex-nlp-v2',
  };
}
