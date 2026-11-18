import { CATEGORY_BY_SLUG } from '../data/categories';
import type {
  CategorySlug,
  FinanceTransaction,
  TransactionType,
} from '../types/finance';

export interface DonutSlice {
  key: string;
  label: string;
  amount: number;
  pct: number;
  color: string;
  slug?: CategorySlug;
}

export interface TimeBucket {
  key: string;
  label: string;
  fullLabel: string;
  income: number;
  expense: number;
  net: number;
  cumulativeBalance: number;
}

export const EXPENSE_CHART_COLORS: Record<string, string> = {
  'an-uong': '#FB5678',
  'di-cho': '#3CC4B6',
  'hoa-don': '#FFCA4B',
  'di-chuyen': '#2F9CEB',
  'hoc-tap': '#8B5CF6',
  'mua-sam': '#EC4899',
  'suc-khoe': '#EF4444',
  'gia-dinh': '#14B8A6',
  khac: '#85929E',
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
    keywords: /(lương|trợ giảng|thù lao|làm thêm|part-time|ca làm|freelance)/i,
  },
  {
    key: 'hoc-bong',
    label: 'Học bổng & Thưởng',
    color: '#2F9CEB',
    keywords: /(học bổng|thưởng|bonus|giải thưởng|dự án)/i,
  },
  {
    key: 'ho-tro',
    label: 'Trợ cấp & Quà tặng',
    color: '#FFCA4B',
    keywords: /(trợ cấp|bố mẹ|gia đình|mừng|lì xì|biếu|cho tiền)/i,
  },
  {
    key: 'dau-tu',
    label: 'Đầu tư & Lãi',
    color: '#8B5CF6',
    keywords: /(lãi|cổ tức|đầu tư|tiết kiệm|hoàn tiền|cashback)/i,
  },
];

export function computeDonutBreakdown(
  transactions: FinanceTransaction[],
  mode: TransactionType
): { total: number; slices: DonutSlice[] } {
  const matching = transactions.filter((t) => t.type === mode);
  const total = matching.reduce((sum, t) => sum + t.amount, 0);

  if (total === 0) {
    return { total: 0, slices: [] };
  }

  if (mode === 'expense') {
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
  }

  const groups: Record<string, { label: string; color: string; amount: number }> = {};

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

export function computeCashflowBuckets(
  transactions: FinanceTransaction[],
  timelineMode: '12months' | 'daily',
  referenceDate: Date = new Date()
): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  let windowStartTime = 0;

  if (timelineMode === '12months') {
    const curYear = referenceDate.getFullYear();
    const curMonth = referenceDate.getMonth();
    windowStartTime = new Date(curYear, curMonth - 11, 1).getTime();

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
    windowStartTime = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() - 13
    ).getTime();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate() - i
      );
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

  // Carry over cumulative balance from transactions strictly prior to the visible window
  let runningBalance = 0;
  for (const tx of transactions) {
    if (new Date(tx.transactionDate).getTime() < windowStartTime) {
      runningBalance += tx.type === 'income' ? tx.amount : -tx.amount;
    }
  }

  for (const b of buckets) {
    b.net = b.income - b.expense;
    runningBalance += b.net;
    b.cumulativeBalance = runningBalance;
  }

  return buckets;
}
