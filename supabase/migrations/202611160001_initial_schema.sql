-- JCB Rental production schema. Applied directly to Supabase project efxsauiaxwnloqgnlxuj.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'customer' check(role in ('customer','driver','admin')),
 name text, phone text, daily_wage integer not null default 0 check(daily_wage>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.machines (
 id uuid primary key default gen_random_uuid(), model text not null, reg_no text, photo_url text,
 status text not null default 'free' check(status in ('free','busy','maintenance')),
 hourly_rate integer not null default 0 check(hourly_rate>=0),
 daily_rate integer not null default 0 check(daily_rate>=0),
 monthly_diesel integer not null default 0 check(monthly_diesel>=0),
 monthly_no_diesel integer not null default 0 check(monthly_no_diesel>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.bookings (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.profiles(id),
 machine_id uuid references public.machines(id), driver_id uuid references public.profiles(id),
 type text not null check(type in ('monthly','hourly','daily')),
 site_address text not null, work_type text not null, start_date date not null,
 duration_hours numeric(8,2), duration_days integer, months integer not null default 1 check(months between 1 and 36),
 with_diesel boolean not null default true, quoted_rate integer not null default 0 check(quoted_rate>=0),
 status text not null default 'pending' check(status in ('pending','confirmed','active','done','cancelled','rejected')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.logbook (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 start_at timestamptz not null default now(), end_at timestamptz, created_at timestamptz not null default now(),
 check(end_at is null or end_at>=start_at)
);
create table if not exists public.diesel_logs (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 kind text not null check(kind in ('diesel','repair')), litres numeric(10,2) check(litres is null or litres>=0),
 amount integer not null default 0 check(amount>=0), photo_path text not null, notes text, created_at timestamptz not null default now()
);
create table if not exists public.locations (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 lat double precision not null check(lat between -90 and 90), lng double precision not null check(lng between -180 and 180),
 accuracy_m numeric(10,2), updated_at timestamptz not null default now()
);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id) on delete cascade,
 amount integer not null check(amount>0), method text not null check(method in ('UPI','Bank','Cash')),
 reference text, status text not null default 'pending' check(status in ('pending','verified','rejected')),
 created_at timestamptz not null default now(), verified_at timestamptz, verified_by uuid references public.profiles(id)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text not null, read boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists bookings_customer_created_idx on public.bookings(customer_id,created_at desc);
create index if not exists bookings_driver_status_idx on public.bookings(driver_id,status);
create index if not exists logbook_booking_start_idx on public.logbook(booking_id,start_at);
create index if not exists diesel_logs_booking_created_idx on public.diesel_logs(booking_id,created_at desc);
create index if not exists payments_booking_created_idx on public.payments(booking_id,created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create unique index if not exists one_open_log_per_booking on public.logbook(booking_id) where end_at is null;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin') $$;
create or replace function private.current_role() returns text language sql stable security definer set search_path=''
as $$ select p.role from public.profiles p where p.id=(select auth.uid()) $$;
create or replace function private.current_daily_wage() returns integer language sql stable security definer set search_path=''
as $$ select p.daily_wage from public.profiles p where p.id=(select auth.uid()) $$;
create or replace function private.can_access_booking(bid uuid) returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.bookings b where b.id=bid and (b.customer_id=(select auth.uid()) or b.driver_id=(select auth.uid()) or private.is_admin())) $$;
create or replace function private.is_assigned_driver(bid uuid) returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.bookings b where b.id=bid and b.driver_id=(select auth.uid())) $$;
revoke all on function private.is_admin() from public,anon;
revoke all on function private.current_role() from public,anon;
revoke all on function private.current_daily_wage() from public,anon;
revoke all on function private.can_access_booking(uuid) from public,anon;
revoke all on function private.is_assigned_driver(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(),private.current_role(),private.current_daily_wage(),private.can_access_booking(uuid),private.is_assigned_driver(uuid) to authenticated;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.profiles(id,phone,name) values(new.id,new.phone,nullif(new.raw_user_meta_data->>'name','')) on conflict(id) do nothing; return new; end $$;
revoke all on function private.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.notify_booking_changes() returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='INSERT' then
  insert into public.notifications(user_id,title,body) select p.id,'New booking request',coalesce(new.type,'')||' booking at '||coalesce(new.site_address,'') from public.profiles p where p.role='admin';
 elsif new.status is distinct from old.status then
  insert into public.notifications(user_id,title,body) values(new.customer_id,'Booking '||new.status,'Your booking status is now '||new.status);
  if new.status='confirmed' and new.driver_id is not null then insert into public.notifications(user_id,title,body) values(new.driver_id,'New duty assigned','Site: '||coalesce(new.site_address,'')); end if;
 end if;
 return new;
end $$;
revoke all on function private.notify_booking_changes() from public,anon,authenticated;
drop trigger if exists trg_notify_booking on public.bookings;
create trigger trg_notify_booking after insert or update of status on public.bookings for each row execute function private.notify_booking_changes();

create or replace function private.notify_payment_changes() returns trigger language plpgsql security definer set search_path=''
as $$
declare customer uuid;
begin
 select b.customer_id into customer from public.bookings b where b.id=new.booking_id;
 if tg_op='INSERT' then
  insert into public.notifications(user_id,title,body) select p.id,'Payment submitted','₹'||new.amount::text||' via '||new.method from public.profiles p where p.role='admin';
 elsif new.status is distinct from old.status and customer is not null then
  insert into public.notifications(user_id,title,body) values(customer,'Payment '||new.status,'₹'||new.amount::text);
 end if;
 return new;
end $$;
revoke all on function private.notify_payment_changes() from public,anon,authenticated;
drop trigger if exists trg_notify_payment on public.payments;
create trigger trg_notify_payment after insert or update of status on public.payments for each row execute function private.notify_payment_changes();

create or replace function private.guard_booking_updates() returns trigger language plpgsql set search_path=''
as $$
begin
 if (select auth.uid())=old.customer_id and not private.is_admin() then
  if new.customer_id is distinct from old.customer_id or new.machine_id is distinct from old.machine_id or new.driver_id is distinct from old.driver_id
  or new.type is distinct from old.type or new.site_address is distinct from old.site_address or new.work_type is distinct from old.work_type
  or new.start_date is distinct from old.start_date or new.duration_hours is distinct from old.duration_hours or new.duration_days is distinct from old.duration_days
  or new.months is distinct from old.months or new.with_diesel is distinct from old.with_diesel or new.quoted_rate is distinct from old.quoted_rate
  or new.status not in ('pending','cancelled') then raise exception 'Customers can only cancel pending bookings'; end if;
 end if;
 if (select auth.uid())=old.driver_id and not private.is_admin() then
  if new.customer_id is distinct from old.customer_id or new.machine_id is distinct from old.machine_id or new.driver_id is distinct from old.driver_id
  or new.type is distinct from old.type or new.site_address is distinct from old.site_address or new.work_type is distinct from old.work_type
  or new.start_date is distinct from old.start_date or new.duration_hours is distinct from old.duration_hours or new.duration_days is distinct from old.duration_days
  or new.months is distinct from old.months or new.with_diesel is distinct from old.with_diesel or new.quoted_rate is distinct from old.quoted_rate
  or new.status not in ('confirmed','active','done') then raise exception 'Drivers can only update their assigned booking status'; end if;
 end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function private.guard_booking_updates() from public,anon,authenticated;
drop trigger if exists trg_guard_booking_updates on public.bookings;
create trigger trg_guard_booking_updates before update on public.bookings for each row execute function private.guard_booking_updates();

alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.bookings enable row level security;
alter table public.logbook enable row level security;
alter table public.diesel_logs enable row level security;
alter table public.locations enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using(id=(select auth.uid()) or private.is_admin()
 or exists(select 1 from public.bookings b where b.customer_id=(select auth.uid()) and b.driver_id=profiles.id)
 or exists(select 1 from public.bookings b where b.driver_id=(select auth.uid()) and b.customer_id=profiles.id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid()))
with check(id=(select auth.uid()) and role=private.current_role() and daily_wage=private.current_daily_wage());
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated using(private.is_admin()) with check(true);

drop policy if exists machines_select on public.machines;
create policy machines_select on public.machines for select to authenticated using(true);
drop policy if exists machines_admin_all on public.machines;
create policy machines_admin_all on public.machines for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select to authenticated using(customer_id=(select auth.uid()) or driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists bookings_customer_insert on public.bookings;
create policy bookings_customer_insert on public.bookings for insert to authenticated with check(customer_id=(select auth.uid()) and status='pending' and driver_id is null);
drop policy if exists bookings_customer_cancel on public.bookings;
create policy bookings_customer_cancel on public.bookings for update to authenticated using(customer_id=(select auth.uid()) and status='pending')
with check(customer_id=(select auth.uid()) and status in ('pending','cancelled') and driver_id is null);
drop policy if exists bookings_driver_update on public.bookings;
create policy bookings_driver_update on public.bookings for update to authenticated using(driver_id=(select auth.uid()) and status in ('confirmed','active'))
with check(driver_id=(select auth.uid()) and status in ('confirmed','active','done'));
drop policy if exists bookings_admin_update on public.bookings;
create policy bookings_admin_update on public.bookings for update to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists logbook_select on public.logbook;
create policy logbook_select on public.logbook for select to authenticated using(private.can_access_booking(booking_id));
drop policy if exists logbook_driver_insert on public.logbook;
create policy logbook_driver_insert on public.logbook for insert to authenticated with check(private.is_assigned_driver(booking_id) and exists(select 1 from public.bookings b where b.id=booking_id and b.status in ('confirmed','active')));
drop policy if exists logbook_driver_update on public.logbook;
create policy logbook_driver_update on public.logbook for update to authenticated using(private.is_assigned_driver(booking_id)) with check(private.is_assigned_driver(booking_id));
drop policy if exists logbook_admin_all on public.logbook;
create policy logbook_admin_all on public.logbook for all to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists diesel_logs_select on public.diesel_logs;
create policy diesel_logs_select on public.diesel_logs for select to authenticated using(private.is_admin() or private.is_assigned_driver(booking_id));
drop policy if exists diesel_logs_insert on public.diesel_logs;
create policy diesel_logs_insert on public.diesel_logs for insert to authenticated with check(private.is_admin() or private.is_assigned_driver(booking_id));
drop policy if exists diesel_logs_admin_update on public.diesel_logs;
create policy diesel_logs_admin_update on public.diesel_logs for update to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated using(private.can_access_booking(booking_id));
drop policy if exists locations_driver_write on public.locations;
create policy locations_driver_write on public.locations for all to authenticated using(private.is_assigned_driver(booking_id) or private.is_admin()) with check(private.is_assigned_driver(booking_id) or private.is_admin());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using(private.can_access_booking(booking_id));
drop policy if exists payments_customer_insert on public.payments;
create policy payments_customer_insert on public.payments for insert to authenticated with check(status='pending' and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=(select auth.uid())));
drop policy if exists payments_admin_update on public.payments;
create policy payments_admin_update on public.payments for update to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

revoke all on public.profiles,public.machines,public.bookings,public.logbook,public.diesel_logs,public.locations,public.payments,public.notifications from anon,public;
grant usage on schema public to authenticated;
grant select,insert,delete on public.profiles to authenticated;
grant update(name,phone,role,daily_wage) on public.profiles to authenticated;
grant select,insert,update,delete on public.machines,public.bookings,public.logbook,public.diesel_logs,public.locations,public.payments to authenticated;
grant select,update(read) on public.notifications to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('proofs','proofs',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists proofs_driver_upload on storage.objects;
create policy proofs_driver_upload on storage.objects for insert to authenticated with check(bucket_id='proofs' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists proofs_read_own on storage.objects;
create policy proofs_read_own on storage.objects for select to authenticated using(bucket_id='proofs' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.is_admin()));

do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bookings') then alter publication supabase_realtime add table public.bookings; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='locations') then alter publication supabase_realtime add table public.locations; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='payments') then alter publication supabase_realtime add table public.payments; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='logbook') then alter publication supabase_realtime add table public.logbook; end if;
end $$;

-- Remove public execution from the pre-existing helper that was flagged by Supabase Security Advisor.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
