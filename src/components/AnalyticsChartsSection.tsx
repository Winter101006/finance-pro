'use client';

import { LineChart, PieChart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_BY_SLUG } from '@/data/categories';
import { formatVndNumber } from '@/lib/vietnameseParser';
import type {
  CategorySlug,
  FinanceTransaction,
  TransactionType,
} from '@/types/finance';

interface AnalyticsChartsSectionProps {
  transactions: FinanceTransaction[];
  selectedCategory: 'all' | CategorySlug;
  onSelectCategory: (slug: 'all' | CategorySlug) => void;
}

interface DonutSlice {
  key: string;
  label: string;
  amount: number;
  pct: number;
  color: string;
  slug?: CategorySlug;
}

interface TimeBucket {
  key: string;
  label: string;
  fullLabel: string;
  income: number;
  expense: number;
  net: number;
  cumulativeBalance: number;
}

// Vibrant chart colors inspired by the reference analytics UI
const EXPENSE_CHART_COLORS: Record<string, string> = {
  'an-uong': '#FB5678', // Coral Rose
  'di-cho': '#3CC4B6', // Mint Teal
  'hoa-don': '#FFCA4B', // Warm Amber
  'di-chuyen': '#2F9CEB', // Vibrant Sky Blue
  'hoc-tap': '#8B5CF6', // Indigo Violet
  'mua-sam': '#EC4899', // Pink
  'suc-khoe': '#EF4444', // Red
  'gia-dinh': '#14B8A6', // Teal
  'khac': '#85929E', // Cool Slate
};

const INCOME_SUBCATEGORY_RULES: Array<{
  key: string;
  label: string;
  color: string;
  keywords: RegExp;
}> = [
  {
    key: 'luong',
    label: 'Lương & Thù lao',
    color: '#10B981',
    keywords: /(lương|trợ giảng|thù lao|làm thêm|part-time|ca làm)/i,
  },
  {
    key: 'hoc-bong',
    label: 'Học bổng & Thưởng',
    color: '#2F9CEB',
    keywords: /(học bổng|thưởng|bonus|giải thưởng|dự án)/i,
  },
  {
    key: 'ho-tro',
    label: 'Trợ cấp & Gia đình',
    color: '#FFCA4B',
    keywords: /(trợ cấp|bố mẹ|gia đình|mừng|lì xì)/i,
  },
  {
    key: 'dau-tu',
    label: 'Đầu tư & Lãi',
    color: '#8B5CF6',
    keywords: /(lãi|cổ tức|đầu tư|tiết kiệm|hoàn tiền|cashback)/i,
  },
];

function formatCompactVndAxis(value: number): string {
  if (value === 0) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? String(millions)
      : millions.toFixed(1).replace('.', ',');
    return `${sign}${formatted} tr`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}k`;
  }
  return `${sign}${abs}`;
}

/**
 * Generates an SVG arc path for a donut slice
 */
function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  // Handle full 360-degree single slice
  const clampedEnd =
    endAngleDeg - startAngleDeg >= 359.99 ? startAngleDeg + 359.95 : endAngleDeg;

  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const startOuter = {
    x: cx + outerR * Math.cos(toRad(clampedEnd)),
    y: cy + outerR * Math.sin(toRad(clampedEnd)),
  };
  const endOuter = {
    x: cx + outerR * Math.cos(toRad(startAngleDeg)),
    y: cy + outerR * Math.sin(toRad(startAngleDeg)),
  };
  const startInner = {
    x: cx + innerR * Math.cos(toRad(clampedEnd)),
    y: cy + innerR * Math.sin(toRad(clampedEnd)),
  };
  const endInner = {
    x: cx + innerR * Math.cos(toRad(startAngleDeg)),
    y: cy + innerR * Math.sin(toRad(startAngleDeg)),
  };

  const largeArcFlag = clampedEnd - startAngleDeg <= 180 ? '0' : '1';

  return [
    'M',
    startOuter.x.toFixed(2),
    startOuter.y.toFixed(2),
    'A',
    outerR,
    outerR,
    0,
    largeArcFlag,
    0,
    endOuter.x.toFixed(2),
    endOuter.y.toFixed(2),
    'L',
    endInner.x.toFixed(2),
    endInner.y.toFixed(2),
    'A',
    innerR,
    innerR,
    0,
    largeArcFlag,
    1,
    startInner.x.toFixed(2),
    startInner.y.toFixed(2),
    'Z',
  ].join(' ');
}

/**
 * Generates a smooth monotone/catmull-rom style cubic bezier SVG path through points
 */
function buildSmoothCurvePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(
      2
    )}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function AnalyticsChartsSection({
  transactions,
  selectedCategory,
  onSelectCategory,
}: AnalyticsChartsSectionProps) {
  const [donutMode, setDonutMode] = useState<TransactionType>('expense');
  const [timelineMode, setTimelineMode] = useState<'12months' | 'daily'>('12months');
  const [hoveredSliceKey, setHoveredSliceKey] = useState<string | null>(null);
  const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // 1. Compute Donut Slices (Expense Categories vs Income Sources)
  // ---------------------------------------------------------------------------
  const donutData = useMemo(() => {
    const matching = transactions.filter((t) => t.type === donutMode);
    const total = matching.reduce((sum, t) => sum + t.amount, 0);

    if (total === 0) {
      return { total: 0, slices: [] as DonutSlice[] };
    }

    if (donutMode === 'expense') {
      const bySlug: Record<string, number> = {};
      for (const tx of matching) {
        bySlug[tx.categorySlug] = (bySlug[tx.categorySlug] || 0) + tx.amount;
      }

      const slices: DonutSlice[] = Object.entries(bySlug)
        .map(([slug, amount]) => {
          const cat = CATEGORY_BY_SLUG[slug as CategorySlug] || CATEGORY_BY_SLUG['khac'];
          return {
            key: slug,
            label: slug === 'khac' ? 'Khác (Chi)' : cat.name,
            amount,
            pct: Math.round((amount / total) * 1000) / 10,
            color: EXPENSE_CHART_COLORS[slug] || cat.color,
            slug: slug as CategorySlug,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      return { total, slices };
    } else {
      // Group income into meaningful sub-buckets so the Thu donut chart is also multi-colored
      const groups: Record<
        string,
        { label: string; color: string; amount: number }
      > = {};

      for (const tx of matching) {
        const matchedRule = INCOME_SUBCATEGORY_RULES.find((r) =>
          r.keywords.test(`${tx.description} ${tx.rawInput || ''}`)
        );
        const key = matchedRule ? matchedRule.key : 'thu-khac';
        const label = matchedRule ? matchedRule.label : 'Khoản thu khác';
        const color = matchedRule ? matchedRule.color : '#3CC4B6';

        if (!groups[key]) {
          groups[key] = { label, color, amount: 0 };
        }
        groups[key].amount += tx.amount;
      }

      const slices: DonutSlice[] = Object.entries(groups)
        .map(([key, g]) => ({
          key,
          label: g.label,
          amount: g.amount,
          pct: Math.round((g.amount / total) * 1000) / 10,
          color: g.color,
          slug: 'thu-nhap' as CategorySlug,
        }))
        .sort((a, b) => b.amount - a.amount);

      return { total, slices };
    }
  }, [transactions, donutMode]);

  // ---------------------------------------------------------------------------
  // 2. Compute Cashflow Timeline Buckets (12 Months vs 14 Days)
  // ---------------------------------------------------------------------------
  const timelineBuckets = useMemo(() => {
    const now = new Date();
    const buckets: TimeBucket[] = [];

    if (timelineMode === '12months') {
      // Build last 12 months ending at current month
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();

      for (let i = 11; i >= 0; i--) {
        const d = new Date(curYear, curMonth - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = `${String(m + 1).padStart(2, '0')}/${y}`;
        buckets.push({
          key,
          label,
          fullLabel: `Tháng ${label}`,
          income: 0,
          expense: 0,
          net: 0,
          cumulativeBalance: 0,
        });
      }

      const mapByKey = new Map(buckets.map((b) => [b.key, b]));
      for (const tx of transactions) {
        const d = new Date(tx.transactionDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const b = mapByKey.get(key);
        if (b) {
          if (tx.type === 'income') b.income += tx.amount;
          else b.expense += tx.amount;
        }
      }
    } else {
      // Build last 14 days ending today
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStr = String(d.getDate()).padStart(2, '0');
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        const key = `${yearStr}-${monthStr}-${dayStr}`;
        buckets.push({
          key,
          label: `${dayStr}/${monthStr}`,
          fullLabel: `Ngày ${dayStr}/${monthStr}/${yearStr}`,
          income: 0,
          expense: 0,
          net: 0,
          cumulativeBalance: 0,
        });
      }

      const mapByKey = new Map(buckets.map((b) => [b.key, b]));
      for (const tx of transactions) {
        const d = new Date(tx.transactionDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          '0'
        )}-${String(d.getDate()).padStart(2, '0')}`;
        const b = mapByKey.get(key);
        if (b) {
          if (tx.type === 'income') b.income += tx.amount;
          else b.expense += tx.amount;
        }
      }
    }

    let runningBalance = 0;
    for (const b of buckets) {
      b.net = b.income - b.expense;
      runningBalance += b.net;
      b.cumulativeBalance = runningBalance;
    }

    return buckets;
  }, [transactions, timelineMode]);

  // Compute Y-axis domain & grid ticks for Cashflow Chart
  const chartGeometry = useMemo(() => {
    let maxVal = 0;
    let minVal = 0;

    for (const b of timelineBuckets) {
      maxVal = Math.max(maxVal, b.income, b.expense, b.cumulativeBalance);
      minVal = Math.min(minVal, b.cumulativeBalance);
    }

    if (maxVal === 0 && minVal === 0) {
      maxVal = 2_000_000;
      minVal = -1_000_000;
    } else {
      // Choose a clean step size (e.g., 50k, 100k, 500k, 1tr, 2tr, 5tr)
      const absMax = Math.max(Math.abs(maxVal), Math.abs(minVal), 500_000);
      const rawStep = absMax / 3;
      const niceSteps = [
        50_000,
        100_000,
        200_000,
        500_000,
        1_000_000,
        2_000_000,
        5_000_000,
        10_000_000,
      ];
      const step =
        niceSteps.find((s) => s >= rawStep) ||
        Math.ceil(rawStep / 5_000_000) * 5_000_000;

      maxVal = Math.max(step * 2, Math.ceil(maxVal / step) * step);
      minVal = minVal < 0 ? Math.floor(minVal / step) * step : -step;
    }

    const totalRange = maxVal - minVal || 1;
    const tickCount = 6;
    const tickStep = totalRange / tickCount;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      const val = Math.round((maxVal - i * tickStep) / 10_000) * 10_000;
      ticks.push(val);
    }
    if (!ticks.includes(0)) {
      ticks.push(0);
      ticks.sort((a, b) => b - a);
    }

    return { maxVal, minVal, totalRange, ticks };
  }, [timelineBuckets]);

  const activeDonutSlice = useMemo(
    () => donutData.slices.find((s) => s.key === hoveredSliceKey) || null,
    [donutData.slices, hoveredSliceKey]
  );

  // SVG coordinate dimensions for the right Cashflow Chart
  const svgW = 680;
  const svgH = 290;
  const padLeft = 56;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 54;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const valueToY = (v: number) => {
    const ratio = (chartGeometry.maxVal - v) / chartGeometry.totalRange;
    return padTop + ratio * plotH;
  };

  const zeroY = valueToY(0);
  const bucketStepX = plotW / Math.max(1, timelineBuckets.length);

  const linePoints = timelineBuckets.map((b, idx) => ({
    x: padLeft + idx * bucketStepX + bucketStepX / 2,
    y: valueToY(b.cumulativeBalance),
    bucket: b,
  }));

  const smoothLinePath = buildSmoothCurvePath(linePoints);
  const smoothAreaPath =
    linePoints.length > 1
      ? `${smoothLinePath} L ${linePoints[linePoints.length - 1].x.toFixed(
          2
        )} ${zeroY.toFixed(2)} L ${linePoints[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`
      : '';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* =====================================================================
          LEFT CARD (5 COLS): CƠ CẤU THEO DANH MỤC (DONUT CHART)
         ===================================================================== */}
      <div className="flex flex-col justify-between rounded-3xl border border-indigo-100/90 bg-white p-6 shadow-[0_8px_30px_rgb(15,23,42,0.04)] dark:border-indigo-500/20 dark:bg-[#131B2E] lg:col-span-5">
        {/* Card Header with [Chi | Thu] Segmented Toggle */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <PieChart className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Cơ cấu theo danh mục
            </h3>
          </div>

          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-white/15 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                setDonutMode('expense');
                setHoveredSliceKey(null);
              }}
              className={`rounded-lg px-3.5 py-1 text-xs font-extrabold transition ${
                donutMode === 'expense'
                  ? 'bg-[#DC2646] text-white shadow-xs'
                  : 'text-slate-600 hover:text-rose-600 dark:text-slate-300'
              }`}
            >
              Chi
            </button>
            <button
              type="button"
              onClick={() => {
                setDonutMode('income');
                setHoveredSliceKey(null);
              }}
              className={`rounded-lg px-3.5 py-1 text-xs font-extrabold transition ${
                donutMode === 'income'
                  ? 'bg-[#10B981] text-white shadow-xs'
                  : 'text-emerald-700 hover:text-emerald-600 dark:text-emerald-400'
              }`}
            >
              Thu
            </button>
          </div>
        </div>

        {/* Interactive SVG Donut Chart */}
        <div className="my-auto flex flex-col items-center justify-center py-5">
          <div className="relative flex h-60 w-60 items-center justify-center">
            <svg viewBox="0 0 240 240" className="h-full w-full overflow-visible">
              {donutData.slices.length === 0 ? (
                /* Clean Empty Ring when 0 transactions */
                <circle
                  cx="120"
                  cy="120"
                  r="82"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="36"
                  className="text-slate-100 dark:text-slate-800"
                />
              ) : (
                (() => {
                  let currentAngle = 0;
                  return donutData.slices.map((slice) => {
                    const sweep = (slice.amount / donutData.total) * 360;
                    const startAngle = currentAngle;
                    const endAngle = currentAngle + sweep;
                    currentAngle = endAngle;

                    const isHovered =
                      hoveredSliceKey === slice.key ||
                      (slice.slug && selectedCategory === slice.slug);

                    const pathData = describeDonutArc(
                      120,
                      120,
                      isHovered ? 105 : 100,
                      58,
                      startAngle,
                      endAngle
                    );

                    return (
                      <path
                        key={slice.key}
                        d={pathData}
                        fill={slice.color}
                        stroke="#ffffff"
                        strokeWidth={donutData.slices.length > 1 ? 2.5 : 0}
                        className="cursor-pointer transition-all duration-200 dark:stroke-[#131B2E]"
                        onMouseEnter={() => setHoveredSliceKey(slice.key)}
                        onMouseLeave={() => setHoveredSliceKey(null)}
                        onClick={() => {
                          if (slice.slug && donutMode === 'expense') {
                            onSelectCategory(
                              selectedCategory === slice.slug ? 'all' : slice.slug
                            );
                          }
                        }}
                      >
                        <title>
                          {slice.label}: {formatVndNumber(slice.amount)} ₫ ({slice.pct}%)
                        </title>
                      </path>
                    );
                  });
                })()
              )}
            </svg>

            {/* Center Donut Readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              {activeDonutSlice ? (
                <>
                  <span className="max-w-[110px] truncate text-[11px] font-extrabold text-slate-500 dark:text-slate-300">
                    {activeDonutSlice.label}
                  </span>
                  <span className="mt-0.5 font-mono text-sm font-black tabular-nums text-slate-900 dark:text-white">
                    {formatVndNumber(activeDonutSlice.amount)} ₫
                  </span>
                  <span
                    className="mt-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold"
                    style={{
                      backgroundColor: `${activeDonutSlice.color}20`,
                      color: activeDonutSlice.color,
                    }}
                  >
                    {activeDonutSlice.pct}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-bold text-slate-400">
                    {donutMode === 'expense' ? 'Tổng Chi' : 'Tổng Thu'}
                  </span>
                  <span className="mt-0.5 font-mono text-sm font-black tabular-nums text-slate-800 dark:text-white">
                    {formatVndNumber(donutData.total)} ₫
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Donut Legend Pills (Matching Screenshot) */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
            {donutData.slices.length === 0 ? (
              <span className="text-xs font-medium text-slate-400">
                Chưa có giao dịch {donutMode === 'expense' ? 'chi tiêu' : 'thu nhập'} nào.
              </span>
            ) : (
              donutData.slices.map((slice) => {
                const isSelected =
                  slice.slug &&
                  donutMode === 'expense' &&
                  selectedCategory === slice.slug;
                return (
                  <button
                    key={slice.key}
                    type="button"
                    onMouseEnter={() => setHoveredSliceKey(slice.key)}
                    onMouseLeave={() => setHoveredSliceKey(null)}
                    onClick={() => {
                      if (slice.slug && donutMode === 'expense') {
                        onSelectCategory(
                          selectedCategory === slice.slug ? 'all' : slice.slug
                        );
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-200'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span>{slice.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          RIGHT CARD (7 COLS): DÒNG TIỀN THEO THỜI GIAN (BAR + SMOOTH LINE CHART)
         ===================================================================== */}
      <div className="flex flex-col justify-between rounded-3xl border border-indigo-100/90 bg-white p-6 shadow-[0_8px_30px_rgb(15,23,42,0.04)] dark:border-indigo-500/20 dark:bg-[#131B2E] lg:col-span-7">
        {/* Card Header with [12 tháng | Theo ngày] Segmented Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <LineChart className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Dòng tiền theo thời gian
            </h3>
          </div>

          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-white/15 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                setTimelineMode('12months');
                setHoveredBucketIdx(null);
              }}
              className={`rounded-lg px-3.5 py-1 text-xs font-extrabold transition ${
                timelineMode === '12months'
                  ? 'bg-[#0B6BCB] text-white shadow-xs'
                  : 'text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800'
              }`}
            >
              12 tháng
            </button>
            <button
              type="button"
              onClick={() => {
                setTimelineMode('daily');
                setHoveredBucketIdx(null);
              }}
              className={`rounded-lg px-3.5 py-1 text-xs font-extrabold transition ${
                timelineMode === 'daily'
                  ? 'bg-[#0B6BCB] text-white shadow-xs'
                  : 'text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800'
              }`}
            >
              Theo ngày
            </button>
          </div>
        </div>

        {/* SVG Combo Chart (Thu/Chi Bars + Smooth Cumulative Balance Curve) */}
        <div className="relative mt-4 w-full select-none">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="h-auto w-full overflow-visible"
          >
            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {chartGeometry.ticks.map((tickVal) => {
              const y = valueToY(tickVal);
              const isZero = tickVal === 0;
              return (
                <g key={tickVal}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgW - padRight}
                    y2={y}
                    stroke={isZero ? '#CBD5E1' : '#F1F5F9'}
                    strokeWidth={isZero ? 1.5 : 1}
                    className="dark:stroke-slate-800"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[11px] font-semibold"
                  >
                    {formatCompactVndAxis(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* Light Blue Area Fill under Cumulative Balance Curve */}
            {smoothAreaPath && (
              <path
                d={smoothAreaPath}
                fill="rgba(11, 132, 216, 0.12)"
                className="pointer-events-none"
              />
            )}

            {/* Income (Green) & Expense (Rose) Bars per Bucket */}
            {timelineBuckets.map((b, idx) => {
              const centerX = padLeft + idx * bucketStepX + bucketStepX / 2;
              const barW = Math.min(14, Math.max(8, bucketStepX * 0.28));
              const gap = 2;

              const incY = valueToY(b.income);
              const incH = Math.max(0, zeroY - incY);

              const expY = valueToY(b.expense);
              const expH = Math.max(0, zeroY - expY);

              const isHovered = hoveredBucketIdx === idx;

              return (
                <g
                  key={b.key}
                  onMouseEnter={() => setHoveredBucketIdx(idx)}
                  onMouseLeave={() => setHoveredBucketIdx(null)}
                  className="cursor-pointer"
                >
                  {/* Hover Column Highlight */}
                  {isHovered && (
                    <rect
                      x={padLeft + idx * bucketStepX + 2}
                      y={padTop}
                      width={bucketStepX - 4}
                      height={plotH}
                      rx={6}
                      fill="rgba(99, 102, 241, 0.06)"
                    />
                  )}

                  {/* Green Income Bar */}
                  {b.income > 0 && (
                    <rect
                      x={centerX - barW - gap / 2}
                      y={incY}
                      width={barW}
                      height={Math.max(3, incH)}
                      rx={3}
                      fill="#2BAE76"
                    />
                  )}

                  {/* Rose Expense Bar */}
                  {b.expense > 0 && (
                    <rect
                      x={centerX + gap / 2}
                      y={expY}
                      width={barW}
                      height={Math.max(3, expH)}
                      rx={3}
                      fill="#E64965"
                    />
                  )}

                  {/* Transparent Full-Height Hit Target for Smooth Hover */}
                  <rect
                    x={padLeft + idx * bucketStepX}
                    y={padTop}
                    width={bucketStepX}
                    height={plotH + padBottom}
                    fill="transparent"
                  />

                  {/* Rotated X-Axis Date/Month Label */}
                  <text
                    x={centerX}
                    y={svgH - 22}
                    textAnchor="end"
                    transform={`rotate(-28, ${centerX}, ${svgH - 22})`}
                    className={`font-mono text-[10.5px] font-semibold transition-colors ${
                      isHovered
                        ? 'fill-indigo-600 font-bold dark:fill-indigo-300'
                        : 'fill-slate-500 dark:fill-slate-400'
                    }`}
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}

            {/* Smooth Blue Cumulative Balance Curve */}
            {smoothLinePath && (
              <path
                d={smoothLinePath}
                fill="none"
                stroke="#0B84D8"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="pointer-events-none"
              />
            )}

            {/* Data Dots on the Cumulative Balance Line */}
            {linePoints.map((pt, idx) => {
              const isHovered = hoveredBucketIdx === idx;
              return (
                <circle
                  key={pt.bucket.key}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 5.5 : 3.5}
                  fill={isHovered ? '#ffffff' : '#0B84D8'}
                  stroke="#0B84D8"
                  strokeWidth={isHovered ? 3 : 2}
                  className="pointer-events-none transition-all"
                />
              );
            })}
          </svg>

          {/* Floating Tooltip on Hover (Matches Reference Screenshot) */}
          {hoveredBucketIdx !== null && timelineBuckets[hoveredBucketIdx] && (
            <div
              className="pointer-events-none absolute top-4 z-10 rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95"
              style={{
                left: `${Math.min(
                  68,
                  Math.max(8, ((hoveredBucketIdx + 0.5) / timelineBuckets.length) * 100 - 12)
                )}%`,
              }}
            >
              <div className="font-extrabold text-slate-800 dark:text-white mb-1">
                {timelineBuckets[hoveredBucketIdx].fullLabel}
              </div>
              <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
                <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs border-2 border-[#0B84D8] bg-white" />
                  <span>
                    Số dư lũy kế:{' '}
                    <strong>
                      {formatVndNumber(
                        timelineBuckets[hoveredBucketIdx].cumulativeBalance
                      )}{' '}
                      ₫
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#2BAE76]" />
                  <span>
                    Thu:{' '}
                    <strong>
                      {formatVndNumber(timelineBuckets[hoveredBucketIdx].income)} ₫
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#E64965]" />
                  <span>
                    Chi:{' '}
                    <strong>
                      {formatVndNumber(timelineBuckets[hoveredBucketIdx].expense)} ₫
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Legend: ○ Số dư lũy kế   ● Thu   ● Chi */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-5 pt-1 text-xs font-bold text-slate-600 dark:text-slate-300">
          <div className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full border-[2.5px] border-[#0B84D8] bg-sky-100/80" />
            <span>Số dư lũy kế</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-[#2BAE76]" />
            <span>Thu</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-[#E64965]" />
            <span>Chi</span>
          </div>
        </div>
      </div>
    </div>
  );
}
