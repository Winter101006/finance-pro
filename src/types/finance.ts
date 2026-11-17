export type UIMode = 'standard' | 'senior';

export type WalletType = 'personal' | 'family';

export type TransactionType = 'expense' | 'income';

export type CategorySlug =
  | 'an-uong'
  | 'di-cho'
  | 'di-chuyen'
  | 'hoa-don'
  | 'hoc-tap'
  | 'mua-sam'
  | 'suc-khoe'
  | 'gia-dinh'
  | 'thu-nhap'
  | 'khac';

export interface Category {
  id: string;
  walletId: string | null;
  name: string;
  slug: CategorySlug;
  type: TransactionType;
  icon: string;
  color: string;
}

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  ownerId: string;
  monthlyBudget: number;
  weeklyBudget: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  roleLabel: string;
  avatarText: string;
  uiMode: UIMode;
  defaultWalletId: string;
  createdAt: string;
}

export interface FinanceTransaction {
  id: string;
  walletId: string;
  userId: string;
  userDisplayName?: string;
  categoryId: string;
  categorySlug: CategorySlug;
  amount: number; // VND integer
  type: TransactionType;
  description: string;
  rawInput?: string;
  transactionDate: string; // ISO string
  createdAt: string;
}

export interface ParsedExpenseItem {
  amount: number;
  type: TransactionType;
  categorySlug: CategorySlug;
  description: string;
  transactionDate: string;
  spokenConfirmationVi: string;
}

export interface ParseExpenseResponse {
  items: ParsedExpenseItem[];
  spokenSummaryVi: string;
  engine: 'gemini-vertex-express' | 'gemini-developer-api' | 'vietnamese-local-nlp';
  modelUsed?: string;
}
