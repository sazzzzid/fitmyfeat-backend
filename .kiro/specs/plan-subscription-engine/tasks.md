# Implementation Plan

## Overview

Add the Phase 2 plan and subscription engine to the existing NestJS ESM API (relative imports end in `.js`), following `design.md` in this folder. Work lands in two new modules, `src/modules/plans/` and `src/modules/subscriptions/`, plus small changes to the permission constants, the platform seed, `RolesService`, the exception filter, and the e2e helper. No package is added. Tests run with Vitest (`pnpm test` for `*.spec.ts`, `pnpm test:e2e` for `*.e2e-spec.ts`).

## Tasks

- [x] 1. Record Phase 2 in the project rules
  - Update the rules file first, because `AI_RULES.md` currently lists subscriptions as out of scope and every later task depends on that changing.
  - _Requirements: 1.1, 1.8, 13.4_
- [x] 1.1 Add the Phase 2 section to AI_RULES.md
  - Append `# 63. Phase 2: Plan + Subscription Engine` to `AI_RULES.md`. Name `.kiro/specs/plan-subscription-engine/` as its source and 2026-11-22 as the confirmation date. List what Phase 2 adds: Plan, Subscription, the Entitlements read, `modules/plans/` and `modules/subscriptions/`, the four Permissions with the defaults and locks from the design's permission table, the Phase 2 protected-action mapping, and the reported statuses `trialing`, `pending_payment`, `active`, and `expired`. List what stays excluded, copied from the "Out of scope" paragraph of `requirements.md`. Under §3.1, add one sentence saying manual subscriptions as defined in §63 are allowed and payment gateways stay excluded. Add `plans/` and `subscriptions/` to the module tree in §5. In §58, replace `No Phase 2 functionality introduced` with `No functionality outside Phase 1 and §63`. Add one line to `.kiro/steering/gym-saas-phase-1.md` saying Phase 2 scope is in §63 of `AI_RULES.md`. Leave every other Phase 1 rule as written.
  - _Requirements: 1.1, 1.8, 13.4_

- [x] 2. Add the Plan and Subscription tables
  - Add the two models, the partial unique indexes, and a new migration. The applied Phase 1 migration is not edited.
  - _Requirements: 2.1, 3.1, 3.2, 6.7, 7.3, 13.1, 13.2_
- [x] 2.1 Add the Prisma models
  - Before editing, copy the current schema with `cp prisma/schema.prisma /tmp/phase1-schema.prisma`. Then edit `prisma/schema.prisma` as in the design's Data Models section: add `previewFeatures = ["partialIndexes"]` to the generator, the `SubscriptionStatus` enum mapped to `subscription_status` with only `trialing`, `pending_payment`, and `active`, the `Plan` and `Subscription` models with the two partial unique indexes and the `gym_id` index, and the `subscriptions` relation field on `Gym`. Do not change any existing column, enum value, or `@@map`. Run `pnpm exec prisma validate` and `pnpm exec prisma generate`. If the `partialIndexes` preview feature causes an implementation issue, apply the accepted fallback in the design's Concurrency section: drop the preview flag and the two `where:` uniques from the schema, and write the same two indexes as raw SQL in task 2.2.
  - _Requirements: 2.1, 3.1, 6.7, 7.3_
- [x] 2.2 Add the migration
  - Create `prisma/migrations/20261122120000_plan_subscription_engine/migration.sql` from the output of `pnpm exec prisma migrate diff --from-schema /tmp/phase1-schema.prisma --to-schema prisma/schema.prisma --script`, then append the `plans_values_check` and `subscriptions_state_check` constraints from the design. Confirm the file contains the two `CREATE UNIQUE INDEX … WHERE` statements and foreign keys with `ON DELETE RESTRICT`. The SQL must not insert Permission or Plan rows, because the startup seeds do that. Do not edit `prisma/migrations/20260319120000_init/`.
  - _Requirements: 3.2, 6.7, 7.3, 13.1_
- [x] 2.3 Truncate the new tables in the e2e reset
  - In `test/helpers/gym-platform.ts`, add `"plans"` and `"subscriptions"` to the `TRUNCATE` statement in `resetPlatform`. Run `pnpm test:e2e` and confirm the Phase 1 suites still pass now that `applyMigrations` also applies the new migration.
  - _Requirements: 13.2_

- [x] 3. Add the four Permissions
  - Grow the Permission set to eleven names, seed the defaults on existing data, and lock the two management Permissions on Super_Admin.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
- [x] 3.1 Add the Phase 2 constants
  - Append `view_plans`, `manage_plans`, `manage_subscriptions`, and `manage_gym_subscription`, in that order, after the seven Phase 1 names in `PERMISSIONS` in `src/common/constants/permissions.ts`. Add `src/common/constants/plan-currency.ts` exporting `PLAN_CURRENCY = 'INR' as const`, and `src/common/constants/subscription-status.ts` exporting `SUBSCRIPTION_STATUSES = ['trialing', 'pending_payment', 'active', 'expired'] as const` and its type. Export both from `src/common/constants/index.ts`. `test/permission-enforcement.property.e2e-spec.ts` fails from this point until task 3.4 is done.
  - _Requirements: 1.1, 1.7_
- [x] 3.2 Seed the defaults and backfill every Role
  - In `src/infrastructure/database/platform-seed.service.ts`, add `manage_plans` and `manage_subscriptions` to `SUPER_ADMIN_ENABLED`, and `view_plans` and `manage_gym_subscription` to `GYM_OWNER_ENABLED`. Change the `RolePermission` backfill to load every Role (`role.findMany()` with no name filter) so that custom Roles get the four new rows as disabled. Keep `createMany` with `skipDuplicates`, so no saved state changes. `RolesService.create` already inserts a row for every name in `PERMISSIONS` and needs no change.
  - _Requirements: 1.2, 1.3, 1.4, 1.5_
- [x] 3.3 Lock the two management Permissions on Super_Admin
  - In `RolesService.setPermission`, after the existing Phase 1 lock check and before any write, reject `state === 'disabled'` for `manage_plans` or `manage_subscriptions` on the role named exactly `Super_Admin` with 400 `manage_plans and manage_subscriptions cannot be disabled on Super_Admin`. Leave the Phase 1 lock set and its message unchanged. Add cases to `src/modules/roles/roles.service.spec.ts` for both names being rejected, both being set to enabled, and the Phase 1 message staying the same. Run `pnpm test`.
  - _Requirements: 1.6, 1.7_
- [x] 3.4 Keep the Phase 1 permission property running while routes are added
  - In `test/permission-enforcement.property.e2e-spec.ts`, type `routes` as `Partial<Record<Permission, { method: 'get' | 'post'; path: string }>>` and draw the permission from `Object.keys(routes) as Permission[]` instead of `PERMISSIONS`. Keep the seven existing entries. Task 8.1 restores the full map. Run `pnpm test:e2e`.
  - _Requirements: 1.8_
- [x]* 3.5 Write the property test for the Phase 2 locks
  - Add `src/modules/roles/roles.phase2.property.spec.ts` with a mocked `PrismaService`, named `Feature: plan-subscription-engine, Property 2: Super_Admin cannot drop the Phase 2 management Permissions`. For either of `manage_plans` and `manage_subscriptions` and any states of the other nine Permissions, disabling it on `Super_Admin` is rejected and `rolePermission.update` is not called. Enabling it succeeds and updates only that row. Run at least 100 examples with `pnpm test`.
  - **Property 2: Super_Admin cannot drop the Phase 2 management Permissions**
  - **Validates: Requirements 1.6**
  - _Requirements: 1.6_
- [x]* 3.6 Write the property test for the permission backfill
  - Add `test/permission-backfill.property.e2e-spec.ts` using `test/helpers/gym-platform.ts`, named `Feature: plan-subscription-engine, Property 1: Permission defaults and backfill`. For each example, create random custom Roles with `POST /roles` and set random states of the seven Phase 1 Permissions with `PATCH /roles/permissions`. Then simulate a Phase 1 database by deleting the four Phase 2 `Permission` rows and their `RolePermission` rows through Prisma, record every remaining state, and run `platform.seed.seed()`. Assert the design's default table for Super_Admin, Gym_Owner, and the custom Roles, and assert every recorded Phase 1 state is unchanged. Run the seed a second time and assert nothing changed. Run at least 100 examples with `pnpm test:e2e`.
  - **Property 1: Permission defaults and backfill**
  - **Validates: Requirements 1.2, 1.3, 1.4**
  - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 4. Manage Plans
  - Fill `src/modules/plans/` with the catalog routes and the placeholder seed.
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3_
- [x] 4.1 Collapse repeated validation messages
  - In `messageFromHttpException` in `src/common/filters/platform-exception.filter.ts`, remove repeated strings from an array message before joining with `', '`. Add `src/common/filters/platform-exception.filter.spec.ts`: identical messages collapse to one, distinct messages keep their order, and a string message is returned unchanged. Run `pnpm test`.
  - _Requirements: 3.2, 4.2_
- [x] 4.2 Add the Plan value rules and DTOs
  - Add `src/modules/plans/plan-values.ts` with `parseCreatePlan`, `parseUpdatePlan`, and `toPlanResponse` as described in the design. `undefined` means not submitted, and `null` is valid only for the three limits. Both parsers throw 400 `Plan values are not valid`. Add `CreatePlanDto` and `UpdatePlanDto` under `src/modules/plans/dto/` with an `index.ts`. Every field is `@IsOptional()` plus its type decorators (`@IsString`, `@IsInt`, `@IsBoolean`, or `@IsArray` together with `@IsString({ each: true })`), and each decorator's `message` is `Plan values are not valid`. `UpdatePlanDto` has no `code` property. DTOs contain no range checks and no database access.
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3_
- [x] 4.3 Add the Plan routes
  - Add `src/modules/plans/plans.service.ts`, `plans.controller.ts`, and `plans.module.ts`, and import `PlansModule` in `src/app.module.ts`. `GET /plans` requires `view_plans` and lists active Plans. `GET /plans/all`, `POST /plans` (201), and `PATCH /plans/:code` (200) require `manage_plans`. Lists return `{ "plans": [...] }` ordered by `priceMonthlyPaise` and then `code`, ascending. Map the unique violation on `plans.code` to 409 `Plan code is already used`. An update that matches no code returns 404 `Plan was not found`. No method writes `subscriptions`. There is no delete route.
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 4.1, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3_
- [x] 4.4 Seed the placeholder Plans
  - Add `PlansService.seedDefaultPlans()`, which calls `createMany` with `skipDuplicates` for `basic`, `pro`, and `enterprise`, named `Basic`, `Pro`, and `Enterprise`, with price 0, trial 0, `featureFlags: []`, every limit 0, and `isActive: false`. Add `src/modules/plans/plan-seed.service.ts` (`OnApplicationBootstrap`) that calls it, and provide and export it from `PlansModule`. In `test/helpers/gym-platform.ts`, add `planSeed: PlanSeedService` to `GymPlatform` and call it in `resetPlatform` after the platform seed.
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 4.5 Add unit tests for Plan value boundaries
  - Add `src/modules/plans/plan-values.spec.ts`. Cover code lengths 1, 32, and 33 and an uppercase code, name lengths 0, 1, 64, and 65 and a whitespace-only name, price -1, 0, and 2,147,483,647, trial 0, 365, and 366, 50 and 51 flags, a duplicate flag, a non-integer number, `null` against `undefined` for each limit, an update with no fields, and `isActive` defaulting to `true` on create. Run `pnpm test`.
  - _Requirements: 3.1, 3.2, 4.1, 4.2_
- [x]* 4.6 Write the property test for Plan values
  - Add `src/modules/plans/plans.property.spec.ts` with a mocked `PrismaService`, named `Feature: plan-subscription-engine, Property 3: Plan values are stored exactly or not at all`. Build create bodies from a valid and an invalid generator per field. `PlansService.create` succeeds exactly when every required field is valid and the flags are distinct, and then `plan.create` receives exactly the submitted values with `isActive` defaulting to `true`. Otherwise `plan.create` is not called. Do the same for `update` with at least one field, asserting that `data` holds only the submitted fields. Run at least 100 examples with `pnpm test`.
  - **Property 3: Plan values are stored exactly or not at all**
  - **Validates: Requirements 3.1, 3.2, 4.1, 4.2**
  - _Requirements: 3.1, 3.2, 4.1, 4.2_
- [x]* 4.7 Write the property test for the owner catalog
  - Add `test/plan-catalog.property.e2e-spec.ts`, named `Feature: plan-subscription-engine, Property 4: The owner catalog shows exactly the Available_Plans`. For any set of Plans inserted through Prisma with random codes, prices, and states, `GET /plans` with a Gym_Owner token returns exactly the active ones and `GET /plans/all` with the admin token returns all of them, both ordered by price and then code. Run at least 100 examples with `pnpm test:e2e`.
  - **Property 4: The owner catalog shows exactly the Available_Plans**
  - **Validates: Requirements 4.6, 5.1, 5.2**
  - _Requirements: 4.6, 5.1, 5.2_

- [x] 5. Add the subscription time rules
  - Add the pure helpers that every subscription operation uses, so the date and status logic is tested without a database.
  - _Requirements: 8.1, 9.1, 9.2, 10.1, 11.1, 11.2_
- [x] 5.1 Add the Billing_Period helpers
  - Add `src/modules/subscriptions/billing-period.ts` with `addOneMonthUtc(from)` and `addTrialDays(from, days)` as described in the design, including the three worked examples as unit tests in `src/modules/subscriptions/billing-period.spec.ts`. Run `pnpm test`.
  - _Requirements: 6.1, 8.1, 9.1, 9.2_
- [x] 5.2 Add the status helpers
  - Add `src/modules/subscriptions/subscription-state.ts` with `isInEffect`, `reportedStatus`, `pickCurrent`, `whereReportedStatus`, and `entitlementsFrom`, each taking `now` explicitly. `entitlementsFrom` returns the empty shape `{ plan: null, status: null, featureFlags: [], maxMembers: 0, maxStaff: 0, maxBranches: 0, currentPeriodEnd: null }` when no row is In_Effect.
  - _Requirements: 10.1, 11.1, 11.2_
- [x]* 5.3 Write the property test for reported status and Entitlements
  - Add `src/modules/subscriptions/subscription-state.property.spec.ts`, named `Feature: plan-subscription-engine, Property 10: Reported status and Entitlements follow the stored period`. For any generated rows for one Gym and any `now`, check `reportedStatus`, `pickCurrent` (latest end among `trialing` and `active`), and that `entitlementsFrom` is the empty shape exactly when no row is In_Effect and otherwise equals that row's snapshot. Run at least 100 examples with `pnpm test`.
  - **Property 10: Reported status and Entitlements follow the stored period**
  - **Validates: Requirements 10.1, 11.1, 11.2**
  - _Requirements: 10.1, 11.1, 11.2_

- [x] 6. Add the Gym_Owner subscription actions
  - Fill `src/modules/subscriptions/` with the owner read, Entitlements, trial, and Plan_Request routes.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5_
- [x] 6.1 Add the module and the read routes
  - Add `subscriptions.module.ts` (importing `GymsModule` and exporting `SubscriptionsService`), `subscriptions.controller.ts`, `subscriptions.service.ts`, and `dto/` with `SelectPlanDto` (`planCode`, `@IsOptional() @IsString({ message: 'Plan selection is not valid' })`) and `ListSubscriptionsQueryDto` (`status`, `@IsOptional() @IsIn(SUBSCRIPTION_STATUSES, { message: 'Subscription filter is not valid' })`). Import `SubscriptionsModule` in `src/app.module.ts`. Add a private `lockGym(tx, gymId)` that runs the parameterized `SELECT … FOR UPDATE` from the design. Implement `GET /subscriptions/me` (`getMine`) and `GET /subscriptions/me/entitlements` (`getEntitlements`), both requiring `manage_gym_subscription`, and the public service method `entitlementsForGym(gymId, now)`. Load the Gym only through `GymsService.getMine`. No handler uses Entitlements to allow or deny an action.
  - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5_
- [x] 6.2 Start a trial
  - Add `POST /subscriptions/me/trial` (201) requiring `manage_gym_subscription`, and `startTrial` following the design's step order: input, Gym, Gym active, then inside the locked transaction the Available_Plan, Trial_Days, trial used, and In_Effect checks, then the insert with `snapshot(plan)` and `addTrialDays`. Map a unique violation on `subscriptions_one_trial_per_gym` to 409 `Trial already used`. Leave any Plan_Request unchanged. Add unit cases for each rejection to `src/modules/subscriptions/subscriptions.service.spec.ts` with a mocked `PrismaService` and `GymsService`. Run `pnpm test`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
- [x] 6.3 Request a Plan
  - Add `POST /subscriptions/me/plan-request` (201) requiring `manage_gym_subscription`, and `requestPlan` following the design: the same first checks as `startTrial`, then inside the locked transaction the Available_Plan lookup, 409 `This plan is already in effect` only when the `active` row In_Effect has the same Plan, and either an update of the existing `pending_payment` row's `planId` or an insert with no snapshot and no period. Never write the row In_Effect. Add unit cases for create, replace, the same-Plan block, and a `trialing` row on the same Plan not blocking. Run `pnpm test`.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
- [x] 6.4 Add the active-Gym e2e helper
  - In `test/helpers/gym-platform.ts`, add `activeGymOwner(platform, email)`. It registers the owner, signs in, creates the Gym, saves all five Setup_Fields through the Phase 1 routes, completes setup, activates the Gym with the admin token, and returns `{ token, gymId }`.
  - _Requirements: 6.1, 7.1_
- [x]* 6.5 Write the property test for one trial per Gym
  - Add `test/subscription-trial.property.e2e-spec.ts`, named `Feature: plan-subscription-engine, Property 5: One trial per Gym`. For each example, make an active Gym with `activeGymOwner` and an Available_Plan with random Trial_Days from 1 to 365, then fire 2 to 5 `POST /subscriptions/me/trial` calls with `Promise.all`. Exactly one `trialing` row exists for that Gym, and every other response is 409 `Trial already used`. Move the trial's stored period into the past and assert a new trial on any Plan is still rejected. Run 20 committed examples with `pnpm test:e2e`.
  - **Property 5: One trial per Gym**
  - **Validates: Requirements 6.1, 6.7**
  - _Requirements: 6.1, 6.7_
- [x]* 6.6 Write the property test for one Plan_Request per Gym
  - Add `test/subscription-request.property.e2e-spec.ts`, named `Feature: plan-subscription-engine, Property 6: One Plan_Request per Gym`. For each example, make an active Gym and several Available_Plans, send a random sequence of `POST /subscriptions/me/plan-request` calls one at a time and then a concurrent batch with `Promise.all`. After each step the Gym has at most one `pending_payment` row. After the sequential part its Plan is the last requested Plan. After the concurrent batch its Plan is one of the batch's Plans. Run 20 committed examples with `pnpm test:e2e`.
  - **Property 6: One Plan_Request per Gym**
  - **Validates: Requirements 7.1, 7.2, 7.3**
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Add the Super_Admin subscription actions
  - Add manual payment, renewal, and the Subscription list.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3_
- [x] 7.1 Mark a Subscription paid
  - Add `POST /subscriptions/:id/mark-paid` (200, empty body) requiring `manage_subscriptions`, declared after the `me` routes. Implement `markPaid` as in the design: `isUUID` check and lookup (404 `Subscription was not found`), then inside the transaction locked on the row's Gym: 409 `A trial cannot be marked paid` for `trialing`; for `pending_payment`, end the other row In_Effect at `now` and then set `active` with `snapshot(plan)`, start `now`, and end `addOneMonthUtc(now)`; for `active`, 409 `Only the current subscription can be renewed` unless `pickCurrent` returns this row, otherwise refresh the snapshot and extend from the stored end when In_Effect or restart at `now` when not. Read the Plan by `planId` without checking `isActive`. Return the admin list item. Write nothing outside `subscriptions`.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_
- [x] 7.2 List Subscriptions
  - Add `GET /subscriptions` requiring `manage_subscriptions`, taking `ListSubscriptionsQueryDto`. Build `where` with `whereReportedStatus` when a filter is given. Include the Plan and `gym { gymName, owner { email } }`, order by `createdAt` and then `id` ascending, and return `{ "subscriptions": [...] }` with `gymId`, `gymName`, and `ownerEmail` on each item. Select only `email` from the owner, never `passwordHash`.
  - _Requirements: 12.1, 12.2, 12.3_
- [x] 7.3 Add unit tests for mark-paid branches
  - Extend `src/modules/subscriptions/subscriptions.service.spec.ts` with a mocked transaction client and `vi.setSystemTime`. Cover: activation ending a `trialing` row and an `active` row In_Effect, activation of a Plan that is now inactive, renewal of the current row In_Effect (end moves by one month from the stored end, start kept), renewal of the current expired row (period restarts at `now`), a non-current `active` row, a `trialing` row, a malformed id, and an unknown id. Run `pnpm test`.
  - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_
- [x]* 7.4 Write the property test for snapshot isolation
  - Add `src/modules/subscriptions/snapshot.property.spec.ts` with a mocked `PrismaService`, named `Feature: plan-subscription-engine, Property 8: Plan_Snapshot isolation`. For any Plan values A, start a trial or activate a Plan_Request, then change the mocked Plan to any values B. `getMine` and `entitlementsForGym` still return A. After `markPaid` renews the row they return B. Run at least 100 examples with `pnpm test`.
  - **Property 8: Plan_Snapshot isolation**
  - **Validates: Requirements 4.5, 9.1, 9.2, 11.4**
  - _Requirements: 4.5, 9.1, 9.2, 11.4_
- [x]* 7.5 Write the property test for Billing_Period arithmetic
  - Add `src/modules/subscriptions/billing-period.property.spec.ts`, named `Feature: plan-subscription-engine, Property 9: Billing_Period arithmetic`. For any UTC instant between 2000 and 2100, `addOneMonthUtc` is later, keeps the time of day, lands in the next calendar month, and uses day `min(original day, days in that month)`. With a mocked transaction client, for any stored end and any `now`, renewing the current `active` row writes `addOneMonthUtc(end)` when `end > now` and `addOneMonthUtc(now)` otherwise. Run at least 100 examples with `pnpm test`.
  - **Property 9: Billing_Period arithmetic**
  - **Validates: Requirements 8.1, 9.1, 9.2**
  - _Requirements: 8.1, 9.1, 9.2_
- [x]* 7.6 Write the property test for operation sequences
  - Add `test/subscription-sequence.property.e2e-spec.ts`, named `Feature: plan-subscription-engine, Property 7: Operation sequences keep one Subscription In_Effect and leave Phase 1 data alone`. For each example, make an active Gym, record its `gyms`, `user_accounts`, and `owner_profiles` rows and the `GET /dashboard` body, then run a random sequence of trial starts, Plan_Requests, mark-paid calls on any of the Gym's Subscription ids, and time steps that move all of that Gym's stored periods backward by the same random interval. After every step, count the Gym's rows In_Effect with SQL and assert at most one. At the end, assert the recorded rows are byte-for-byte unchanged and the dashboard body is equal. Run at least 50 examples with `pnpm test:e2e`.
  - **Property 7: Operation sequences keep one Subscription In_Effect and leave Phase 1 data alone**
  - **Validates: Requirements 8.1, 8.4, 13.1, 13.2, 13.3**
  - _Requirements: 8.1, 8.4, 13.1, 13.2, 13.3_

- [x] 8. Finish and verify
  - Restore full permission coverage, add the example tests, and run every check `AI_RULES.md` §58 requires.
  - _Requirements: 1.7, 1.8, 2.1, 11.2, 13.3_
- [x] 8.1 Restore the full permission route map
  - In `test/permission-enforcement.property.e2e-spec.ts`, type `routes` as `Record<Permission, …>` again and draw from `PERMISSIONS`. Add `view_plans: GET /plans`, `manage_plans: GET /plans/all`, `manage_subscriptions: GET /subscriptions`, and `manage_gym_subscription: GET /subscriptions/me`. Run `pnpm test:e2e`.
  - _Requirements: 1.8_
- [x] 8.2 Add the Phase 2 example tests
  - Add `test/phase2-examples.e2e-spec.ts` using `test/helpers/gym-platform.ts`. Cover each message in the design's error table once, the three seeded Plans present and inactive after reset, the empty Entitlements body for an active Gym with no Subscription, `GET /roles` returning eleven permission states for each Role, and `GET /dashboard` still returning exactly the four Phase 1 keys. Run `pnpm test:e2e`.
  - _Requirements: 1.6, 1.7, 2.1, 3.3, 4.3, 4.4, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 7.4, 8.2, 8.3, 9.3, 11.2, 12.3, 13.3_
- [x] 8.3 Run the full verification
  - Run `pnpm exec prisma validate`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e`, and fix anything that fails. Confirm no Phase 1 route path, request shape, or error message changed, no response selects `passwordHash`, and no payment provider, scheduled job, or new package was added. Report the change summary in the format of `AI_RULES.md` §59.
  - _Requirements: 1.7, 13.2, 13.3, 13.4_

- [ ] 9. Report whether a Subscription is a trial
  - Added after the first implementation pass. Every Subscription response gains `isTrial`, so clients can tell an expired trial from an expired paid Subscription.
  - _Requirements: 10.7, 12.1_
- [ ] 9.1 Add `isTrial` to Subscription responses
  - Add `isTrial: boolean` to `SubscriptionResponse` in `src/modules/subscriptions/subscriptions.service.ts`, set from `row.status === 'trialing'` in `toSubscriptionResponse`. `AdminSubscriptionResponse` and `getMine` inherit it. Entitlements do not change. Write the unit cases in `subscriptions.service.spec.ts` first: a trial response is `true`, a Plan_Request and a marked-paid row are `false`, an expired trial in `getMine` and in `list('expired')` is `true`, and an expired paid row is `false`. Run `pnpm test`.
  - _Requirements: 10.7, 12.1_
- [ ] 9.2 Cover `isTrial` end to end
  - In `test/phase2-examples.e2e-spec.ts`, add a case where a trial is replaced by a paid Plan, then assert that `GET /subscriptions?status=expired` returns the trial with `isTrial: true` and that the active row and `GET /subscriptions/me` `current` have `isTrial: false`. Run `pnpm test:e2e` against the local embedded Postgres only.
  - _Requirements: 10.7, 12.1_

## Notes

Prices are whole paise in INR. Limits use `null` for unlimited, and empty Entitlements use `0`. The stored subscription states are `trialing`, `pending_payment`, and `active`; `expired` is computed on read. Every subscription write locks the Gym row first, and partial unique indexes back the one-trial and one-request rules in the database. Phase 2 never writes `gyms`, `user_accounts`, or `owner_profiles`. E2E tests simulate time by moving stored periods backward, not by faking the clock, because access tokens expire after one hour. Optional tasks marked `*` are the property tests for the correctness properties in the design. Parent tasks are sequencing headers. The waves below list only the numbered subtasks, and subtasks that edit the same file are in different waves.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "3.4", "4.2", "5.2"] },
    { "id": 3, "tasks": ["2.3", "3.5", "4.3", "4.5", "5.3"] },
    { "id": 4, "tasks": ["3.6", "4.4", "4.6"] },
    { "id": 5, "tasks": ["4.7", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.4"] },
    { "id": 7, "tasks": ["6.3"] },
    { "id": 8, "tasks": ["6.5", "6.6", "7.1"] },
    { "id": 9, "tasks": ["7.2"] },
    { "id": 10, "tasks": ["7.3", "7.4", "7.5", "7.6", "8.1"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["8.3"] },
    { "id": 13, "tasks": ["9.1"] },
    { "id": 14, "tasks": ["9.2"] }
  ]
}
```
