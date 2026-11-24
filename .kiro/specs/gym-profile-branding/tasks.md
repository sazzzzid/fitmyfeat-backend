# Implementation Plan

## Overview

Add optional gym profile fields and gym branding from `design.md` in this folder. Work stays in `src/modules/gyms/`, one migration, and the shared gym response. Do not add a permission, a file upload, or an audit row. Tests run with Vitest. E2E tests use the local embedded Postgres or `TEST_DATABASE_URL`, never the `DATABASE_URL` in `.env`.

The decisions at the top of `requirements.md` are confirmed.

## Tasks

- [x] 1. Record the rules
  - _Requirements: 3.1, 3.2_
- [x] 1.1 Add §68 to AI_RULES.md
  - Append `# 68. Gym profile fields and branding` pointing at `.kiro/specs/gym-profile-branding/` and the confirmation date 2026-11-23. In §3.1, say file upload stays excluded. In §58, include §68. Add one line to `.kiro/steering/gym-saas-phase-1.md`.
  - _Requirements: 3.1, 3.4_

- [x] 2. Add the columns and table
  - _Requirements: 1.1, 2.1_
- [x] 2.1 Add the Prisma models
  - Add `contactEmail`, `description`, and `mapsUrl` on `Gym`, plus `BrandingTheme`, `BrandingButtonStyle`, and `GymBranding`. Run `pnpm exec prisma validate` and `pnpm exec prisma generate`.
  - _Requirements: 1.1, 2.2_
- [x] 2.2 Add the migration
  - Create `prisma/migrations/20261123180000_gym_profile_branding` from the design. Do not edit earlier migration folders. Append the CHECK constraints.
  - _Requirements: 1.1, 2.3_
- [x] 2.3 Truncate the new table in the e2e reset
  - Add `gym_branding` to the `TRUNCATE` in `test/helpers/gym-platform.ts`.
  - _Requirements: 3.4_

- [x] 3. Profile fields
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
- [x] 3.1 Validate and store the three fields
  - Accept them only on `PATCH /gyms/me/profile`. `null` clears. Invalid values use `Gym profile values are not valid` and write nothing. Setup completion still uses the five existing fields. Pending and active gyms stay locked.
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
- [x] 3.2 Return the fields on every gym response
  - Add the three keys in `toGym`. Copy them in the staff gym response so the shared type stays complete. Existing rows and new gyms return null.
  - _Requirements: 1.1, 1.2_

- [x] 4. Branding
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_
- [x] 4.1 Add the branding routes
  - `GET /gyms/me/branding` returns defaults without inserting. `PATCH` creates on first save, keeps omitted fields, uppercases colours, and does not change gym status. Unknown keys and empty bodies write nothing.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

- [x] 5. Tests
  - _Requirements: 1.3, 1.4, 1.7, 1.8, 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8_
- [x] 5.1 Add unit and property specs
  - Cover email, description, and map validation, including `javascript:` and `http:`. Cover null clearing, setup completeness, the status lock, colour case, enums, and partial branding updates.
  - _Requirements: 1.4, 1.7, 1.8, 2.3, 2.4, 2.5_
- [x] 5.2 Add the e2e examples
  - Defaults for a new gym, a patch that persists, branding on an active gym, another owner's gym left untouched, 404 with no gym, and 403 when `manage_gym_setup` is disabled.
  - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 2.8_
- [x] 5.3 Run the suite
  - Run `pnpm test` and `pnpm test:e2e`. Existing gym tests change only to expect the three new null keys.
  - _Requirements: 1.2, 3.2_
