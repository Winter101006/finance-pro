import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 24/7 Anti-Hibernation Health Endpoint
 * Invoked every 3 days by Vercel Cron ("0 3 *\/3 * *") to prevent Supabase Free Tier pausing.
 */
export async function GET() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabasePublicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();

  if (!supabaseUrl || !supabasePublicKey) {
    return NextResponse.json({
      ok: true,
      mode: 'local-first',
      supabaseConfigured: false,
      message: 'Finance Pro đang hoạt động ở chế độ Local-First (chưa gắn Supabase URL).',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabasePublicKey);
    const start = Date.now();
    const { data, error } = await supabase.from('categories').select('slug').limit(1);
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      ok: !error,
      mode: 'supabase-cloud',
      supabaseConfigured: true,
      latencyMs,
      sampleCategory: data?.[0]?.slug || null,
      error: error?.message || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      mode: 'supabase-cloud',
      supabaseConfigured: true,
      error: err instanceof Error ? err.message : 'Ping failed',
      timestamp: new Date().toISOString(),
    });
  }
}
