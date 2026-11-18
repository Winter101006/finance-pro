-- =============================================================================
-- FINANCE PRO — SUPABASE POSTGRESQL SCHEMA, TRIGGERS & ROW-LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Người dùng Finance Pro',
  ui_mode text not null default 'standard' check (ui_mode in ('standard', 'senior')),
  default_wallet_id uuid,
  created_at timestamptz not null default now()
);

-- 2. WALLETS TABLE (Personal & Family Shared Wallets)
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'personal' check (type in ('personal', 'family')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  monthly_budget bigint not null default 6000000,
  weekly_budget bigint not null default 1500000,
  created_at timestamptz not null default now()
);

-- Add foreign key from profiles.default_wallet_id to wallets.id
alter table public.profiles
  drop constraint if exists profiles_default_wallet_id_fkey;
alter table public.profiles
  add constraint profiles_default_wallet_id_fkey
  foreign key (default_wallet_id) references public.wallets(id) on delete set null;

-- 3. WALLET MEMBERS TABLE
create table if not exists public.wallet_members (
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (wallet_id, user_id)
);

-- 4. CATEGORIES TABLE (wallet_id IS NULL for global system categories)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.wallets(id) on delete cascade,
  name text not null,
  slug text not null,
  type text not null check (type in ('expense', 'income')),
  icon text not null default 'MoreHorizontal',
  color text not null default '#6366F1',
  created_at timestamptz not null default now(),
  unique (wallet_id, slug)
);

-- 5. TRANSACTIONS TABLE (amount in BIGINT VND)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  category_slug text not null default 'khac',
  amount bigint not null check (amount > 0),
  type text not null check (type in ('expense', 'income')),
  description text not null,
  raw_input text,
  transaction_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- INDEXES FOR HIGH-SPEED QUERIES
-- =============================================================================
create index if not exists idx_wallet_members_user on public.wallet_members(user_id);
create index if not exists idx_transactions_wallet_date on public.transactions(wallet_id, transaction_date desc);
create index if not exists idx_transactions_user on public.transactions(user_id);
create index if not exists idx_categories_slug on public.categories(slug);

-- =============================================================================
-- SEED 10 SYSTEM DEFAULT CATEGORIES (INHERITED & EXPANDED FROM FINANCE-TRACKER)
-- =============================================================================
insert into public.categories (id, wallet_id, name, slug, type, icon, color)
values
  ('00000000-0000-0000-0000-000000000001', null, 'Ăn uống', 'an-uong', 'expense', 'Utensils', '#F97316'),
  ('00000000-0000-0000-0000-000000000002', null, 'Đi chợ', 'di-cho', 'expense', 'ShoppingBasket', '#10B981'),
  ('00000000-0000-0000-0000-000000000003', null, 'Di chuyển', 'di-chuyen', 'expense', 'Bus', '#06B6D4'),
  ('00000000-0000-0000-0000-000000000004', null, 'Hóa đơn điện nước', 'hoa-don', 'expense', 'Zap', '#F59E0B'),
  ('00000000-0000-0000-0000-000000000005', null, 'Học tập', 'hoc-tap', 'expense', 'GraduationCap', '#6366F1'),
  ('00000000-0000-0000-0000-000000000006', null, 'Mua sắm', 'mua-sam', 'expense', 'ShoppingBag', '#EC4899'),
  ('00000000-0000-0000-0000-000000000007', null, 'Sức khỏe', 'suc-khoe', 'expense', 'HeartPulse', '#EF4444'),
  ('00000000-0000-0000-0000-000000000008', null, 'Gia đình', 'gia-dinh', 'expense', 'Users', '#8B5CF6'),
  ('00000000-0000-0000-0000-000000000009', null, 'Thu nhập', 'thu-nhap', 'income', 'Wallet', '#16A34A'),
  ('00000000-0000-0000-0000-000000000010', null, 'Khác', 'khac', 'expense', 'MoreHorizontal', '#64748B')
on conflict do nothing;

-- =============================================================================
-- HELPER FUNCTION & ROW-LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
create or replace function public.is_wallet_member(target_wallet_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.wallets w
    left join public.wallet_members wm on wm.wallet_id = w.id
    where w.id = target_wallet_id
      and (w.owner_id = auth.uid() or wm.user_id = auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- Profiles RLS
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Wallets RLS
drop policy if exists "Members can view wallets" on public.wallets;
create policy "Members can view wallets"
  on public.wallets for select
  using (owner_id = auth.uid() or public.is_wallet_member(id));

drop policy if exists "Users can create own wallets" on public.wallets;
create policy "Users can create own wallets"
  on public.wallets for insert
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update wallets" on public.wallets;
create policy "Owners can update wallets"
  on public.wallets for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners can delete wallets" on public.wallets;
create policy "Owners can delete wallets"
  on public.wallets for delete
  using (owner_id = auth.uid());

-- Wallet Members RLS
drop policy if exists "Members can view wallet memberships" on public.wallet_members;
create policy "Members can view wallet memberships"
  on public.wallet_members for select
  using (user_id = auth.uid() or public.is_wallet_member(wallet_id));

drop policy if exists "Wallet owners can manage members" on public.wallet_members;
create policy "Wallet owners can manage members"
  on public.wallet_members for all
  using (
    exists (
      select 1 from public.wallets w
      where w.id = wallet_id and w.owner_id = auth.uid()
    )
  );

-- Categories RLS
drop policy if exists "Anyone can read system or member categories" on public.categories;
create policy "Anyone can read system or member categories"
  on public.categories for select
  using (wallet_id is null or public.is_wallet_member(wallet_id));

drop policy if exists "Members can manage custom wallet categories" on public.categories;
create policy "Members can manage custom wallet categories"
  on public.categories for all
  using (wallet_id is not null and public.is_wallet_member(wallet_id))
  with check (wallet_id is not null and public.is_wallet_member(wallet_id));

-- Transactions RLS
drop policy if exists "Members can view wallet transactions" on public.transactions;
create policy "Members can view wallet transactions"
  on public.transactions for select
  using (public.is_wallet_member(wallet_id));

drop policy if exists "Members can insert wallet transactions" on public.transactions;
create policy "Members can insert wallet transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id and public.is_wallet_member(wallet_id));

drop policy if exists "Members can update wallet transactions" on public.transactions;
create policy "Members can update wallet transactions"
  on public.transactions for update
  using (public.is_wallet_member(wallet_id))
  with check (public.is_wallet_member(wallet_id));

drop policy if exists "Members can delete wallet transactions" on public.transactions;
create policy "Members can delete wallet transactions"
  on public.transactions for delete
  using (public.is_wallet_member(wallet_id));

-- =============================================================================
-- TRIGGER: AUTO-PROVISION PROFILE & DEFAULT WALLETS ON SIGN UP
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  personal_wallet_id uuid;
  user_name text;
  initial_mode text;
begin
  user_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Người dùng');
  initial_mode := coalesce(new.raw_user_meta_data->>'ui_mode', 'standard');

  insert into public.profiles (id, display_name, ui_mode)
  values (new.id, user_name, initial_mode);

  insert into public.wallets (name, type, owner_id, monthly_budget, weekly_budget)
  values ('Ví Cá Nhân', 'personal', new.id, 0, 0)
  returning id into personal_wallet_id;

  insert into public.wallet_members (wallet_id, user_id, role)
  values (personal_wallet_id, new.id, 'owner');

  update public.profiles
  set default_wallet_id = personal_wallet_id
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
