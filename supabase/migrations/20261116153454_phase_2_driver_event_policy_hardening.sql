-- Separate driver insert permissions from owner administration for job events.
drop policy if exists driver_job_events_admin_all on public.driver_job_events;
drop policy if exists driver_job_events_read on public.driver_job_events;
create policy driver_job_events_read on public.driver_job_events for select to authenticated using(private.can_access_booking(booking_id) or private.is_admin());
drop policy if exists driver_job_events_driver_insert on public.driver_job_events;
create policy driver_job_events_driver_insert on public.driver_job_events for insert to authenticated
with check(private.is_admin() or (driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id) and event_type in ('accepted','rejected','arrived','breakdown','completed')));
create policy driver_job_events_admin_update on public.driver_job_events for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy driver_job_events_admin_delete on public.driver_job_events for delete to authenticated using(private.is_admin());
