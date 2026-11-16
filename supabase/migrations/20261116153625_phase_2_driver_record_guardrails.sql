-- Prevent operators from backdating attendance or changing their own attendance state.
-- Operators can only check in now and check out once; owners retain full control.
create or replace function private.guard_phase2_driver_records() returns trigger language plpgsql set search_path=''
as $$
begin
 if private.is_admin() then return new; end if;
 if tg_table_name='driver_attendance' then
  if tg_op='INSERT' then
   if new.driver_id<>(select auth.uid()) or new.status<>'present' or new.marked_by is not null
      or new.attendance_date<>(now() at time zone 'Asia/Kolkata')::date
      or new.check_in is null or new.check_in<now()-interval '5 minutes' or new.check_in>now()+interval '5 minutes'
      or new.check_out is not null then raise exception 'Invalid operator check-in'; end if;
  else
   if old.driver_id<>(select auth.uid()) or new.driver_id is distinct from old.driver_id
      or new.attendance_date is distinct from old.attendance_date or new.status is distinct from old.status
      or new.marked_by is distinct from old.marked_by or new.check_in is distinct from old.check_in
      or new.notes is distinct from old.notes or old.check_out is not null or new.check_out is null
      or new.check_out<now()-interval '5 minutes' or new.check_out>now()+interval '5 minutes'
      then raise exception 'Only a current check-out can be changed by the operator'; end if;
  end if;
 elsif tg_table_name='operator_breaks' then
  if tg_op='INSERT' then
   if new.driver_id<>(select auth.uid()) or not private.is_assigned_driver(new.booking_id)
      or new.started_at<now()-interval '5 minutes' or new.started_at>now()+interval '5 minutes'
      or new.ended_at is not null then raise exception 'Invalid operator break start'; end if;
  else
   if old.driver_id<>(select auth.uid()) or new.driver_id is distinct from old.driver_id
      or new.booking_id is distinct from old.booking_id or new.started_at is distinct from old.started_at
      or new.reason is distinct from old.reason or new.created_at is distinct from old.created_at
      or old.ended_at is not null or new.ended_at is null
      or new.ended_at<now()-interval '5 minutes' or new.ended_at>now()+interval '5 minutes'
      then raise exception 'Only the current break can be ended by the operator'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_phase2_driver_records() from public,anon,authenticated;
drop trigger if exists trg_guard_driver_attendance on public.driver_attendance;
create trigger trg_guard_driver_attendance before insert or update on public.driver_attendance for each row execute function private.guard_phase2_driver_records();
drop trigger if exists trg_guard_operator_breaks on public.operator_breaks;
create trigger trg_guard_operator_breaks before insert or update on public.operator_breaks for each row execute function private.guard_phase2_driver_records();
revoke update on public.job_signoffs from authenticated;
grant update(customer_name,customer_confirmed_at) on public.job_signoffs to authenticated;
