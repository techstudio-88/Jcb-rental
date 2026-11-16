-- Persist operator salary calculations and payment status.
create table if not exists public.operator_payroll (
 id uuid primary key default gen_random_uuid(),
 driver_id uuid not null references public.profiles(id) on delete cascade,
 period_month date not null,
 attendance_days numeric(6,2) not null default 0 check(attendance_days>=0),
 base_amount integer not null default 0 check(base_amount>=0),
 incentive_amount integer not null default 0 check(incentive_amount>=0),
 adjustment_amount integer not null default 0,
 total_amount integer not null check(total_amount>=0),
 status text not null default 'pending' check(status in ('pending','paid')),
 paid_at timestamptz, paid_by uuid references public.profiles(id), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(driver_id,period_month),
 check((status='paid' and paid_at is not null and paid_by is not null) or status='pending')
);
create index if not exists operator_payroll_period_idx on public.operator_payroll(period_month desc,driver_id);
alter table public.operator_payroll enable row level security;
drop policy if exists payroll_read on public.operator_payroll;
create policy payroll_read on public.operator_payroll for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists payroll_admin_all on public.operator_payroll;
create policy payroll_admin_all on public.operator_payroll for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop trigger if exists trg_operator_payroll_updated on public.operator_payroll;
create trigger trg_operator_payroll_updated before update on public.operator_payroll for each row execute function private.touch_updated_at();
grant select,insert,update,delete on public.operator_payroll to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='operator_payroll') then alter publication supabase_realtime add table public.operator_payroll; end if;
end $$;
