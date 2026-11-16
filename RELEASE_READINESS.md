# JCB Rental — Phase 03 release readiness

Last audited: 16 November 2026  
Repository: `techstudio-88/Jcb-rental` (`main`)  
Supabase project: `efxsauiaxwnloqgnlxuj`  
Vercel project: `jcb-rental`

## Verified in the connected project

- The latest GitHub Actions run before this release-hardening change (run `43898617824`, commit `102782f1aa69320c7e6da31818bc6ad84255db46`) completed successfully for the static web export, Android build and unsigned iOS archive.
- The Android workflow generated a debug APK and a release AAB using Gradle. The AAB was built with signing disabled/not configured; it is not a Play Store upload artifact.
- The iOS workflow generated an archive with `CODE_SIGNING_ALLOWED=NO`; it is not an App Store upload artifact.
- Supabase project is `ACTIVE_HEALTHY` on PostgreSQL 17.
- Supabase security advisor returned zero security lints at the time of audit.
- Supabase performance advisor returned informational unused-index findings. Do not drop those indexes solely from this notice; re-evaluate after real workload exists.
- The Vercel production deployment at the time of audit was `READY`.
- The repo contains a Capacitor 7 wrapper and PWA manifest/icons.
- Native CI now builds Android and iOS with `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false`, so the read-only demo path is hidden and saved demo sessions are ignored in native release candidates. The web preview keeps its demo mode.
- A release preflight script checks the static export, manifest/icons, known privileged Supabase credential patterns in client bundles, and expected native artifacts.

## Release blockers — do not mark Phase 03 complete until cleared

### Signing and store ownership

- Android: configure a protected upload keystore and its passwords/alias in GitHub Actions secrets; verify Play App Signing and produce a signed AAB.
- iOS: use an Apple Developer team, distribution certificate, provisioning profile and App Store Connect credentials on a protected macOS release runner; produce a signed archive and validate it with Apple's tooling.
- Store ownership, account agreements, tax/banking setup and review submissions must be completed by the account owner.

Never commit signing files, passwords, API keys or provisioning credentials to the repository or paste them into chat.

### Identity, communications and native capabilities

- Configure and test a real Supabase phone SMS provider and OTP delivery; demo codes are not production authentication.
- Configure FCM/APNs credentials and server-side push delivery; push is not enabled by this build foundation.
- Implement and test background location only after the Android/iOS background permission disclosures, persistent notification/indicator, battery behaviour and consent flow are approved. Current GPS tracking is foreground/active-job only.
- Biometric unlock, encrypted offline mutation queue/conflict resolution and app-update prompts are not verified as complete native capabilities.

### Security and tenancy

- Current schema is a **single rental-business workspace**. The profile model has role values for customer, driver and admin; the audited public schema does not include a business/organization tenant key or organization membership model. Do not onboard unrelated rental companies into this database as separate tenants until tenant IDs, tenant-scoped foreign keys, RLS policies, storage paths, realtime filters, and cross-tenant isolation tests are implemented.
- A Super Admin / organization subscription control plane is not present in this schema.
- Database migration history currently reports the Phase 2 migrations; reconcile the recorded history with the five base SQL migration files in the repository before relying on automated migration deploys. Do not blindly reapply base DDL to the live project.
- Run negative RLS tests using at least two real customer accounts, two operators and the owner. The current schema advisor result is useful but does not prove row-level isolation for every workflow.

### Business and store operations

- Configure and test the owner's real UPI/payment provider. Current payment claims require manual owner verification; there is no automatic payment-gateway settlement integration.
- Confirm GSTIN, tax rate, invoice numbering and legally required invoice fields with the business's CA before issuing tax invoices.
- Publish a privacy policy, terms, support contact, data-retention/deletion process, location disclosure and store permission rationale.
- Complete Android and iOS real-device testing: login/OTP, booking, role isolation, GPS permission/denial, camera/gallery, upload recovery, offline/online transitions, notifications, payment claims, invoice export, keyboard/safe areas and app lifecycle.
- Configure crash/error monitoring and database backup/restore drills.

## Release artifact workflow

GitHub Actions workflow: `.github/workflows/native-build.yml`

Artifacts are intentionally labelled **unsigned release candidates**. The CI pipeline disables demo login for native builds and runs:

```bash
npm run build
npm run release:preflight -- --web
npm run release:preflight -- --android
npm run release:preflight -- --ios
```

The checks are build/package smoke checks, not a substitute for authenticated end-to-end, device, penetration or store validation.

## Current release decision

**Not store-ready yet.** Build compilation is verified; signing, live SMS/push configuration, background tracking, multi-tenant architecture, full negative authorization tests and real-device QA remain release gates. Keep the existing production deployment available for controlled use, but do not advertise this build as a fully launched multi-company SaaS or submit its unsigned artifacts to either store.
