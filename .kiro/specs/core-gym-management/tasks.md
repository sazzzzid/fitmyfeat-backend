# Implementation Plan

## Overview

Add Phase 3 member and membership management from `design.md` in this folder. Work lands in `src/modules/members/`, one new migration, and the `manage_members` Permission. Do not add attendance, QR, monitoring, or revenue. Tests run with Vitest. E2E tests use the local embedded Postgres or `TEST_DATABASE_URL`, never the `DATABASE_URL` in `.env`.

## Tasks

- [x] 1. Record Phase 3 in the project rules
  - `AI_RULES.md` still lists members as out of scope. Update the rules before the feature code.
  - _Requirements: 1.1, 9.3_
- [x] 1.1 Add the Phase 3 section to AI_RULES.md
  - Append `# 64. Phase 3: Core Gym Management` pointing at `.kiro/specs/core-gym-management/` and the confirmation date. State that this phase adds Member, Membership_Product, and Membership, the `members` module, and `manage_members`. State that attendance, QR, Super_Admin monitoring, revenue, usage, staff, and branches stay excluded. In §3.1, say member records and memberships as defined in §64 are allowed. Add `members/` to the module tree in §5. In §58, include §64 next to §63. Add one line to `.kiro/steering/gym-saas-phase-1.md` pointing at §64. Leave every other rule as written.
  - _Requirements: 1.1, 9.3, 9.4_

- [x] 2. Add the tables
  - _Requirements: 2.1, 4.1, 5.1, 7.5_
- [x] 2.1 Add the Prisma models
  - Copy the current schema aside, then add `MembershipState`, `Member`, `MembershipProduct`, and `Membership` from the design, plus relation fields on `Gym`. Do not change existing columns. Run `pnpm exec prisma validate` and `pnpm exec prisma generate`.
  - _Requirements: 2.1, 5.1, 7.5_
- [x] 2.2 Add the migration
  - Create a new migration from `prisma migrate diff` against the saved schema, then append the three CHECK constraints from the design. Do not edit earlier migration folders. Confirm foreign keys use `ON DELETE RESTRICT` and `memberships.member_id` is unique.
  - _Requirements: 2.1, 7.5_
- [x] 2.3 Truncate the new tables in the e2e reset
  - Add `"memberships"`, `"membership_products"`, and `"members"` to the `TRUNCATE` in `test/helpers/gym-platform.ts`. Run one existing e2e file against the local database and confirm it still passes.
  - _Requirements: 9.1_

- [x] 3. Add manage_members
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
- [x] 3.1 Seed and expose the Permission
  - Append `manage_members` to `PERMISSIONS`. Add it to `GYM_OWNER_ENABLED` in `platform-seed.service.ts`. Do not add it to the Super_Admin lock set. Extend `test/permission-enforcement.property.e2e-spec.ts` with `GET /members` only after that route exists. Until then, keep the route map building so the new name does not break the suite, using the same partial-map approach Phase 2 used, and restore the full map in task 7.1.
  - _Requirements: 1.1, 1.2, 1.5, 1.6_
- [x] 3.2 Add unit tests for the new Permission defaults
  - Cover a Gym_Owner default of enabled, a Super_Admin default of disabled, and a rejected disable of a Phase 2 locked Permission still using its existing message. Run `pnpm test`.
  - _Requirements: 1.2, 1.5_

- [x] 4. Members
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
- [x] 4.1 Add Member validation
  - Add `member-values.ts` and DTOs. Add `member-values.spec.ts` for name lengths 0, 1, 100, and 101, whitespace-only name and contact, contact length 254 and 255, notes omitted, `null`, 1000, and 1001. Run `pnpm test`.
  - _Requirements: 2.1, 2.2, 3.3_
- [x] 4.2 Add Member routes and the seat check
  - Add `members.module.ts`, `members.service.ts`, and `members.controller.ts` with `GET /members`, `POST /members`, and `PATCH /members/:id`. Import the module from `AppModule`. `createMember` locks the Gym, reads `entitlementsForGym` on that transaction, and inserts only when `maxMembers` is `null` or the count is below it. Extend `entitlementsForGym` with an optional transaction client and keep the current result when it is omitted. Add unit tests for limit 0, a count equal to the limit, `null`, a lowered limit that still allows update, a gym that is not `active`, and a Member id from outside the gym. Run `pnpm test`.
  - _Requirements: 2.3, 2.4, 2.5, 2.7, 3.1, 3.2, 3.4, 3.5, 3.6_
- [x]* 4.3 Write the property test for the seat limit
  - Add an e2e property named `Feature: core-gym-management, Property 1: Seat limit blocks creates only`. For limits `null` and 0 through 5, creates succeed only while the count is below a numeric limit. Two concurrent creates at the boundary leave at most `maxMembers` rows. Run 20 committed examples with `pnpm test:e2e`.
  - **Property 1: Seat limit blocks creates only**
  - **Validates: Requirements 2.5, 2.6, 2.7, 3.6**
  - _Requirements: 2.5, 2.6, 2.7, 3.6_

- [x] 5. Membership products
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
- [x] 5.1 Add product routes
  - Add `GET /membership-products`, `POST /membership-products`, and `PATCH /membership-products/:id` on `MembershipProductsController`. Validate with `parseCreateProduct` and `parseUpdateProduct`. A product write must not write a Membership. Unit-test duration 0, 1, and 3651, a missing field, and an update that leaves a stored Membership snapshot unchanged. Run `pnpm test`.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 6. Assign, renew, freeze, and unfreeze
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4_
- [x] 6.1 Add membership time rules
  - Add `membership-state.ts` with `addDays`, `isInEffect`, `reportedStatus`, and `unfreezeEnd`. Unit-test a 30-day add, frozen reported after the stored end, and an unfreeze that moves the end by the frozen duration. Run `pnpm test`.
  - _Requirements: 6.1, 6.2, 7.2, 8.2, 8.3_
- [x] 6.2 Assign and renew
  - Add `POST /members/:id/membership` and `POST /members/:id/membership/renew`. Follow the design's snapshot, one-membership, inactive-product, and period rules. Renew must not accept a product id. Unit-test each rejection and both renew period cases with fake timers. Run `pnpm test`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
- [x] 6.3 Freeze and unfreeze
  - Add `POST /members/:id/membership/freeze` and `POST /members/:id/membership/unfreeze`. Unit-test freeze of an in-effect Membership, rejection of expired and already frozen, and unfreeze math. Run `pnpm test`.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
- [x]* 6.4 Write the property tests for renew and freeze
  - Add unit properties `Feature: core-gym-management, Property 2: One Membership, and renew follows the period` and `Feature: core-gym-management, Property 3: Freeze pauses the clock`. Run at least 100 examples with `pnpm test`.
  - **Property 2: One Membership, and renew follows the period**
  - **Validates: Requirements 5.2, 6.1, 6.2, 6.4**
  - **Property 3: Freeze pauses the clock**
  - **Validates: Requirements 7.1, 7.2, 8.2**
  - _Requirements: 5.2, 6.1, 6.2, 6.4, 7.1, 7.2, 8.2_

- [x] 7. Finish and verify
  - _Requirements: 1.6, 8.1, 9.1, 9.2, 9.3, 9.4_
- [x] 7.1 Restore the permission route map and add examples
  - Point `manage_members` at `GET /members` in `test/permission-enforcement.property.e2e-spec.ts` and draw from the full `PERMISSIONS` list. Add `test/phase3-examples.e2e-spec.ts` covering each error in the design once, a Member with no Membership, snapshot isolation after a product edit, and an owner who cannot read another gym's Member. Run `pnpm test:e2e`.
  - _Requirements: 1.6, 3.4, 6.7, 8.1, 9.2_
- [x]* 7.2 Write the property test for Gym isolation
  - Add `Feature: core-gym-management, Property 4: Owners cannot cross Gyms` as an e2e property. Run at least 20 examples with `pnpm test:e2e`.
  - **Property 4: Owners cannot cross Gyms**
  - **Validates: Requirements 3.4, 4.4, 9.2**
  - _Requirements: 3.4, 4.4, 9.2_
- [x] 7.3 Run the full verification
  - Run `pnpm exec prisma validate`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` against the local database only. Confirm no Phase 1 or Phase 2 route, request shape, or error message changed, and that no attendance, QR, revenue, or delete route was added.
  - _Requirements: 9.1, 9.3, 9.4_

## Notes

`expired` is computed on read. The stored states are `active` and `frozen`. Seat checks lock the Gym row first. E2E time shifts move stored period columns backward. They do not fake the clock. Optional tasks marked `*` are property tests. Parent tasks are sequencing headers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2"] },
    { "id": 3, "tasks": ["2.3", "4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3"] },
    { "id": 7, "tasks": ["6.4", "7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["7.3"] }
  ]
}
```
