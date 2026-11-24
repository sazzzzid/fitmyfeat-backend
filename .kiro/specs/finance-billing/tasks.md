# Implementation Plan

## Overview

Add Phase 5 finance and billing from `design.md` in this folder. Work lands in `src/modules/finance/`, the mark-paid transaction, one migration, and two Permissions. Do not add a payment gateway, a PDF, an email, or a payout. Tests run with Vitest. E2E tests use the local embedded Postgres or `TEST_DATABASE_URL`, never the `DATABASE_URL` in `.env`.

Correct the decisions at the top of `requirements.md` before starting task 2.

## Tasks

- [x] 1. Record Phase 5 in the project rules
  - _Requirements: 9.1, 9.2_
- [x] 1.1 Add the Phase 5 section to AI_RULES.md
  - Append `# 66. Phase 5: Finance + Billing` pointing at `.kiro/specs/finance-billing/` and the confirmation date 2026-11-22. State what this phase adds and that payment gateways, payouts, PDF invoices, and emails stay excluded. In §3.1, say this phase is allowed and gateways stay excluded. Add `finance/` to the module tree in §5. In §58, include §66. Add one line to `.kiro/steering/gym-saas-phase-1.md` pointing at §66. Narrow the stop-condition bullet about payment functionality so it does not block §66.
  - _Requirements: 9.1, 9.2_

- [x] 2. Add the tables and the commission setting
  - _Requirements: 2.1, 3.1, 5.1, 7.2_
- [x] 2.1 Add the Prisma models
  - Copy the current schema aside, then add `failed` to `SubscriptionStatus`, plus `PlatformChargeStatus`, `PlatformCharge`, `Expense`, and `Settlement` from the design. Add relation fields only on `Gym`, `Subscription`, and `UserAccount`. Run `pnpm exec prisma validate` and `pnpm exec prisma generate`.
  - _Requirements: 2.1, 3.1, 7.2_
- [x] 2.2 Add the migration
  - Create a new migration from `prisma migrate diff` against the saved schema, then append the three CHECK constraints from the design. Do not edit earlier migration folders. Confirm `failed` does not join the partial unique index for `pending_payment`.
  - _Requirements: 3.3, 4.4_
- [x] 2.3 Read the commission percent
  - Add `commissionPercent` to `configuration.ts` with the startup rule from the design. Unit-test missing, 0, 100, and 101. Run `pnpm test`.
  - _Requirements: 5.1_
- [x] 2.4 Truncate the new tables in the e2e reset
  - Add `platform_charges`, `expenses`, and `settlements` to the `TRUNCATE` in `test/helpers/gym-platform.ts` in the order from the design. Run one existing e2e file against the local database and confirm it still passes.
  - _Requirements: 9.2_

- [x] 3. Add the two permissions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
- [x] 3.1 Seed the permissions
  - Append both names to `PERMISSIONS`. Enable `manage_platform_finance` for Super_Admin and `manage_gym_finance` for Gym_Owner. Add the lock and its message in `RolesService`. Extend the permission route map with the two GET routes from the design once those routes exist. Until then, keep the partial-map approach used in Phase 4, and restore the full map in task 8.1.
  - _Requirements: 1.1, 1.2, 1.5, 1.6_
- [x] 3.2 Add unit tests for defaults and the lock
  - Cover the four default states, a new role with both disabled, and the new lock message. A Phase 1 or Phase 2 locked permission still uses its existing message. Run `pnpm test`.
  - _Requirements: 1.2, 1.4, 1.5_

- [x] 4. Platform charges, failure, and refunds
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_
- [x] 4.1 Write a paid charge from mark-paid
  - In the mark-paid transaction, after the subscription update, insert one `paid` charge using the saved price and the current commission percent. A rejected mark-paid writes nothing. A trial still returns the existing error. Unit-test a 10 percent charge of 100000 paise becoming 10000, a 0 price, and a rejected trial. Run `pnpm test`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
- [x] 4.2 Add fail, refund, and the payment list
  - Add the platform controller routes from the design. Fail only a `pending_payment` row. Refund only a `paid` charge and do not write the subscription. List filters by status. Unit-test each rejection. Run `pnpm test`.
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_
- [x]* 4.3 Write the commission property
  - Add `Feature: finance-billing, Property 1: Commission is copied onto the charge`. For amounts 0 through 100000 and percents 0 through 100, the stored commission is `floor(amount * percent / 100)`, and changing the percent afterward leaves the row unchanged. Run at least 100 examples with `pnpm test`.
  - **Property 1: Commission is copied onto the charge**
  - **Validates: Requirements 2.1, 2.4, 5.1**
  - _Requirements: 2.1, 2.4, 5.1_

- [x] 5. Settlement and the platform report
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_
- [x] 5.1 Add settlement and report routes
  - Implement the month sum, the duplicate-month rejection, and the report totals from the design. Unit-test a future month, a bad month, a refunded charge left out of commission, and a range of 367 days. Run `pnpm test`.
  - _Requirements: 5.2, 5.3, 5.4, 6.1, 6.2, 6.3_

- [x] 6. Gym finance
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5_
- [x] 6.1 Add expense validation and routes
  - Add `finance-values.ts` and `POST/GET /gym-finance/expenses`. Unit-test category lengths 0, 1, and 65, amount 0, a bad date, and notes of 501 characters. Run `pnpm test`.
  - _Requirements: 7.2, 7.3, 7.4, 7.5_
- [x] 6.2 Add income, outstanding, ledger, invoice, receipt, and the gym report
  - Read membership payments for income. Compute outstanding, the running balance, and both documents from the design. A payment id from another gym is 404 `Payment was not found`. A gym that is not `active` is 409. Unit-test the gap math and the running balance. Run `pnpm test`.
  - _Requirements: 7.1, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5_
- [x]* 6.3 Write the gym money properties
  - Add `Feature: finance-billing, Property 2: Outstanding ignores negative gaps and other gyms` and `Feature: finance-billing, Property 3: Ledger balance equals income minus expense`. Run at least 100 examples with `pnpm test`.
  - **Property 2: Outstanding ignores negative gaps and other gyms**
  - **Validates: Requirements 7.6, 7.7**
  - **Property 3: Ledger balance equals income minus expense**
  - **Validates: Requirements 8.1**
  - _Requirements: 7.6, 7.7, 8.1_

- [x] 7. Finish and verify
  - _Requirements: 1.6, 9.1, 9.2, 9.3, 9.4, 9.5_
- [x] 7.1 Restore the permission route map and add examples
  - Point the two new permissions at their GET routes and draw from the full `PERMISSIONS` list. Add `test/phase5-examples.e2e-spec.ts` covering each error in the design once, one charge per successful mark-paid, a refund that leaves `currentPeriodEnd` unchanged, a failed request followed by a new plan request, and a staff token rejected from both finance roots. Run `pnpm test:e2e`.
  - _Requirements: 1.6, 9.3, 9.4, 9.5_
- [x] 7.2 Run the full verification
  - Run `pnpm exec prisma validate`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` against the local database only. Confirm the dashboard body is unchanged, no gateway client was added, and no membership payment can be edited.
  - _Requirements: 9.1, 9.2, 9.5_

## Notes

Charges are written only after this phase ships. Older mark-paid events are not backfilled. Outstanding is not collected in this phase. Optional tasks marked `*` are property tests. Parent tasks are sequencing headers. Task 1.1 was done while this plan was written.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.3", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "6.1"] },
    { "id": 3, "tasks": ["2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "6.2"] },
    { "id": 5, "tasks": ["4.3", "5.1", "6.3"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2"] }
  ]
}
```
