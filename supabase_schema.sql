-- Finiax Database Schema (Supabase)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  avatar_url text,
  finiax_coins numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Incomes and Expenses (Cash Flow)
CREATE TABLE public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount numeric not null,
  type text check (type in ('income', 'expense')) not null,
  category text not null,
  description text,
  date timestamp with time zone default timezone('utc'::text, now()) not null,
  receipt_url text,
  is_ai_validated boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Budgets
CREATE TABLE public.budgets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  category text not null,
  limit_amount numeric not null,
  start_date date not null,
  end_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

-- Create Policies
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users can view own transactions" on public.transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions" on public.transactions for insert with check (auth.uid() = user_id);
create policy "Users can update own transactions" on public.transactions for update using (auth.uid() = user_id);
create policy "Users can delete own transactions" on public.transactions for delete using (auth.uid() = user_id);

create policy "Users can view own budgets" on public.budgets for select using (auth.uid() = user_id);
create policy "Users can insert own budgets" on public.budgets for insert with check (auth.uid() = user_id);
create policy "Users can update own budgets" on public.budgets for update using (auth.uid() = user_id);
create policy "Users can delete own budgets" on public.budgets for delete using (auth.uid() = user_id);

-- Create a trigger to automatically create a profile when a user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Goals
CREATE TABLE public.goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  target_amount numeric not null,
  current_amount numeric default 0 not null,
  deadline date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Liabilities (Debts / Credit Cards)
CREATE TABLE public.liabilities (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  type text check (type in ('credit_card', 'loan', 'mortgage', 'other')) not null,
  total_amount numeric not null,
  remaining_amount numeric not null,
  monthly_payment numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.goals enable row level security;
alter table public.liabilities enable row level security;

create policy "Users can view own goals" on public.goals for select using (auth.uid() = user_id);
create policy "Users can insert own goals" on public.goals for insert with check (auth.uid() = user_id);
create policy "Users can update own goals" on public.goals for update using (auth.uid() = user_id);
create policy "Users can delete own goals" on public.goals for delete using (auth.uid() = user_id);

create policy "Users can view own liabilities" on public.liabilities for select using (auth.uid() = user_id);
create policy "Users can insert own liabilities" on public.liabilities for insert with check (auth.uid() = user_id);
create policy "Users can update own liabilities" on public.liabilities for update using (auth.uid() = user_id);
create policy "Users can delete own liabilities" on public.liabilities for delete using (auth.uid() = user_id);

-- Fase 5 updates
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS name text default 'Movimiento';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method text default 'cash';

-- Assets / Investments
CREATE TABLE public.assets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  symbol text not null,
  type text check (type in ('crypto', 'stock', 'fiat', 'other')) not null,
  quantity numeric not null,
  average_buy_price numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.assets enable row level security;
create policy "Users can view own assets" on public.assets for select using (auth.uid() = user_id);
create policy "Users can insert own assets" on public.assets for insert with check (auth.uid() = user_id);
create policy "Users can update own assets" on public.assets for update using (auth.uid() = user_id);
create policy "Users can delete own assets" on public.assets for delete using (auth.uid() = user_id);

-- Budget Redesign updates
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS section text default 'General';
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS due_day integer;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS month integer;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS percentage numeric;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS row_color text;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;

-- Credit Lines Table (Tarjetas y Préstamos)
CREATE TABLE IF NOT EXISTS public.credit_lines (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL, -- 'credit_card', 'loan'
    limit_amount numeric,
    cut_off_day integer,
    payment_due_day integer,
    icon text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security
ALTER TABLE public.credit_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credit lines" ON public.credit_lines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credit lines" ON public.credit_lines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credit lines" ON public.credit_lines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own credit lines" ON public.credit_lines FOR DELETE USING (auth.uid() = user_id);

-- Debt Installments Table (Cuotas)
CREATE TABLE IF NOT EXISTS public.debt_installments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    credit_line_id uuid REFERENCES public.credit_lines(id) ON DELETE CASCADE,
    description text NOT NULL,
    amount numeric NOT NULL,
    interest_amount numeric DEFAULT 0,
    installment_number integer NOT NULL,
    total_installments integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    status text DEFAULT 'pending', -- 'pending', 'paid'
    icon text,
    row_color text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security
ALTER TABLE public.debt_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own debt installments" ON public.debt_installments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own debt installments" ON public.debt_installments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own debt installments" ON public.debt_installments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own debt installments" ON public.debt_installments FOR DELETE USING (auth.uid() = user_id);
