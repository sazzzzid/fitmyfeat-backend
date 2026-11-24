# Implementation Plan

## Overview

Add Phase 4 staff, role templates, and the staff audit log from `design.md` in this folder. Work lands in `src/modules/staff/`, the member-route guard, one new migration, the `manage_staff` Permission, and the `Gym_Staff` Role. Do not add attendance, QR, branches, payroll, or a general audit system. Tests run with Vitest. E2E tests use the local embedded Postgres or `TEST_DATABASE_URL`, never the `DATABASE_URL` in `.env`.

The decisions to correct before implementation are listed at the top of `requirements.md`.

## Tasks

- [x] 1. Record Phase 4 in the project rules
  - The rules still treated staff as out of scope. Point them at this spec before the feature code.
  - _Requirements: 1.1, 8.1_
- [x] 1.1 Add the Phase 4 section to AI_RULES.md
  - Append `# 65. Phase 4: Staff + Permissions` pointing at `.kiro/specs/staff-permissions/` and the confirmation date 2026-11-22. State that this phase adds Role_Template, Staff_Member, the `Gym_Staff` Role, `manage_staff`, `maxStaff` enforcement, the staff audit log, and `src/modules/staff/`. State that attendance, QR, branches, payroll, notifications, and Super_Admin staff monitoring stay excluded. In §3.1, say staff accounts as defined in §65 are allowed. In §4, keep Phase 1 itself free of staff and point at §65. Add `staff/` to the module tree in §5. In §58, include §65 next to §64. Add one line to `.kiro/steering/gym-saas-phase-1.md` pointing at §65.
  - _Requirements: 1.1, 8.1, 8.3_

- [x] 2. Add the tables
  - _Requirements: 2.1, 3.1, 5.1, 7.1_
- [x] 2.1 Add the Prisma models
  - Copy the current schema aside, then add `StaffTitle`, `RoleTemplate`, `StaffMember`, and `AuditLog` from the design, plus relation fields on `UserAccount` and `Gym`. Do not change existing columns. Run `pnpm exec prisma validate` and `pnpm exec prisma generate`.
  - _Requirements: 2.1, 3.1, 7.1_
- [x] 2.2 Add the migration
  - Create a new migration from `prisma migrate diff` against the saved schema, then append the three CHECK constraints from the design. Do not edit earlier migration folders. Confirm foreign keys use `ON DELETE RESTRICT`, `staff_members.user_id` is unique, and template names are limited to `Owner`, `Manager`, and `Staff`.
  - _Requirements: 2.1, 2.7, 7.1_
- [x] 2.3 Truncate the new tables in the e2e reset
  - Use the `TRUNCATE` list from the design in `test/helpers/gym-platform.ts`. `resetPlatform` already calls `platform.seed.seed()` afterward. Run one existing e2e file against the local database and confirm it still passes.
  - _Requirements: 8.6_

- [x] 3. Add manage_staff and Gym_Staff
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
- [x] 3.1 Seed the Permission, the Role, and the templates
  - Append `manage_staff` to `PERMISSIONS` and add `Gym_Staff` to `ROLE_NAMES`. Add `manage_staff` to `GYM_OWNER_ENABLED` only. In `PlatformSeedService.seed`, upsert the `Gym_Staff` Role with the two existing roles, and create each missing template with the seeded flags and `sortOrder` 1, 2, and 3. Do not update a template that already exists. Do not add `manage_staff` to a Super_Admin lock set. Add `manage_staff: { method: 'get', path: '/staff' }` to the route map in `test/permission-enforcement.property.e2e-spec.ts` only after that route exists. Until then, keep the route map building so the new name does not break the suite, using the same partial-map approach Phase 3 used, and restore the full map in task 8.1.
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 2.1, 2.2_
- [x] 3.2 Add unit tests for the new defaults
  - Cover Gym_Owner `manage_staff` enabled, Super_Admin and Gym_Staff disabled, a new role disabled, and a rejected disable of a Phase 1 and a Phase 2 locked Permission still using its existing message. Assert the three template defaults and that a second seed does not overwrite a changed template flag. Run `pnpm test`.
  - _Requirements: 1.2, 1.4, 1.5, 1.6, 2.1, 2.2_
- [x] 3.3 Block staff role changes
  - In `UsersService.assignRole`, reject a user who already has a Staff_Member with 409 `Staff role cannot be changed`, and reject `roleName` `Gym_Staff` with 400 `Role assignment is not valid`. Add unit tests for both, and for an ordinary assignment that still succeeds. Run `pnpm test`.
  - _Requirements: 1.8, 1.9_

- [x] 4. Role templates
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_
- [x] 4.1 Add template routes
  - Add `GET /role-templates` and `PATCH /role-templates/:name` on `RoleTemplatesController`, guarded by `manage_roles`. Validate with `parseTemplateUpdate`. A template write must not write a Staff_Member. Return templates in Owner, Manager, Staff order. Unit-test an empty body, a non-boolean flag, an unknown name, and an update that leaves a stored staff row unchanged. Run `pnpm test`.
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 5. Staff management
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.3, 5.4, 5.5, 5.6_
- [x] 5.1 Add staff validation
  - Add `staff-values.ts` and DTOs. Add `staff-values.spec.ts` for a missing field, a whitespace-only name, name lengths 1, 100, and 101, a password of length 0 and 129, a title outside the three names, a template outside the three names, an update with no fields, and an update that sends both a template and a flag. Run `pnpm test`.
  - _Requirements: 3.1, 3.2, 4.2, 4.3, 4.4_
- [x] 5.2 Add staff routes and the seat check
  - Add `staff.module.ts`, `staff.service.ts`, and `staff.controller.ts` with `GET /staff`, `POST /staff`, `PATCH /staff/:id`, `POST /staff/:id/disable`, and `POST /staff/:id/enable`. Import the module from `AppModule` and export `StaffService`. `createStaff` and `enable` lock the Gym, read `entitlementsForGym` on that transaction, and write only when `maxStaff` is `null` or the count of rows with `disabledAt` null is below it. Create hashes the password with bcrypt cost 12 and returns no hash. Unit-test limit 0, a count equal to the limit, `null`, a lowered limit that still allows update, a gym that is not `active`, a duplicate email, a staff id from outside the gym, disable twice, and enable over the limit. Run `pnpm test`.
  - _Requirements: 3.1, 3.3, 3.5, 3.6, 3.7, 3.9, 3.10, 4.1, 4.5, 4.6, 4.7, 5.1, 5.3, 5.4, 5.5, 5.6_
- [x]* 5.3 Write the property test for the seat limit
  - Add an e2e property named `Feature: staff-permissions, Property 1: Seat limit blocks creates and enables only`. For limits `null` and 0 through 5, creates and enables succeed only while the active count is below a numeric limit. Two concurrent creates at the boundary leave at most `maxStaff` active rows. Run 20 committed examples with `pnpm test:e2e`.
  - **Property 1: Seat limit blocks creates and enables only**
  - **Validates: Requirements 3.7, 3.8, 3.9, 4.7, 5.4, 5.6**
  - _Requirements: 3.7, 3.8, 3.9, 4.7, 5.4, 5.6_

- [x] 6. Staff access on member routes
  - _Requirements: 5.2, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
- [x] 6.1 Add the member-access guard
  - Add `@RequireMemberAccess('view' | 'create' | 'manage')` and handle it in `PermissionsGuard` as the design describes. Replace `@RequirePermission('manage_members')` on the member and membership-product routes with the level from the design table. A Staff_Member is authorized only by the matching flag. A caller with no staff row still needs `manage_members`. Unit-test the four cases: staff flag on, staff flag off, disabled staff, and a Gym_Owner with `manage_members` on and off. Run `pnpm test`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_
- [x] 6.2 Resolve the caller's Gym
  - Add `StaffService.gymForCaller` and use it from `MembersService` in place of `getMine`. An owner still resolves through the owned Gym. A staff caller resolves through `staff_members.gym_id`. The active-gym error on member routes stays `Member management requires an active gym`. Unit-test an owner, a staff caller, a disabled staff caller, and a user with neither. Run `pnpm test`.
  - _Requirements: 6.5, 6.6_
- [x] 6.3 Sign-in and the current-user payload
  - After a successful password check, `AuthService.signIn` rejects a disabled Staff_Member with 403 `Staff account is disabled` and does not issue a token. A wrong password stays 401 with the existing message. `currentUser` adds the `staff` object from the design only when a row exists. Unit-test both sign-in cases and an owner response that does not include `staff`. Run `pnpm test`.
  - _Requirements: 5.2, 5.7, 5.8_
- [x]* 6.4 Write the property test for flags and Gym isolation
  - Add `Feature: staff-permissions, Property 3: Staff flags stay inside one Gym` as an e2e property. Cover each flag combination against one route of each level, a disabled token, and a second Gym. Run at least 20 examples with `pnpm test:e2e`.
  - **Property 3: Staff flags stay inside one Gym**
  - **Validates: Requirements 5.8, 6.1, 6.2, 6.3, 6.4, 6.5**
  - _Requirements: 5.8, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Audit log
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
- [x] 7.1 Write one entry per successful change
  - Inside the same transaction as each template update, staff create, staff update, disable, and enable, insert one `AuditLog` row using the detail shapes in the design. A rejected write inserts nothing. A template update does not update staff rows. Unit-test a rolled-back create, a password change whose detail has `passwordChanged` and no password field, and a template update whose stored staff flags stay put. Run `pnpm test`.
  - _Requirements: 7.1, 7.2, 7.3, 7.8_
- [x] 7.2 Add the audit read
  - Add `GET /audit-log` with required `scope`. `platform` requires `manage_roles` and returns rows whose `gymId` is null. `gym` requires `manage_staff` and returns rows for the caller's active Gym. Order by `createdAt` descending, then `id` descending. Unit-test a missing scope, a gym caller asking for platform scope, and a staff entry from another Gym. Run `pnpm test`.
  - _Requirements: 7.4, 7.5, 7.6, 7.7_
- [x]* 7.3 Write the property test for audit rows
  - Add unit property `Feature: staff-permissions, Property 2: Template edits do not change stored staff` and `Feature: staff-permissions, Property 4: Audit rows match successful writes`. Run at least 100 examples with `pnpm test`.
  - **Property 2: Template edits do not change stored staff**
  - **Validates: Requirements 2.4, 4.3, 4.7**
  - **Property 4: Audit rows match successful writes**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.8**
  - _Requirements: 2.4, 4.3, 4.7, 7.1, 7.2, 7.3, 7.8_

- [x] 8. Finish and verify
  - _Requirements: 1.7, 1.10, 6.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
- [x] 8.1 Restore the permission route map and add examples
  - Point `manage_staff` at `GET /staff` in `test/permission-enforcement.property.e2e-spec.ts` and draw from the full `PERMISSIONS` list. Add `test/phase4-examples.e2e-spec.ts` covering each error in the design once, registration still returning `Gym_Owner`, a Gym_Owner member call that still succeeds, a staff caller rejected from `GET /dashboard` and `GET /roles`, and a template edit that does not change a staff row. Run `pnpm test:e2e`.
  - _Requirements: 1.7, 1.10, 6.4, 8.4, 8.6_
- [x] 8.2 Run the full verification
  - Run `pnpm exec prisma validate`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` against the local database only. Confirm no Phase 1, Phase 2, or Phase 3 route, request shape, or error message changed except the staff role-assignment rejections and the member-route guard described in the design. Confirm no attendance, QR, branch, payroll, or delete route was added.
  - _Requirements: 8.1, 8.2, 8.3, 8.6_

## Notes

Disabled staff do not use a `maxStaff` seat. Seat checks lock the Gym row first. Template seed creates missing rows and does not overwrite saved flags. Optional tasks marked `*` are property tests. Parent tasks are sequencing headers. Task 1.1 was done while this plan was written.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "5.1"] },
    { "id": 3, "tasks": ["2.3", "3.3", "4.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["5.3", "6.1", "7.1"] },
    { "id": 6, "tasks": ["6.2", "7.2"] },
    { "id": 7, "tasks": ["6.3", "7.3"] },
    { "id": 8, "tasks": ["6.4"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2"] }
  ]
}
```
