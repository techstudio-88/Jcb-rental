-- Phase 2 modules: customer requests, loyalty, support, workforce, maintenance and expenses.
-- Requires the private role/booking helper functions from the initial schema migration.
create table if not exists public.booking_change_requests (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 customer_id uuid not null references public.profiles(id) on delete cascade, requested_changes jsonb not null,
 reason text, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now(),
 check(jsonb_typeof(requested_changes)='object')
);
create index if not exists booking_change_requests_owner_idx on public.booking_change_requests(customer_id,created_at desc);
create index if not exists booking_change_requests_booking_idx on public.booking_change_requests(booking_id,status);

create table if not exists public.machine_favorites (
 user_id uuid not null references public.profiles(id) on delete cascade,
 machine_id uuid not null references public.machines(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,machine_id)
);
create table if not exists public.coupons (
 id uuid primary key default gen_random_uuid(), code text not null unique, description text,
 discount_type text not null check(discount_type in ('percent','fixed')), discount_value integer not null check(discount_value>0),
 minimum_booking_amount integer not null default 0 check(minimum_booking_amount>=0),
 maximum_discount integer check(maximum_discount is null or maximum_discount>0),
 starts_at timestamptz not null default now(), expires_at timestamptz,
 max_redemptions integer check(max_redemptions is null or max_redemptions>0),
 per_user_limit integer not null default 1 check(per_user_limit>0), is_active boolean not null default true,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 check(expires_at is null or expires_at>starts_at), check(discount_type<>'percent' or discount_value<=100)
);
create index if not exists coupons_active_idx on public.coupons(is_active,starts_at,expires_at);
create table if not exists public.coupon_redemptions (
 id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupons(id),
 user_id uuid not null references public.profiles(id), booking_id uuid not null references public.bookings(id) on delete cascade,
 discount_amount integer not null check(discount_amount>0), created_at timestamptz not null default now(),
 unique(coupon_id,booking_id)
);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions(user_id,coupon_id);
create table if not exists public.referrals (
 id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id) on delete cascade,
 referred_phone text not null, referral_code text not null, referred_user_id uuid references public.profiles(id) on delete set null,
 status text not null default 'invited' check(status in ('invited','joined','qualified','rewarded','expired')),
 reward_amount integer not null default 0 check(reward_amount>=0), qualified_at timestamptz, rewarded_at timestamptz,
 created_at timestamptz not null default now(), unique(referrer_id,referred_phone)
);
create index if not exists referrals_owner_idx on public.referrals(referrer_id,created_at desc);
create table if not exists public.booking_reviews (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 customer_id uuid not null references public.profiles(id) on delete cascade, machine_id uuid references public.machines(id) on delete set null,
 rating integer not null check(rating between 1 and 5), comment text, is_visible boolean not null default false,
 created_at timestamptz not null default now(), unique(booking_id,customer_id)
);
create index if not exists booking_reviews_machine_idx on public.booking_reviews(machine_id,is_visible,created_at desc);
create table if not exists public.support_tickets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 subject text not null check(length(trim(subject)) between 4 and 160),
 category text not null default 'general' check(category in ('booking','payment','machine','account','general')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 booking_id uuid references public.bookings(id) on delete set null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id,updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status,priority,updated_at desc);
create table if not exists public.support_messages (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 message text not null check(length(trim(message)) between 1 and 5000), created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id,created_at);
create table if not exists public.driver_attendance (
 id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.profiles(id) on delete cascade,
 attendance_date date not null default current_date,
 status text not null default 'present' check(status in ('present','absent','half_day','leave')),
 check_in timestamptz, check_out timestamptz, notes text, marked_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(driver_id,attendance_date), check(check_out is null or check_in is null or check_out>=check_in)
);
create index if not exists driver_attendance_date_idx on public.driver_attendance(attendance_date desc,driver_id);
create table if not exists public.operator_breaks (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 driver_id uuid not null references public.profiles(id) on delete cascade, started_at timestamptz not null default now(),
 ended_at timestamptz, reason text, created_at timestamptz not null default now(), check(ended_at is null or ended_at>=started_at)
);
create unique index if not exists one_open_break_per_driver on public.operator_breaks(driver_id) where ended_at is null;
create index if not exists operator_breaks_driver_idx on public.operator_breaks(driver_id,started_at desc);
create table if not exists public.job_signoffs (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 driver_id uuid not null references public.profiles(id), customer_id uuid not null references public.profiles(id),
 driver_notes text, customer_name text, customer_confirmed_at timestamptz, created_at timestamptz not null default now(),
 unique(booking_id)
);
create table if not exists public.operator_incentives (
 id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.profiles(id) on delete cascade,
 amount integer not null check(amount>0), reason text not null check(length(trim(reason)) between 2 and 300),
 period_month date not null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists operator_incentives_driver_idx on public.operator_incentives(driver_id,period_month desc);
create table if not exists public.machine_maintenance (
 id uuid primary key default gen_random_uuid(), machine_id uuid not null references public.machines(id) on delete cascade,
 maintenance_type text not null check(maintenance_type in ('service','repair','inspection','insurance','permit','other')),
 description text not null, due_date date, completed_at timestamptz, cost integer not null default 0 check(cost>=0),
 status text not null default 'scheduled' check(status in ('scheduled','in_progress','completed','overdue')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists machine_maintenance_due_idx on public.machine_maintenance(status,due_date);
create table if not exists public.machine_expenses (
 id uuid primary key default gen_random_uuid(), machine_id uuid not null references public.machines(id) on delete cascade,
 booking_id uuid references public.bookings(id) on delete set null,
 category text not null check(category in ('diesel','repair','service','transport','permit','other')),
 amount integer not null check(amount>0), expense_date date not null default current_date, notes text, proof_path text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists machine_expenses_date_idx on public.machine_expenses(expense_date desc,machine_id);

create or replace function private.touch_updated_at() returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function private.touch_updated_at() from public,anon,authenticated;
drop trigger if exists trg_support_tickets_updated on public.support_tickets;
create trigger trg_support_tickets_updated before update on public.support_tickets for each row execute function private.touch_updated_at();
drop trigger if exists trg_driver_attendance_updated on public.driver_attendance;
create trigger trg_driver_attendance_updated before update on public.driver_attendance for each row execute function private.touch_updated_at();
drop trigger if exists trg_machine_maintenance_updated on public.machine_maintenance;
create trigger trg_machine_maintenance_updated before update on public.machine_maintenance for each row execute function private.touch_updated_at();

create or replace function private.validate_coupon_redemption() returns trigger language plpgsql security definer set search_path=''
as $$
declare c public.coupons%rowtype; total_count integer; user_count integer;
begin
 select * into c from public.coupons where id=new.coupon_id for update;
 if not found or not c.is_active or now()<c.starts_at or (c.expires_at is not null and now()>c.expires_at) then raise exception 'Coupon is not active'; end if;
 if new.discount_amount<=0 then raise exception 'Invalid coupon discount'; end if;
 select count(*) into total_count from public.coupon_redemptions where coupon_id=c.id;
 select count(*) into user_count from public.coupon_redemptions where coupon_id=c.id and user_id=new.user_id;
 if c.max_redemptions is not null and total_count>=c.max_redemptions then raise exception 'Coupon redemption limit reached'; end if;
 if user_count>=c.per_user_limit then raise exception 'You have already used this coupon the maximum number of times'; end if;
 if not exists(select 1 from public.bookings b where b.id=new.booking_id and b.customer_id=new.user_id and b.status='pending') then raise exception 'Coupon can only be applied to your own pending booking'; end if;
 return new;
end $$;
revoke all on function private.validate_coupon_redemption() from public,anon,authenticated;
drop trigger if exists trg_validate_coupon_redemption on public.coupon_redemptions;
create trigger trg_validate_coupon_redemption before insert on public.coupon_redemptions for each row execute function private.validate_coupon_redemption();

alter table public.booking_change_requests enable row level security;
alter table public.machine_favorites enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.referrals enable row level security;
alter table public.booking_reviews enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.driver_attendance enable row level security;
alter table public.operator_breaks enable row level security;
alter table public.job_signoffs enable row level security;
alter table public.operator_incentives enable row level security;
alter table public.machine_maintenance enable row level security;
alter table public.machine_expenses enable row level security;

drop policy if exists change_requests_read on public.booking_change_requests;
create policy change_requests_read on public.booking_change_requests for select to authenticated using(customer_id=(select auth.uid()) or private.is_admin());
drop policy if exists change_requests_insert on public.booking_change_requests;
create policy change_requests_insert on public.booking_change_requests for insert to authenticated with check(customer_id=(select auth.uid()) and status='pending' and reviewed_by is null and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=(select auth.uid()) and b.status in ('pending','confirmed')));
drop policy if exists change_requests_admin_update on public.booking_change_requests;
create policy change_requests_admin_update on public.booking_change_requests for update to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists favorites_owner_all on public.machine_favorites;
create policy favorites_owner_all on public.machine_favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists coupons_read_active on public.coupons;
create policy coupons_read_active on public.coupons for select to authenticated using(is_active and now()>=starts_at and (expires_at is null or now()<=expires_at));
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists coupon_redemptions_owner_read on public.coupon_redemptions;
create policy coupon_redemptions_owner_read on public.coupon_redemptions for select to authenticated using(user_id=(select auth.uid()) or private.is_admin());
drop policy if exists coupon_redemptions_owner_insert on public.coupon_redemptions;
create policy coupon_redemptions_owner_insert on public.coupon_redemptions for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists referrals_owner_read on public.referrals;
create policy referrals_owner_read on public.referrals for select to authenticated using(referrer_id=(select auth.uid()) or referred_user_id=(select auth.uid()) or private.is_admin());
drop policy if exists referrals_owner_insert on public.referrals;
create policy referrals_owner_insert on public.referrals for insert to authenticated with check(referrer_id=(select auth.uid()) and status='invited' and referred_user_id is null and reward_amount=0);
drop policy if exists referrals_admin_update on public.referrals;
create policy referrals_admin_update on public.referrals for update to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists reviews_read on public.booking_reviews;
create policy reviews_read on public.booking_reviews for select to authenticated using(is_visible or customer_id=(select auth.uid()) or private.is_admin());
drop policy if exists reviews_customer_insert on public.booking_reviews;
create policy reviews_customer_insert on public.booking_reviews for insert to authenticated with check(customer_id=(select auth.uid()) and is_visible=false and exists(select 1 from public.bookings b where b.id=booking_reviews.booking_id and b.customer_id=(select auth.uid()) and b.status='done' and b.machine_id=booking_reviews.machine_id));
drop policy if exists reviews_admin_update on public.booking_reviews;
create policy reviews_admin_update on public.booking_reviews for update to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists support_tickets_read on public.support_tickets;
create policy support_tickets_read on public.support_tickets for select to authenticated using(user_id=(select auth.uid()) or private.is_admin());
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated with check(user_id=(select auth.uid()) and status='open');
drop policy if exists support_tickets_admin_update on public.support_tickets;
create policy support_tickets_admin_update on public.support_tickets for update to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated using(private.is_admin() or exists(select 1 from public.support_tickets t where t.id=ticket_id and t.user_id=(select auth.uid())));
drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages for insert to authenticated with check(sender_id=(select auth.uid()) and exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.user_id=(select auth.uid()) or private.is_admin())));
drop policy if exists support_messages_admin_update on public.support_messages;
create policy support_messages_admin_update on public.support_messages for update to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists attendance_read on public.driver_attendance;
create policy attendance_read on public.driver_attendance for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists attendance_driver_insert on public.driver_attendance;
create policy attendance_driver_insert on public.driver_attendance for insert to authenticated with check(driver_id=(select auth.uid()) and status='present' and marked_by is null);
drop policy if exists attendance_driver_update on public.driver_attendance;
create policy attendance_driver_update on public.driver_attendance for update to authenticated using(driver_id=(select auth.uid())) with check(driver_id=(select auth.uid()) and status='present' and marked_by is null);
drop policy if exists attendance_admin_all on public.driver_attendance;
create policy attendance_admin_all on public.driver_attendance for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists breaks_read on public.operator_breaks;
create policy breaks_read on public.operator_breaks for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists breaks_driver_insert on public.operator_breaks;
create policy breaks_driver_insert on public.operator_breaks for insert to authenticated with check(driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id));
drop policy if exists breaks_driver_update on public.operator_breaks;
create policy breaks_driver_update on public.operator_breaks for update to authenticated using(driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id)) with check(driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id));
drop policy if exists breaks_admin_all on public.operator_breaks;
create policy breaks_admin_all on public.operator_breaks for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists signoffs_read on public.job_signoffs;
create policy signoffs_read on public.job_signoffs for select to authenticated using(driver_id=(select auth.uid()) or customer_id=(select auth.uid()) or private.is_admin());
drop policy if exists signoffs_driver_insert on public.job_signoffs;
create policy signoffs_driver_insert on public.job_signoffs for insert to authenticated with check(driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id) and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=customer_id and b.status in ('active','done')));
drop policy if exists signoffs_customer_confirm on public.job_signoffs;
create policy signoffs_customer_confirm on public.job_signoffs for update to authenticated using(customer_id=(select auth.uid())) with check(customer_id=(select auth.uid()));
drop policy if exists signoffs_admin_all on public.job_signoffs;
create policy signoffs_admin_all on public.job_signoffs for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists incentives_read on public.operator_incentives;
create policy incentives_read on public.operator_incentives for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists incentives_admin_all on public.operator_incentives;
create policy incentives_admin_all on public.operator_incentives for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists maintenance_admin_all on public.machine_maintenance;
create policy maintenance_admin_all on public.machine_maintenance for all to authenticated using(private.is_admin()) with check(private.is_admin());
drop policy if exists expenses_admin_all on public.machine_expenses;
create policy expenses_admin_all on public.machine_expenses for all to authenticated using(private.is_admin()) with check(private.is_admin());

grant select,insert,update,delete on public.booking_change_requests,public.machine_favorites,public.coupons,public.coupon_redemptions,public.referrals,public.booking_reviews,public.support_tickets,public.support_messages,public.driver_attendance,public.operator_breaks,public.job_signoffs,public.operator_incentives,public.machine_maintenance,public.machine_expenses to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets') then alter publication supabase_realtime add table public.support_tickets; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then alter publication supabase_realtime add table public.support_messages; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='driver_attendance') then alter publication supabase_realtime add table public.driver_attendance; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='booking_change_requests') then alter publication supabase_realtime add table public.booking_change_requests; end if;
end $$;
