-- Harden coupon redemption calculation and review ownership checks.
create or replace function private.validate_coupon_redemption() returns trigger
language plpgsql security definer set search_path=''
as $$
declare c public.coupons%rowtype; b public.bookings%rowtype; total_count integer; user_count integer; booking_base integer; expected_discount integer;
begin
 select * into c from public.coupons where id=new.coupon_id for update;
 if not found or not c.is_active or now()<c.starts_at or (c.expires_at is not null and now()>c.expires_at) then raise exception 'Coupon is not active'; end if;
 select * into b from public.bookings where id=new.booking_id and customer_id=new.user_id and status='pending';
 if not found then raise exception 'Coupon can only be applied to your own pending booking'; end if;
 booking_base := greatest(0,coalesce(b.quoted_rate,0)) *
   case when b.type='monthly' then greatest(1,coalesce(b.months,1))
        when b.type='daily' then greatest(1,coalesce(b.duration_days,1))
        else greatest(1,coalesce(b.duration_hours,1)::integer) end;
 if booking_base<c.minimum_booking_amount then raise exception 'Booking does not meet coupon minimum amount'; end if;
 if c.discount_type='percent' then expected_discount:=round(booking_base*c.discount_value/100.0)::integer; else expected_discount:=c.discount_value; end if;
 if c.maximum_discount is not null then expected_discount:=least(expected_discount,c.maximum_discount); end if;
 expected_discount:=least(booking_base,greatest(0,expected_discount));
 if expected_discount<=0 then raise exception 'Coupon does not apply to this booking'; end if;
 select count(*) into total_count from public.coupon_redemptions where coupon_id=c.id;
 select count(*) into user_count from public.coupon_redemptions where coupon_id=c.id and user_id=new.user_id;
 if c.max_redemptions is not null and total_count>=c.max_redemptions then raise exception 'Coupon redemption limit reached'; end if;
 if user_count>=c.per_user_limit then raise exception 'You have already used this coupon the maximum number of times'; end if;
 new.discount_amount:=expected_discount;
 return new;
end $$;
revoke all on function private.validate_coupon_redemption() from public,anon,authenticated;
drop policy if exists reviews_customer_insert on public.booking_reviews;
create policy reviews_customer_insert on public.booking_reviews for insert to authenticated
with check(customer_id=(select auth.uid()) and is_visible=false and exists(
 select 1 from public.bookings b where b.id=booking_reviews.booking_id and b.customer_id=(select auth.uid())
 and b.status='done' and b.machine_id=booking_reviews.machine_id
));
