# JCB Rental

A role-based Next.js PWA for customers, machine operators and the rental owner. The app uses Supabase Auth, Postgres, Realtime and private Storage.

## Current implementation

- Customer: phone OTP, monthly/hourly/daily booking, rate estimate, pending cancellation, active-job map, live notifications, logbook, payment submission, print-to-PDF invoice.
- Driver: assigned duties, work timer that restores after reload, GPS updates while active, screen wake lock where supported, diesel/repair entries with camera/gallery proof.
- Admin: booking approval/rejection and driver assignment, fleet/rate management, payment verification, monthly revenue/expense summary, per-machine totals, CSV export, team roles, attendance and wage estimates.
- PWA: install manifest, service worker, mobile-first shell, animated splash and bottom-sheet UI.
- Backend: role-aware RLS, private helper schema, booking/payment notifications, Realtime publication and private photo-proof bucket.

## Stack

- Next.js 15.5.29 / React 19.1.2
- Supabase JS 2.58.0
- Framer Motion 12.23.24
- React Leaflet 5.0.0 + Leaflet 1.9.4

## Environment variables

Set these in Vercel for Production, Preview and Development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://efxsauiaxwnloqgnlxuj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_UPI_ID=owner@upi
```

The first two are provisioned in the currently linked Vercel project. The UPI ID is intentionally not guessed; add the actual business UPI ID before enabling UPI deep links.

Never add a Supabase service-role/secret key to a NEXT_PUBLIC variable or the browser bundle.

## Supabase setup / owner bootstrap

The schema and follow-up hardening are recorded in `supabase/migrations/202611160001_initial_schema.sql` and `supabase/migrations/202611160002_policy_hardening.sql`. Both were applied directly to project `efxsauiaxwnloqgnlxuj`.

1. In Supabase Authentication → Providers → Phone, enable phone login and configure an SMS provider (Twilio or MSG91/another supported provider). Without this, real customer OTP delivery will not work.
2. For controlled development only, configure Supabase test OTP numbers/codes; do not use a public hardcoded OTP in production.
3. In Supabase Authentication → URL Configuration, add the production Vercel URL and local `http://localhost:3000` to allowed redirect URLs.
4. Have the owner sign in once using their own phone number.
5. Promote that already-created profile to admin in SQL Editor (replace the phone number with the owner's number, digits only):
   ```sql
   update public.profiles set role='admin', name='Owner'
   where phone='91XXXXXXXXXX';
   ```
6. The owner signs out and back in to refresh the role, then adds the real fleet, rates and drivers in Team.

Do not promote an unverified phone number. Admin access is granted from the database, not from user-editable metadata.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The browser geolocation API requires HTTPS in production (localhost is allowed).

## Known operational limits / required owner inputs

- **SMS OTP:** provider credentials and phone-auth enablement must be configured in Supabase by the account owner.
- **UPI:** add the owner's correct UPI ID to Vercel as `NEXT_PUBLIC_UPI_ID`. The app records a payment submission; the owner manually verifies it. It is not an automatic payment gateway.
- **GPS:** browser geolocation and screen wake lock are best-effort. Mobile browsers may pause GPS when backgrounded or the device is locked. Continuous background tracking needs a native Android/iOS wrapper and platform permissions.
- **GST:** 18% is currently an estimate in the UI. Confirm the applicable GST rate, GSTIN, invoice numbering and invoice legal fields with the owner's CA before issuing tax invoices.
- **Business data:** the owner must enter actual machine models, registration numbers, rates, service area, contact details and operator wages. No fake fleet rows are seeded.
- **Maps:** OpenStreetMap tiles are used; production usage should respect tile usage policy and may require a dedicated tile provider at scale.
- **App stores:** this is an installable PWA. Play Store / App Store native distribution requires a wrapper and owner-controlled developer accounts.
- **Commercial document:** the build specification itself flags a ₹20,000 quotation vs ₹19,000 contract mismatch. Reconcile the signed commercial documents separately.

## Verification checklist

1. OTP send/verify with a configured test number or real SMS provider.
2. First user profile creation and customer-only row visibility.
3. Owner promotion and admin role routing.
4. Customer booking insert and pending cancellation; customer cannot read another customer's bookings.
5. Admin approval, driver assignment, rejection and completion.
6. Driver start/end, timer restore after reload and repeat shifts.
7. Driver-only GPS upsert and customer/admin location read.
8. Driver photo upload; driver/admin read; unrelated users denied.
9. Customer payment submission; admin verify/reject; notifications.
10. Invoice print dialog, reports and CSV export.
11. PWA install and mobile device testing.

## Security notes

All application tables have RLS enabled. Private proof images are stored in a non-public bucket. The service-role key is never shipped to the client. Role checks are performed from database profiles through non-exposed helper functions; customers can only cancel their own pending bookings, and drivers are restricted to their assigned work.
