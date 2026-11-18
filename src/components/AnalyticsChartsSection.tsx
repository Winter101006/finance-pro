'use client';

import { LineChart, PieChart } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  computeCashflowBuckets,
  computeDonutBreakdown,
} from '@/lib/analyticsMath';
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

function describeDonutArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
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
  const [activeBucketIdx, setActiveBucketIdx] = useState<number | null>(null);

  const donutData = useMemo(
    () => computeDonutBreakdown(transactions, donutMode),
    [transactions, donutMode]
  );

  const timelineBuckets = useMemo(
    () => computeCashflowBuckets(transactions, timelineMode),
    [transactions, timelineMode]
  );

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
    () =>
      donutData.slices.find((s) => s.key === hoveredSliceKey) ||
      donutData.slices.find(
        (s) => s.slug && donutMode === 'expense' && s.slug === selectedCategory
      ) ||
      null,
    [donutData.slices, hoveredSliceKey, donutMode, selectedCategory]
  );

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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* LEFT CARD (5 COLS): CƠ CẤU THEO DANH MỤC */}
      <div className="flex flex-col justify-between rounded-3xl border border-indigo-100/90 bg-white p-5 shadow-[0_8px_30px_rgb(15,23,42,0.04)] dark:border-indigo-500/20 dark:bg-[#131B2E] sm:p-6 lg:col-span-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <PieChart className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white sm:text-base">
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

        <div className="my-auto flex flex-col items-center justify-center py-4">
          <div className="relative flex h-56 w-56 items-center justify-center sm:h-60 sm:w-60">
            <svg viewBox="0 0 240 240" className="h-full w-full overflow-visible">
              {donutData.slices.length === 0 ? (
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

                    const isHighlighted =
                      hoveredSliceKey === slice.key ||
                      (slice.slug &&
                        donutMode === 'expense' &&
                        selectedCategory === slice.slug);

                    const pathData = describeDonutArc(
                      120,
                      120,
                      isHighlighted ? 105 : 100,
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
                          setHoveredSliceKey((prev) =>
                            prev === slice.key ? null : slice.key
                          );
                          if (slice.slug && donutMode === 'expense') {
                            onSelectCategory(
                              selectedCategory === slice.slug ? 'all' : slice.slug
                            );
                          }
                        }}
                      />
                    );
                  });
                })()
              )}
            </svg>

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

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-1">
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
                      setHoveredSliceKey((prev) =>
                        prev === slice.key ? null : slice.key
                      );
                      if (slice.slug && donutMode === 'expense') {
                        onSelectCategory(
                          selectedCategory === slice.slug ? 'all' : slice.slug
                        );
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold transition ${
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

      {/* RIGHT CARD (7 COLS): DÒNG TIỀN THEO THỜI GIAN */}
      <div className="flex flex-col justify-between rounded-3xl border border-indigo-100/90 bg-white p-5 shadow-[0_8px_30px_rgb(15,23,42,0.04)] dark:border-indigo-500/20 dark:bg-[#131B2E] sm:p-6 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white sm:text-base">
              Dòng tiền theo thời gian
            </h3>
          </div>

          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-white/15 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => {
                setTimelineMode('12months');
                setActiveBucketIdx(null);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
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
                setActiveBucketIdx(null);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                timelineMode === 'daily'
                  ? 'bg-[#0B6BCB] text-white shadow-xs'
                  : 'text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800'
              }`}
            >
              Theo ngày
            </button>
          </div>
        </div>

        {/* SVG Combo Chart */}
        <div className="relative mt-4 w-full select-none">
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto w-full overflow-visible">
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

            {smoothAreaPath && (
              <path
                d={smoothAreaPath}
                fill="rgba(11, 132, 216, 0.12)"
                className="pointer-events-none"
              />
            )}

            {timelineBuckets.map((b, idx) => {
              const centerX = padLeft + idx * bucketStepX + bucketStepX / 2;
              const barW = Math.min(14, Math.max(8, bucketStepX * 0.28));
              const gap = 2;

              const incY = valueToY(b.income);
              const incH = Math.max(0, zeroY - incY);

              const expY = valueToY(b.expense);
              const expH = Math.max(0, zeroY - expY);

              const isActive = activeBucketIdx === idx;

              return (
                <g
                  key={b.key}
                  onMouseEnter={() => setActiveBucketIdx(idx)}
                  onMouseLeave={() => setActiveBucketIdx(null)}
                  onClick={() => setActiveBucketIdx((prev) => (prev === idx ? null : idx))}
                  className="cursor-pointer"
                >
                  {isActive && (
                    <rect
                      x={padLeft + idx * bucketStepX + 2}
                      y={padTop}
                      width={bucketStepX - 4}
                      height={plotH}
                      rx={6}
                      fill="rgba(99, 102, 241, 0.08)"
                    />
                  )}

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

                  <rect
                    x={padLeft + idx * bucketStepX}
                    y={padTop}
                    width={bucketStepX}
                    height={plotH + padBottom}
                    fill="transparent"
                  />

                  <text
                    x={centerX}
                    y={svgH - 22}
                    textAnchor="end"
                    transform={`rotate(-30, ${centerX}, ${svgH - 22})`}
                    className={`font-mono text-[11px] font-semibold transition-colors ${
                      isActive
                        ? 'fill-indigo-600 font-bold dark:fill-indigo-300'
                        : 'fill-slate-500 dark:fill-slate-400'
                    }`}
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}

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

            {linePoints.map((pt, idx) => {
              const isActive = activeBucketIdx === idx;
              return (
                <circle
                  key={pt.bucket.key}
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 5.5 : 3.5}
                  fill={isActive ? '#ffffff' : '#0B84D8'}
                  stroke="#0B84D8"
                  strokeWidth={isActive ? 3 : 2}
                  className="pointer-events-none transition-all"
                />
              );
            })}
          </svg>

          {activeBucketIdx !== null && timelineBuckets[activeBucketIdx] && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95"
              style={{
                left: `${Math.min(
                  60,
                  Math.max(6, ((activeBucketIdx + 0.5) / timelineBuckets.length) * 100 - 14)
                )}%`,
              }}
            >
              <div className="mb-1 font-extrabold text-slate-800 dark:text-white">
                {timelineBuckets[activeBucketIdx].fullLabel}
              </div>
              <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
                <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs border-2 border-[#0B84D8] bg-white" />
                  <span>
                    Số dư:{' '}
                    <strong>
                      {formatVndNumber(
                        timelineBuckets[activeBucketIdx].cumulativeBalance
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
                      {formatVndNumber(timelineBuckets[activeBucketIdx].income)} ₫
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#E64965]" />
                  <span>
                    Chi:{' '}
                    <strong>
                      {formatVndNumber(timelineBuckets[activeBucketIdx].expense)} ₫
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

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
