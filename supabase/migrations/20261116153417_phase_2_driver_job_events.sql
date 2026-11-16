-- Operator assignment response, arrival, breakdown and completion event history.
create table if not exists public.driver_job_events (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 driver_id uuid not null references public.profiles(id) on delete cascade,
 event_type text not null check(event_type in ('accepted','rejected','arrived','breakdown','completed')),
 latitude double precision check(latitude is null or latitude between -90 and 90),
 longitude double precision check(longitude is null or longitude between -180 and 180),
 notes text, created_at timestamptz not null default now()
);
create index if not exists driver_job_events_booking_idx on public.driver_job_events(booking_id,created_at desc);
create index if not exists driver_job_events_driver_idx on public.driver_job_events(driver_id,created_at desc);
alter table public.driver_job_events enable row level security;
create policy driver_job_events_read on public.driver_job_events for select to authenticated using(private.can_access_booking(booking_id));
create policy driver_job_events_driver_insert on public.driver_job_events for insert to authenticated
with check(driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id) and event_type in ('accepted','rejected','arrived','breakdown','completed'));
create policy driver_job_events_admin_all on public.driver_job_events for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update,delete on public.driver_job_events to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='driver_job_events') then alter publication supabase_realtime add table public.driver_job_events; end if;
end $$;
