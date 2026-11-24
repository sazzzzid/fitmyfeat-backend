# Implementation Plan

## Overview

Add Phase 6 communication and retention from `design.md` in this folder. Work lands in `src/modules/communications/`, one migration, and two Permissions. Do not add a WhatsApp, SMS, or push provider, and do not add a scheduled job. Tests run with Vitest. E2E tests use the local embedded Postgres or `TEST_DATABASE_URL`, never the `DATABASE_URL` in `.env`.

Correct the decisions at the top of `requirements.md` before starting task 2.

## Tasks

- [x] 1. Record Phase 6 in the project rules
  - _Requirements: 6.1_
- [x] 1.1 Add the Phase 6 section to AI_RULES.md
  - Append `# 67. Phase 6: Communication + Member Retention` pointing at `.kiro/specs/communication-retention/` and the confirmation date 2026-11-23. State that messages are stored locally and that providers and schedulers stay excluded. In §3.1, say this phase is allowed and providers stay excluded. Add `communications/` to the module tree in §5. In §58, include §67. Add one line to `.kiro/steering/gym-saas-phase-1.md` pointing at §67.
  - _Requirements: 6.1, 6.2_

- [x] 2. Add the tables
  - _Requirements: 2.1, 3.1, 4.4_
- [x] 2.1 Add the Prisma models
  - Copy the current schema aside, then add `MessageChannel`, `MessageTrigger`, `MessageStatus`, `MessageTemplate`, `GymAutomation`, and `Message` from the design, plus relation fields on `Gym` and `Member`. Run `pnpm exec prisma validate` and `pnpm exec prisma generate`.
  - _Requirements: 2.1, 3.1_
- [x] 2.2 Add the migration
  - Create a new migration from `prisma migrate diff` against the saved schema, then append the CHECK constraints and the partial unique index from the design. Do not edit earlier migration folders. Confirm the partial index excludes `manual`.
  - _Requirements: 4.4, 6.5_
- [x] 2.3 Truncate the new tables in the e2e reset
  - Add `messages`, `gym_automations`, and `message_templates` to the `TRUNCATE` in `test/helpers/gym-platform.ts`. Run one existing e2e file against the local database and confirm it still passes.
  - _Requirements: 6.2_

- [x] 3. Add the two permissions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
- [x] 3.1 Seed the permissions
  - Append both names to `PERMISSIONS`. Enable `manage_message_templates` for Super_Admin and `manage_communications` for Gym_Owner. Add the lock and its message in `RolesService`. Extend the permission route map once the GET routes exist. Until then, keep the partial-map approach used in Phase 5, and restore the full map in task 7.1.
  - _Requirements: 1.1, 1.2, 1.5, 1.6_
- [x] 3.2 Add unit tests for defaults and the lock
  - Cover the four default states, a new role with both disabled, and the new lock message. Earlier locked permissions still use their existing messages. Run `pnpm test`.
  - _Requirements: 1.2, 1.4, 1.5_

- [x] 4. Templates and rendering
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3_
- [x] 4.1 Add template validation and rendering
  - Add `message-values.ts` and `message-render.ts`. Unit-test name lengths 0, 1, and 65, an unknown placeholder, digit counts 7 and 8, and a push result that is always failed. Run `pnpm test`.
  - _Requirements: 2.1, 2.2, 3.2, 3.3_
- [x] 4.2 Add template routes
  - Add list, create, and update. Reject a channel change and a duplicate channel plus name. A template write must not write a Message. Run `pnpm test`.
  - _Requirements: 2.3, 2.4, 2.5, 2.6_
- [x]* 4.3 Write the channel property
  - Add `Feature: communication-retention, Property 1: WhatsApp and SMS need 8 digits, and push is not sent`. Run at least 100 examples with `pnpm test`.
  - **Property 1: WhatsApp and SMS need 8 digits, and push is not sent**
  - **Validates: Requirements 3.2, 3.3**
  - _Requirements: 3.2, 3.3_

- [x] 5. Manual send and automations
  - _Requirements: 3.1, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
- [x] 5.1 Add manual send and the message list
  - `POST /gym-communications/messages` renders and stores one Message. The list is limited to the caller's Gym. Unit-test a left Member, another Gym's Member, an inactive template, and a Gym that is not `active`. Run `pnpm test`.
  - _Requirements: 3.1, 3.4, 3.5, 3.6_
- [x] 5.2 Add automation settings and run
  - GET always returns three triggers. PUT validates the active template. Run applies the three selectors, the daily unique key, and the 100-message cap. Unit-test expiry at 7 days and 8 days, inactive at 14 days, a frozen Membership skipped by expiry, and a second same-day run. Run `pnpm test`.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
- [x]* 5.3 Write the once-per-day property
  - Add `Feature: communication-retention, Property 2: One automation message per member per trigger per day`. Run at least 100 examples with `pnpm test`.
  - **Property 2: One automation message per member per trigger per day**
  - **Validates: Requirements 4.4, 4.5**
  - _Requirements: 4.4, 4.5_

- [x] 6. Delivery analytics
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
- [x] 6.1 Add the analytics route
  - Count sent and failed by channel for the date range. The response has no body, name, or gym id. A Gym_Owner receives 403. Reuse the finance range error. Run `pnpm test`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
- [x]* 6.2 Write the analytics property
  - Add `Feature: communication-retention, Property 3: Analytics match stored counts`. Run at least 100 examples with `pnpm test`.
  - **Property 3: Analytics match stored counts**
  - **Validates: Requirements 5.1, 5.2**
  - _Requirements: 5.1, 5.2_

- [x] 7. Finish and verify
  - _Requirements: 1.6, 6.1, 6.2, 6.3, 6.4, 6.5_
- [x] 7.1 Restore the permission route map and add examples
  - Point the two new permissions at their GET routes and draw from the full `PERMISSIONS` list. Add `test/phase6-examples.e2e-spec.ts` covering each error in the design once, a second same-day run, analytics without a body, and a staff token rejected from both roots. Run `pnpm test:e2e`.
  - _Requirements: 1.6, 6.3, 6.4_
- [x] 7.2 Run the full verification
  - Run `pnpm exec prisma validate`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` against the local database only. Confirm no provider client or scheduler was added, and member, finance, and subscription responses are unchanged.
  - _Requirements: 6.1, 6.2, 6.5_

## Notes

Push messages are stored as failed until a later phase adds a device destination. Automation does not run by itself. Optional tasks marked `*` are property tests. Parent tasks are sequencing headers. Task 1.1 was done while this plan was written.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2"] },
    { "id": 3, "tasks": ["2.3", "4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["5.3", "6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1"] },
    { "id": 8, "tasks": ["7.2"] }
  ]
}
```
