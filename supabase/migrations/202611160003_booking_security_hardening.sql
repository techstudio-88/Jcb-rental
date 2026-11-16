-- Booking price integrity, exclusive machine allocation and operator log protection.
create or replace function private.prepare_customer_booking()
returns trigger language plpgsql set search_path=''
as $$
declare m public.machines%rowtype;
begin
 if new.customer_id=(select auth.uid()) and not private.is_admin() then
  if new.driver_id is not null or new.status<>'pending' then raise exception 'Customer bookings must start pending without an assigned driver'; end if;
  select * into m from public.machines where id=new.machine_id and status='free' for share;
  if not found then raise exception 'Selected machine is not currently available'; end if;
  if new.type='monthly' then new.quoted_rate:=case when new.with_diesel then m.monthly_diesel else m.monthly_no_diesel end;
  elsif new.type='daily' then new.quoted_rate:=case when m.daily_rate>0 then m.daily_rate else m.hourly_rate*8 end;
  elsif new.type='hourly' then new.quoted_rate:=m.hourly_rate;
  end if;
  if new.type='hourly' and coalesce(new.duration_hours,0)<=0 then raise exception 'Hourly bookings require a positive duration'; end if;
  if new.type='daily' and coalesce(new.duration_days,0)<=0 then raise exception 'Daily bookings require a positive duration'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.prepare_customer_booking() from public,anon,authenticated;
drop trigger if exists trg_prepare_customer_booking on public.bookings;
create trigger trg_prepare_customer_booking before insert on public.bookings for each row execute function private.prepare_customer_booking();

alter table public.bookings drop constraint if exists bookings_duration_hours_check;
alter table public.bookings add constraint bookings_duration_hours_check check(duration_hours is null or duration_hours>0);
alter table public.bookings drop constraint if exists bookings_duration_days_check;
alter table public.bookings add constraint bookings_duration_days_check check(duration_days is null or duration_days>0);
create unique index if not exists one_confirmed_or_active_booking_per_machine
on public.bookings(machine_id) where machine_id is not null and status in ('confirmed','active');

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update to authenticated
using(private.is_admin() or (customer_id=(select auth.uid()) and status='pending') or (driver_id=(select auth.uid()) and status in ('confirmed','active')))
with check(private.is_admin()
 or (customer_id=(select auth.uid()) and status in ('pending','cancelled') and driver_id is null)
 or (driver_id=(select auth.uid()) and status='active'));

create or replace function private.guard_logbook_updates()
returns trigger language plpgsql set search_path=''
as $$
begin
 if private.is_assigned_driver(old.booking_id) and not private.is_admin() then
  if new.booking_id is distinct from old.booking_id or new.start_at is distinct from old.start_at
     or new.created_at is distinct from old.created_at
     or (old.end_at is not null and new.end_at is distinct from old.end_at)
     or (new.end_at is not null and new.end_at>now()) then
    raise exception 'Operators can only end their own running work session';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_logbook_updates() from public,anon,authenticated;
drop trigger if exists trg_guard_logbook_updates on public.logbook;
create trigger trg_guard_logbook_updates before update on public.logbook for each row execute function private.guard_logbook_updates();

drop policy if exists diesel_logs_insert on public.diesel_logs;
create policy diesel_logs_insert on public.diesel_logs for insert to authenticated
with check(private.is_admin() or (private.is_assigned_driver(booking_id) and photo_path like (select auth.uid())::text || '/%'));

revoke update(phone) on public.profiles from authenticated;
