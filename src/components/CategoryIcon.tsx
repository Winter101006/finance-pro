'use client';

import {
  Bus,
  GraduationCap,
  HeartPulse,
  MoreHorizontal,
  ShoppingBag,
  ShoppingBasket,
  Users,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react';
import { getCategoryBySlug } from '@/data/categories';
import type { CategorySlug } from '@/types/finance';

const ICON_COMPONENTS: Record<string, React.ElementType> = {
  Utensils,
  ShoppingBasket,
  Bus,
  Zap,
  GraduationCap,
  ShoppingBag,
  HeartPulse,
  Users,
  Wallet,
  MoreHorizontal,
};

interface CategoryIconProps {
  slug: CategorySlug | string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function CategoryIcon({ slug, size = 'md' }: CategoryIconProps) {
  const category = getCategoryBySlug(slug);
  const Icon = ICON_COMPONENTS[category.icon] || MoreHorizontal;

  const boxSizes = {
    sm: 'h-8 w-8 rounded-xl',
    md: 'h-10 w-10 rounded-2xl',
    lg: 'h-12 w-12 rounded-2xl',
    xl: 'h-14 w-14 rounded-2xl',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-7 w-7',
  };

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-bold shadow-xs ${boxSizes[size]}`}
      style={{
        backgroundColor: `${category.color}18`,
        color: category.color,
        border: `1.5px solid ${category.color}35`,
      }}
    >
      <Icon className={iconSizes[size]} />
    </div>
  );
}
