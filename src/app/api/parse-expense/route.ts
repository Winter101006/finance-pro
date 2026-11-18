import { NextResponse } from 'next/server';
import { parseExpenseWithGeminiOrFallback } from '@/lib/geminiParser';
import type { TransactionType } from '@/types/finance';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text : '';
    const forcedType: 'auto' | TransactionType =
      body?.forcedType === 'income' || body?.forcedType === 'expense'
        ? body.forcedType
        : 'auto';
    const result = await parseExpenseWithGeminiOrFallback(text, forcedType);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        items: [],
        spokenSummaryVi: 'Đã xảy ra lỗi khi phân tích câu nói, xin vui lòng thử lại.',
        engine: 'vietnamese-local-nlp',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 200 }
    );
  }
}
