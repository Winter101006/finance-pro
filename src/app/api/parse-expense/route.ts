import { NextResponse } from 'next/server';
import { parseExpenseWithGeminiOrFallback } from '@/lib/geminiParser';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text : '';
    const result = await parseExpenseWithGeminiOrFallback(text);
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
