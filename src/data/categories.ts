import type { Category, CategorySlug } from '../types/finance';

export const SYSTEM_CATEGORIES: Category[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    walletId: null,
    name: 'Ăn uống',
    slug: 'an-uong',
    type: 'expense',
    icon: 'Utensils',
    color: '#F97316',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    walletId: null,
    name: 'Đi chợ',
    slug: 'di-cho',
    type: 'expense',
    icon: 'ShoppingBasket',
    color: '#10B981',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    walletId: null,
    name: 'Di chuyển',
    slug: 'di-chuyen',
    type: 'expense',
    icon: 'Bus',
    color: '#06B6D4',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    walletId: null,
    name: 'Hóa đơn điện nước',
    slug: 'hoa-don',
    type: 'expense',
    icon: 'Zap',
    color: '#F59E0B',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    walletId: null,
    name: 'Học tập',
    slug: 'hoc-tap',
    type: 'expense',
    icon: 'GraduationCap',
    color: '#6366F1',
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    walletId: null,
    name: 'Mua sắm',
    slug: 'mua-sam',
    type: 'expense',
    icon: 'ShoppingBag',
    color: '#EC4899',
  },
  {
    id: '00000000-0000-0000-0000-000000000007',
    walletId: null,
    name: 'Sức khỏe',
    slug: 'suc-khoe',
    type: 'expense',
    icon: 'HeartPulse',
    color: '#EF4444',
  },
  {
    id: '00000000-0000-0000-0000-000000000008',
    walletId: null,
    name: 'Gia đình',
    slug: 'gia-dinh',
    type: 'expense',
    icon: 'Users',
    color: '#8B5CF6',
  },
  {
    id: '00000000-0000-0000-0000-000000000009',
    walletId: null,
    name: 'Thu nhập',
    slug: 'thu-nhap',
    type: 'income',
    icon: 'Wallet',
    color: '#16A34A',
  },
  {
    id: '00000000-0000-0000-0000-000000000010',
    walletId: null,
    name: 'Khác',
    slug: 'khac',
    type: 'expense',
    icon: 'MoreHorizontal',
    color: '#64748B',
  },
];

export const CATEGORY_BY_SLUG: Record<CategorySlug, Category> = SYSTEM_CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.slug] = cat;
    return acc;
  },
  {} as Record<CategorySlug, Category>
);

export function getCategoryBySlug(slug?: string): Category {
  if (slug && slug in CATEGORY_BY_SLUG) {
    return CATEGORY_BY_SLUG[slug as CategorySlug];
  }
  return CATEGORY_BY_SLUG['khac'];
}
