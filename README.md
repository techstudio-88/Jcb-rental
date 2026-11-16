# JCB Rental

A role-based Next.js PWA for customers, machine operators and the rental owner. The app uses Supabase Auth, Postgres, Realtime and private Storage.

## Current implementation

- Customer: phone OTP, three-step monthly/hourly/daily booking wizard, server-validated rate estimate, pending cancellation, active-job map with live timer, live notifications, logbook, payment submission, print-to-PDF invoice.
- Driver: assigned duties, work timer that restores after reload, GPS updates while active, screen wake lock where supported, diesel/repair entries with camera/gallery proof.
- Admin: booking approval/rejection and driver assignment, fleet/rate management, payment verification, monthly revenue/expense summary, per-machine totals, CSV export, team roles, attendance and wage estimates.
- Phase 2 customer tools: database-synced machine favourites, pending/confirmed booking change requests with owner approval, coupon application with server-calculated discounts and redemption limits, referral invitations/reward tracking, completed-booking reviews with owner moderation, and support tickets with live threaded replies.
- Phase 2 operator tools: accept/decline assigned duties, GPS arrival check-in, Google Maps navigation, breakdown reporting, work-completion sign-off, attendance check-in/out, active-duty breaks, incentive history and monthly salary records with owner payout status.
- Phase 2 owner tools: support inbox, booking-change approvals, review moderation, coupon publishing, referral qualification/rewarding, maintenance calendar, machine expense ledger, attendance register, incentive controls and salary calculation/payout tracking.
- PWA: install manifest with 192px/512px icons, service worker, mobile-first shell, animated splash/onboarding, bottom sheets, animated counters, confetti, skeleton loading and Android install prompt.
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

The schema and follow-up hardening are recorded in `supabase/migrations/202611160001_initial_schema.sql`, `202611160002_policy_hardening.sql`, `202611160003_booking_security_hardening.sql`, `202611160004_photo_proof_heic.sql`, `202611160005_diesel_log_realtime.sql`, `20261116152844_phase_2_customer_operator_owner_modules.sql`, `20261116153132_phase_2_coupon_and_review_integrity.sql`, `20261116153149_phase_2_operator_payroll.sql`, `20261116153312_phase_2_rls_performance_hardening.sql`, `20261116153417_phase_2_driver_job_events.sql`, `20261116153454_phase_2_driver_event_policy_hardening.sql`, and `20261116153511_phase_2_one_coupon_per_booking.sql`, and `20261116153625_phase_2_driver_record_guardrails.sql`. The Phase 2 migrations are applied to project `efxsauiaxwnloqgnlxuj`.

1. In Supabase Authentication → Providers → Phone, enable phone login and configure an SMS provider (Twilio or MSG91/another supported provider). Without this, real customer OTP delivery will not work.
2. For controlled development only, configure Supabase test OTP numbers/codes; do not use a public hardcoded OTP in production.
3. In Supabase Authentication → URL Configuration, add the production Vercel URL and local `http://localhost:3000` to allowed redirect URLs.
4. Have the owner sign in once using their own phone number.
5. Promote that already-created profile to admin in SQL Editor (replace the phone number with the owner's verified number, including +91):
   ```sql
   update public.profiles set role='admin', name='Owner'
   where phone='+91XXXXXXXXXX';
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

- **Sign-in:** the app provides a clearly labelled, read-only demo mode (any 4–6 digit code) for previews and a separate real Supabase phone-OTP mode. Demo profiles are local only and cannot access or change live business data. Real accounts require a supported SMS provider configured in Supabase.
- **UPI:** add the owner's correct UPI ID to Vercel as `NEXT_PUBLIC_UPI_ID`. The app records a payment submission; the owner manually verifies it. It is not an automatic payment gateway.
- **GPS:** browser geolocation and screen wake lock are best-effort. Mobile browsers may pause GPS when backgrounded or the device is locked. Continuous background tracking needs a native Android/iOS wrapper and platform permissions.
- **Monthly billing:** the schema supports a month count; the fixed monthly rate is multiplied by that count (partial months are not prorated).\n- **GST:** 18% is currently an estimate in the UI. Confirm the applicable GST rate, GSTIN, invoice numbering and invoice legal fields with the owner's CA before issuing tax invoices.
- **Business data:** the owner must enter actual machine models, registration numbers, rates, service area, contact details and operator wages. No fake fleet rows are seeded.
- **Maps:** OpenStreetMap tiles are used; production usage should respect tile usage policy and may require a dedicated tile provider at scale.
- **PWA install:** Android uses the in-app Install button when Chrome exposes it. On iPhone/iPad, open the app in Safari → Share → Add to Home Screen. Play Store / App Store native distribution requires a wrapper and owner-controlled developer accounts.
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

## Native Android / iOS packaging

The app now has a Capacitor 7 shell and a static Next.js export (`out/`) for native packaging.

```bash
npm install
npm run build
npx cap add android       # first time only
npx cap add ios           # first time only, on macOS
npx cap sync
npm run cap:android
npm run cap:ios
```

- Native package ID: `com.techstudio.jcbrental` (confirm/change before the first store submission; changing it later creates a different store app).
- Native integrations: device status bar, keyboard resize, splash screen, hardware back navigation, haptic taps, native share sheet, device/platform detection, network connectivity, deep-link event bridge, native geolocation permission/watch, and native preferences helper.
- Android/iOS debug build and unsigned release artifacts are built by `.github/workflows/native-build.yml`. The Android AAB and iOS archive are unsigned; they are not yet store-submittable.
- The owner must provide Play App Signing / upload-key credentials, Apple Developer team membership and signing certificates/profiles, final app icon/screenshots, privacy-policy URL, support contact, age/content rating answers, and store listing copy before publishing.
- Real OTP still requires a configured SMS provider. Remove the temporary read-only demo option before public store release. Demo roles are local previews only and never authenticate to or access real business records.
- Background GPS is not enabled. Tracking is foreground/active-job only; continuous background tracking needs additional platform-specific background-location implementation and disclosure.
- Push notifications require Firebase/APNs configuration and server-side delivery credentials; they are not enabled by this packaging foundation.
- Complete real-device QA is required for OTP, permissions, camera/photo proof, map tracking, offline recovery, payments, and invoices on current Android and iOS devices.

## Added owner analytics

The owner Insights tab summarizes six-month verified revenue, booking completion, average booking value, outstanding receivables, fleet utilization, repeat customers, rental-plan mix, payment channels, top customers, operator hours/performance, and highest-revenue machine. Booking lists can also be exported to CSV.

## Phase 03 release readiness

The current CI artifacts are **unsigned release candidates**, not store-submittable builds. Native CI sets `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false`; the deployed web preview can continue to expose its isolated read-only demo. Run `npm run release:preflight -- --web`, `--android` or `--ios` after the corresponding build. See [RELEASE_READINESS.md](./RELEASE_READINESS.md) for the audited status, security/tenancy limitations and exact release gates. In particular, the current database is a single-business workspace and must not be used as a multi-tenant SaaS until tenant-scoped schema and RLS are implemented and tested.
