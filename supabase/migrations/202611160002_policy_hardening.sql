-- Policy consolidation / performance follow-up for the initial JCB Rental schema.
drop policy if exists bookings_admin_update on public.bookings;
drop policy if exists bookings_customer_cancel on public.bookings;
drop policy if exists bookings_driver_update on public.bookings;
create policy bookings_update on public.bookings for update to authenticated
using(private.is_admin() or (customer_id=(select auth.uid()) and status='pending') or (driver_id=(select auth.uid()) and status in ('confirmed','active')))
with check(private.is_admin()
 or (customer_id=(select auth.uid()) and status in ('pending','cancelled') and driver_id is null)
 or (driver_id=(select auth.uid()) and status in ('confirmed','active','done')));

drop policy if exists machines_admin_all on public.machines;
create policy machines_admin_insert on public.machines for insert to authenticated with check(private.is_admin());
create policy machines_admin_update on public.machines for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy machines_admin_delete on public.machines for delete to authenticated using(private.is_admin());

drop policy if exists logbook_admin_all on public.logbook;

drop policy if exists locations_driver_write on public.locations;
create policy locations_driver_insert on public.locations for insert to authenticated
with check(private.is_admin() or private.is_assigned_driver(booking_id));
create policy locations_driver_update on public.locations for update to authenticated
using(private.is_admin() or private.is_assigned_driver(booking_id))
with check(private.is_admin() or private.is_assigned_driver(booking_id));

drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using(private.is_admin() or id=(select auth.uid()))
with check(private.is_admin() or (id=(select auth.uid()) and role=private.current_role() and daily_wage=private.current_daily_wage()));

create index if not exists bookings_machine_id_idx on public.bookings(machine_id);
create index if not exists payments_verified_by_idx on public.payments(verified_by);
