-- Index Phase 2 foreign keys and consolidate permissive role policies.
create index if not exists booking_change_requests_reviewed_by_idx on public.booking_change_requests(reviewed_by);
create index if not exists booking_reviews_customer_idx on public.booking_reviews(customer_id);
create index if not exists coupon_redemptions_booking_idx on public.coupon_redemptions(booking_id);
create index if not exists coupons_created_by_idx on public.coupons(created_by);
create index if not exists driver_attendance_marked_by_idx on public.driver_attendance(marked_by);
create index if not exists job_signoffs_customer_idx on public.job_signoffs(customer_id);
create index if not exists job_signoffs_driver_idx on public.job_signoffs(driver_id);
create index if not exists machine_expenses_booking_idx on public.machine_expenses(booking_id);
create index if not exists machine_expenses_created_by_idx on public.machine_expenses(created_by);
create index if not exists machine_expenses_machine_idx on public.machine_expenses(machine_id);
create index if not exists machine_favorites_machine_idx on public.machine_favorites(machine_id);
create index if not exists machine_maintenance_created_by_idx on public.machine_maintenance(created_by);
create index if not exists machine_maintenance_machine_idx on public.machine_maintenance(machine_id);
create index if not exists operator_breaks_booking_idx on public.operator_breaks(booking_id);
create index if not exists operator_incentives_created_by_idx on public.operator_incentives(created_by);
create index if not exists operator_payroll_paid_by_idx on public.operator_payroll(paid_by);
create index if not exists referrals_referred_user_idx on public.referrals(referred_user_id);
create index if not exists support_messages_sender_idx on public.support_messages(sender_id);
create index if not exists support_tickets_booking_idx on public.support_tickets(booking_id);

drop policy if exists coupons_read_active on public.coupons;
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_select on public.coupons for select to authenticated using(private.is_admin() or (is_active and now()>=starts_at and (expires_at is null or now()<=expires_at)));
create policy coupons_admin_insert on public.coupons for insert to authenticated with check(private.is_admin());
create policy coupons_admin_update on public.coupons for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy coupons_admin_delete on public.coupons for delete to authenticated using(private.is_admin());

drop policy if exists attendance_admin_all on public.driver_attendance;
drop policy if exists attendance_read on public.driver_attendance;
create policy attendance_read on public.driver_attendance for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists attendance_driver_insert on public.driver_attendance;
create policy attendance_driver_insert on public.driver_attendance for insert to authenticated with check(private.is_admin() or (driver_id=(select auth.uid()) and status='present' and marked_by is null));
drop policy if exists attendance_driver_update on public.driver_attendance;
create policy attendance_driver_update on public.driver_attendance for update to authenticated using(private.is_admin() or driver_id=(select auth.uid())) with check(private.is_admin() or (driver_id=(select auth.uid()) and status='present' and marked_by is null));
create policy attendance_admin_delete on public.driver_attendance for delete to authenticated using(private.is_admin());

drop policy if exists breaks_admin_all on public.operator_breaks;
drop policy if exists breaks_read on public.operator_breaks;
create policy breaks_read on public.operator_breaks for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
drop policy if exists breaks_driver_insert on public.operator_breaks;
create policy breaks_driver_insert on public.operator_breaks for insert to authenticated with check(private.is_admin() or (driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id)));
drop policy if exists breaks_driver_update on public.operator_breaks;
create policy breaks_driver_update on public.operator_breaks for update to authenticated using(private.is_admin() or (driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id))) with check(private.is_admin() or (driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id)));
create policy breaks_admin_delete on public.operator_breaks for delete to authenticated using(private.is_admin());

drop policy if exists signoffs_admin_all on public.job_signoffs;
drop policy if exists signoffs_read on public.job_signoffs;
create policy signoffs_read on public.job_signoffs for select to authenticated using(driver_id=(select auth.uid()) or customer_id=(select auth.uid()) or private.is_admin());
drop policy if exists signoffs_driver_insert on public.job_signoffs;
create policy signoffs_driver_insert on public.job_signoffs for insert to authenticated with check(private.is_admin() or (driver_id=(select auth.uid()) and private.is_assigned_driver(booking_id) and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=customer_id and b.status in ('active','done'))));
drop policy if exists signoffs_customer_confirm on public.job_signoffs;
create policy signoffs_customer_confirm on public.job_signoffs for update to authenticated using(private.is_admin() or customer_id=(select auth.uid())) with check(private.is_admin() or customer_id=(select auth.uid()));
create policy signoffs_admin_delete on public.job_signoffs for delete to authenticated using(private.is_admin());

drop policy if exists incentives_admin_all on public.operator_incentives;
drop policy if exists incentives_read on public.operator_incentives;
create policy incentives_read on public.operator_incentives for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
create policy incentives_admin_insert on public.operator_incentives for insert to authenticated with check(private.is_admin());
create policy incentives_admin_update on public.operator_incentives for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy incentives_admin_delete on public.operator_incentives for delete to authenticated using(private.is_admin());

drop policy if exists payroll_admin_all on public.operator_payroll;
drop policy if exists payroll_read on public.operator_payroll;
create policy payroll_read on public.operator_payroll for select to authenticated using(driver_id=(select auth.uid()) or private.is_admin());
create policy payroll_admin_insert on public.operator_payroll for insert to authenticated with check(private.is_admin());
create policy payroll_admin_update on public.operator_payroll for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy payroll_admin_delete on public.operator_payroll for delete to authenticated using(private.is_admin());
