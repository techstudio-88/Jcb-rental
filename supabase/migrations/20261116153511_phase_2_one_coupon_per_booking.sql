-- Prevent stacking multiple coupon redemptions on one booking.
create unique index if not exists coupon_redemptions_one_per_booking on public.coupon_redemptions(booking_id);
