# Implementation Plan

## Overview

Fill the existing NestJS ESM modules (`src/modules/*`, relative imports ending in `.js`) with the Phase 1 API from the design: bcrypt password hashes at cost 12, a JWT access token, and Prisma access to exactly six tables. Each implementation step registers its controller or provider in the Nest app that already imports those modules. Tests run with Vitest (`pnpm test` for `*.spec.ts`, `pnpm test:e2e` for `*.e2e-spec.ts`).

## Tasks

- [x] 1. Add the Prisma schema, migration, and client
  - Create exactly six tables and wire Prisma through `src/infrastructure/database/`. Do not add a session, refresh-token, audit, file, `gym_profiles`, or `user_roles` table.
  - _Requirements: 1.1, 1.2, 1.5, 1.7, 3.1, 4.1, 8.1_
- [x] 1.1 Add the six Prisma models
  - Create `prisma/schema.prisma` with only `UserAccount`, `Role`, `Permission`, `RolePermission`, `OwnerProfile`, and `Gym`, plus the `GymStatus` enum (`setup_in_progress`, `pending`, `active`), using the fields, unique `emailKey`, unique `Gym.ownerId`, and `@@map` names from the design. Keep `roles.name` as case-sensitive `text`. Store logo as the nullable `logoValue` string on `Gym`, and store gym name, address, contact, and timing on that same `Gym` row. If this Prisma CLI rejects `url` in the schema, put `DATABASE_URL` in `prisma.config.ts` and leave the six models in `prisma/schema.prisma`.
  - _Requirements: 1.1, 1.2, 3.1, 4.1, 8.1_
- [x] 1.2 Add the email-key migration
  - Add one SQL migration under `prisma/migrations/` that creates those tables and a SQL function `ascii_email_key` that lowercases only ASCII `A`–`Z`, plus `CHECK (email_key = ascii_email_key(email))` on `user_accounts`. Foreign keys use `ON DELETE RESTRICT`. Do not add a seventh table.
  - _Requirements: 1.1, 1.5, 1.7_
- [x] 1.3 Wire PrismaService into DatabaseModule
  - Implement `src/infrastructure/database/prisma.service.ts` extending `PrismaClient`, connect on module init, and provide it from the global `src/infrastructure/database/database.module.ts`. If this `@prisma/client` build cannot construct a client without a driver adapter, create that adapter only inside `PrismaService`. Generate the client so later tasks can import it. Controllers must not import `PrismaClient`.
  - _Requirements: 1.1, 4.1_

- [x] 2. Add shared email and password helpers and HTTP errors
  - Add the Phase 1 email and password predicates under `src/common/validation/` and the error filter used by later modules. This package is ESM; relative imports end in `.js`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.5, 9.4, 11.1, 11.2_
- [x] 2.1 Add the Phase 1 email helper
  - Create `src/common/validation/email-address.ts` that trims only leading and trailing U+0020, tab, CR, and LF (not `String.prototype.trim`), checks the design predicate (length 3 to 254, exactly one `@`, one character on each side, no space, tab, CR, or LF), and builds `emailKey` by lowercasing only ASCII `A`–`Z`. Use JavaScript `String.length`. Later modules import it with a relative path ending in `.js`, for example `../../common/validation/email-address.js`.
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.5, 9.4_
- [x] 2.2 Add the shared password acceptance helper
  - Create `src/common/validation/password.ts` exporting a registration check: the value is a string whose `length` is 1 to 128 inclusive and is not trimmed. Seed and `AuthService.register` import it from the relative `.js` path. Do not use it to reject a sign-in password longer than 128, and do not add argon2 or a pre-hash. Hashing stays `bcrypt.hash(password, 12)` in the seed and auth tasks.
  - _Requirements: 1.2, 1.6_
- [x] 2.3 Add unit tests for the email and password helpers
  - Add `src/common/validation/email-address.spec.ts` and `src/common/validation/password.spec.ts`. Run them with `pnpm test`. Cover internal spaces, a non-ASCII letter that must not be folded, empty-after-trim, email length boundaries, ASCII-only case folding, and password lengths 0, 1, 128, and 129 with spaces counted and not stripped.
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.5_
- [x] 2.4 Add PlatformExceptionFilter
  - Implement `src/common/filters/platform-exception.filter.ts` and export it from `src/common/filters/index.ts`. Responses are `{ "statusCode": number, "message": string }` with no stack, Prisma error, password, hash, bearer token, or `JWT_SECRET`. Unmapped database failures stay 500 with a fixed message and no schema details.
  - _Requirements: 1.2, 11.1_
- [x] 2.5 Shape the authenticated user
  - Change `AuthenticatedUser` in `src/common/interfaces/authenticated-user.interface.ts` to `{ id: string; email: string; roleId: string }`. Leave `CurrentUser` reading `request.user`.
  - _Requirements: 2.1, 11.2_
- [x] 2.6 Register the validation pipe and exception filter
  - In `src/main.ts`, register global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`, and register `PlatformExceptionFilter`. Services still own the Phase 1 predicates and the exact error strings.
  - _Requirements: 1.3, 1.6_

- [x] 3. Seed permissions, roles, and the initial super admin
  - Run the idempotent startup seed from `DatabaseModule` before auth or gym features depend on the seven permissions and the two built-in roles.
  - _Requirements: 2.4, 8.1, 8.2, 8.3, 8.4, 8.5_
- [x] 3.1 Seed permissions, roles, and the initial super admin
  - Add `src/infrastructure/database/platform-seed.service.ts` (`OnApplicationBootstrap`) and register it from `src/infrastructure/database/database.module.ts`. Refuse to boot when `DATABASE_URL`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, or `SUPER_ADMIN_PASSWORD` is missing, when the admin email fails the Phase 1 predicate, or when the admin password length is outside 1 to 128. Do not compile a default admin password. Upsert the seven `Permission` names from `src/common/constants/permissions.ts`, upsert roles `Super_Admin` and `Gym_Owner`, and insert missing `RolePermission` rows with `createMany` and `skipDuplicates` using the design's initial enabled map (existing rows stay). Insert the configured super admin only when that `emailKey` is absent. Hash the configured password with `bcrypt.hash(..., 12)`. Ignore a unique violation from a concurrent boot. Do not reset an existing admin password, role, or duplicate.
  - _Requirements: 2.4, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 4. Implement registration and sign-in
  - Fill `src/modules/auth/` so one public register route and one public sign-in route issue a one-hour JWT access token. Do not add a refresh token, a session table, or argon2.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.5, 11.1, 11.4, 11.5_
- [x] 4.1 Add register and sign-in DTOs
  - Add `RegisterDto` and `SignInDto` under `src/modules/auth/dto/` with optional `email` and `password` strings, and export them from `src/modules/auth/dto/index.ts`. Unknown JSON properties stay rejected by the pipe.
  - _Requirements: 1.3, 1.6, 2.5_
- [x] 4.2 Issue JWTs and load the user by sub
  - Add `src/modules/auth/strategies/jwt.strategy.ts`, export it from `src/modules/auth/strategies/index.ts`, and register `JwtModule` (HS256, `JWT_SECRET`, one-hour expiry) and `PassportModule` on `src/modules/auth/auth.module.ts`. The payload is `{ "sub": "<user id>" }` only. The strategy loads `UserAccount` by `sub` and attaches `{ id, email, roleId }` from that row. An unknown id is 401 `Authenticated_Session is required` and attaches no user. Import the strategy with a relative path ending in `.js`.
  - _Requirements: 2.1, 2.2, 11.1, 11.5_
- [x] 4.3 Implement AuthService register and signIn
  - Fill `src/modules/auth/auth.service.ts`. `register` applies the email helper, then rejects a missing, empty, or longer-than-128 password with 400 `Password is not accepted` (a bad email is reported first). Hash with `bcrypt.hash(password, 12)`, insert `UserAccount` with trimmed email, `emailKey`, hash, and the `Gym_Owner` role id, and do not insert `OwnerProfile` or `Gym` or call `JwtService.sign`. Unique `email_key` violations return 409 `Email_Address is already used` without changing the existing user, hash, role, profile, or gym. Success is 201 `{ "email", "role": "Gym_Owner" }` with no `password`, `passwordHash`, or `accessToken`. `signIn` uses the same email rules. Missing email, an email that is not valid, or a missing or zero-length password returns 400 `Sign-in input is invalid` and does not look up a user. A password of spaces is not that error, and a password longer than 128 is still compared. Unknown `emailKey` and a failed `bcrypt.compare` share 401 `Email_Address and password do not match a User_Account`, after comparing a missing user to a process-local dummy bcrypt hash of cost 12. Success returns 200 `{ "accessToken" }` and does not change email, hash, or role, with or without a gym and for every gym status. There is one sign-in path for both roles. Do not add argon2 or a pre-hash.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.5, 11.4, 11.5_
- [x] 4.4 Expose the public auth routes
  - Fill `src/modules/auth/auth.controller.ts` with `@Public()` `POST /auth/register` and `POST /auth/sign-in` only. Do not add a second sign-in route. Map the service results to the status codes in the design.
  - _Requirements: 1.1, 2.1, 2.2, 11.4, 11.5_
- [x]* 4.5 Write the property test for registration hash and no session
  - Add the `fast-check` dev dependency with `pnpm add -D fast-check`. Do not import it from production code. Add `src/modules/auth/auth.register.property.spec.ts` with a test named `Feature: gym-saas-foundation, Property 1: Registration stores a bcrypt hash and no session`, at least 100 examples, mocking `PrismaService`. For any valid email and any password of length 1 to 128 whose UTF-8 form is at most 72 bytes, the persisted `passwordHash` satisfies `bcrypt.compare`, is not the password, the body has neither the password nor the hash nor `accessToken`, and `JwtService.sign` is not called. Run with `pnpm test`.
  - **Property 1: Registration stores a bcrypt hash and no session**
  - **Validates: Requirements 1.1, 1.2**
  - _Requirements: 1.1, 1.2_
- [x] 4.6 Add unit tests for password bounds and the register response
  - Add `src/modules/auth/auth.service.spec.ts`. Cover password lengths 0, 1, 128, and 129 with spaces counted, the register response builder never copying `password` or `passwordHash`, and `register` not calling `JwtService.sign`. Run with `pnpm test`.
  - _Requirements: 1.2, 1.6, 2.5_

- [x] 5. Enforce the JWT session and permission guards
  - Register global guards in `src/app.module.ts` so every later route is public or permission-checked. Guards read `RolePermission` and do not decide gym status.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
- [x] 5.1 Add the permission decorator
  - Add `src/common/decorators/require-permission.decorator.ts` and export it from `src/common/decorators/index.ts`. `@RequirePermission` stores one permission name from `PERMISSIONS`.
  - _Requirements: 11.2, 11.6_
- [x] 5.2 Add JwtAuthGuard and PermissionsGuard
  - Add `src/common/guards/jwt-auth.guard.ts` and `src/common/guards/permissions.guard.ts`, and export both from `src/common/guards/index.ts`. `JwtAuthGuard` skips `@Public()` routes. A missing, expired, or invalid token, or an unknown `sub`, returns 401 `Authenticated_Session is required` and writes nothing. `PermissionsGuard` reads `RolePermission` for the caller's current `roleId` and the handler's permission name on that request. A missing or `enabled: false` row returns 403 `Permission is disabled` and writes nothing. A handler that is neither `@Public()` nor `@RequirePermission` returns 403. The guard does not read a permission claim from the token, does not branch on the role name, and does not hardcode the `Gym_Owner` set. It does not contain gym, profile, or role-edit rules.
  - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_
- [x] 5.3 Register the guards and keep health public
  - Register `JwtAuthGuard` and `PermissionsGuard` as global `APP_GUARD`s in `src/app.module.ts`, in that order. `AppModule` must not query Prisma or decide gym status. Mark the existing `GET /` handler in `src/modules/health/health.controller.ts` with `@Public()`.
  - _Requirements: 11.1, 11.4, 11.5_
- [x] 5.4 Keep health and public auth reachable without a token
  - Update `test/app.e2e-spec.ts` so it sets `DATABASE_URL` (from `TEST_DATABASE_URL`), `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` before `AppModule` loads, applies the same `ValidationPipe` and `PlatformExceptionFilter` as `src/main.ts`, and still expects `GET /` without `Authorization` to return 200 `Hello World!`. Also `POST /auth/register` with a valid new email and password and no token returns 201, and `POST /auth/sign-in` for that account with no prior token returns 200 `{ "accessToken" }`. Run with `pnpm test:e2e`.
  - _Requirements: 11.4, 11.5_

- [x] 6. Prove registration uniqueness and sign-in with property tests
  - After auth and the guards exist, add the optional fast-check end-to-end tests for Properties 2 and 3.
  - _Requirements: 1.5, 1.7, 2.1, 2.3_
- [x]* 6.1 Write the property test for concurrent email uniqueness
  - Add `test/helpers/gym-platform.ts` that builds the Nest app, applies `ValidationPipe` and `PlatformExceptionFilter`, migrates, truncates the six tables, and runs `PlatformSeedService` in `beforeEach` against `TEST_DATABASE_URL`. Add `test/auth-registration.property.e2e-spec.ts` named `Feature: gym-saas-foundation, Property 2: Case-insensitive email uniqueness under concurrency`. For 20 committed fast-check examples, `Promise.all` two `POST /auth/register` calls whose trimmed emails differ only by ASCII letter case. Exactly one `UserAccount` exists for that `emailKey`, every other response is `Email_Address is already used`, and the loser does not change the winner's email, hash, role, or gym. The stored email case is the winning trimmed case. Run with `pnpm test:e2e`.
  - **Property 2: Case-insensitive email uniqueness under concurrency**
  - **Validates: Requirements 1.5, 1.7**
  - _Requirements: 1.5, 1.7_
- [x]* 6.2 Write the property test for sign-in JWT and one mismatch error
  - Add `test/auth-sign-in.property.e2e-spec.ts` using the helper from `test/helpers/gym-platform.ts`. Name the test `Feature: gym-saas-foundation, Property 3: Sign-in JWT and one mismatch error`. For any stored account, a matching `emailKey` and a non-empty password that `bcrypt.compare` accepts returns a JWT whose `sub` is that user id and leaves email, hash, and role unchanged, with no gym and for every gym status. For any valid email shape and non-empty password, an unknown `emailKey` and a known `emailKey` with a failing compare return the same status and message `Email_Address and password do not match a User_Account`, return no token, and leave every user unchanged. Also sign a token that adds a permission claim and show the guard still follows the `RolePermission` row. Run at least 100 examples with `pnpm test:e2e`.
  - **Property 3: Sign-in JWT and one mismatch error**
  - **Validates: Requirements 2.1, 2.3**
  - _Requirements: 2.1, 2.3_

- [x] 7. Save and read the owner profile
  - Fill `src/modules/owner-profiles/` for the single display name and contact stored per gym owner.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
- [x] 7.1 Save and read the owner profile
  - Fill `src/modules/owner-profiles/dto/`, `owner-profiles.service.ts`, and `owner-profiles.controller.ts`. `GET /owner-profile` and `PUT /owner-profile` require `manage_owner_profile`. `PUT` body is `{ "displayName": string, "contact": string }`. Reject an omitted value, a non-string, length 0, display name longer than 100, contact longer than 254, or a value with no character outside U+0020, tab, CR, and LF, with 400 `Display name or contact value is empty or exceeds the maximum length`, inserting nothing and leaving a stored row unchanged. The contact does not have to be an email. A valid put stores both strings exactly, with no trim, on the single `OwnerProfile` for `userId` (`userId` unique); a second put replaces both columns. `GET` returns the stored pair, or `{ "displayName": "", "contact": "" }` with 200 and no insert when no row exists.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
- [x] 7.2 Add unit tests for owner-profile boundaries
  - Add `src/modules/owner-profiles/owner-profiles.service.spec.ts` with a mocked `PrismaService`. Cover whitespace-only rejection, max lengths, exact storage, replace-on-second-put, and `GET` before any put returning empty strings with zero `OwnerProfile` rows. Run with `pnpm test`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 8. Create one gym per owner
  - Fill `POST /gyms` in `src/modules/gyms/` so each owner gets one `Gym` row.
  - _Requirements: 4.1, 4.2_
- [x] 8.1 Create one gym per owner
  - Fill `POST /gyms` on `src/modules/gyms/gyms.controller.ts` and `GymsService.create` in `src/modules/gyms/gyms.service.ts`. The route requires `create_gym` and has an empty body. Insert one `Gym` with `ownerId` set, `status = setup_in_progress`, and `gymName`, `address`, `contact`, `timing`, and `logoValue` all null. Respond 201 with that gym. A second create for the same `ownerId`, at any status, returns 409 `Gym already exists` and does not change the existing row. Map the unique `ownerId` violation to that 409.
  - _Requirements: 4.1, 4.2_
- [x]* 8.2 Write the property test for one gym per owner
  - Add `test/gym-create.property.e2e-spec.ts` using `test/helpers/gym-platform.ts`. Name it `Feature: gym-saas-foundation, Property 4: One gym per owner`. For a caller whose current role has `create_gym` enabled and who has no gym, the first `POST /gyms` inserts one row with that `ownerId`, status `setup_in_progress`, and all five setup fields null. A second create is rejected for every current status. Fire two creates with `Promise.all` and assert the unique `ownerId` constraint leaves one row and one 409. Run 20 committed examples with `pnpm test:e2e`.
  - **Property 4: One gym per owner**
  - **Validates: Requirements 4.1, 4.2**
  - _Requirements: 4.1, 4.2_

- [x] 9. Update gym profile and basic setup on the same gym row
  - Add the profile and setup patches in `src/modules/gyms/`. Both write the shared name, address, and contact columns, and both refuse writes when status is `pending` or `active`.
  - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 6.6_
- [x] 9.1 Update gym profile fields while setup is in progress
  - Add `PATCH /gyms/me/profile` on `src/modules/gyms/gyms.controller.ts` and the matching method on `src/modules/gyms/gyms.service.ts`. Require `manage_gym_setup`. Body fields are any of `address`, `contact`, `logoValue`, and `gymName`. At least one must be present. Each present value must be a string of length at least 1, otherwise 400 `Submitted gym value must contain at least one character` and no write. A whitespace-only gym value is valid. Look up the caller's gym with `where: { ownerId: currentUser.id }`. A missing gym, including a read or update aimed at another owner, returns 404 `Gym was not found` and writes nothing. Write with `updateMany` `where: { id, ownerId, status: setup_in_progress }`. `address`, `contact`, and `gymName` update those columns only. Do not write `timing`. Omit fields that were not submitted. Do not change `status`. When status is `pending` or `active`, return 409 `Gym profile and basic setup cannot be changed while status is pending or active` and leave the row unchanged. JSON uses `null` for a field that has never been saved, never `""`.
  - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7, 5.8, 6.6_
- [x] 9.2 Update basic setup fields on the same columns
  - Add `PATCH /gyms/me/setup` on the same controller and service. Require `manage_gym_setup`. Body fields are any of `timing`, `address`, `contact`, and `gymName`, with the same non-empty rule, 400 message, 404 for no gym, and 409 when status is not `setup_in_progress`. Write `timing`, `address`, `contact`, and `gymName` on the same columns a profile update uses. Do not write `logoValue`. Do not change `status`. A lost race with setup completion matches the `setup_in_progress` `where` clause and changes nothing.
  - _Requirements: 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 6.6_
- [x]* 9.3 Write the property test for shared gym columns
  - Add `src/modules/gyms/gym-columns.property.spec.ts` with a mocked `PrismaService`. Name it `Feature: gym-saas-foundation, Property 5: Shared gym columns and unchanged setup status`. For any gym in `setup_in_progress` and any non-empty address, contact, and gym name, a profile update and a basic setup update write those three values to the same `address`, `contact`, and `gym_name` columns. A profile update does not change `timing`. A setup update does not change `logo_value`. Omitted fields stay as they were. Both updates leave status `setup_in_progress`. Run at least 100 examples with `pnpm test`.
  - **Property 5: Shared gym columns and unchanged setup status**
  - **Validates: Requirements 5.1, 5.2, 6.6**
  - _Requirements: 5.1, 5.2, 6.6_
- [x]* 9.4 Write the property test for rejected edits after submission
  - Add `src/modules/gyms/gym-locked.property.spec.ts` with a mocked `PrismaService`. Name it `Feature: gym-saas-foundation, Property 6: No profile or setup writes after submission`. For any gym whose status is `pending` or `active`, both updates are rejected and status, the five setup fields, and `ownerId` stay byte-for-byte as they were. Run at least 100 examples with `pnpm test`.
  - **Property 6: No profile or setup writes after submission**
  - **Validates: Requirements 5.8**
  - _Requirements: 5.8_
- [x] 9.5 Add unit tests for empty gym values
  - Add `src/modules/gyms/gym-fields.spec.ts`. A profile or setup body with none of its fields, or a present value that is not a string of length at least 1, is rejected and writes nothing. A whitespace-only gym string is stored. Run with `pnpm test`.
  - _Requirements: 5.4, 5.7_

- [x] 10. Complete setup, list pending gyms, and activate one
  - Finish the gym routes in `src/modules/gyms/`: own-gym read, setup completion to `pending`, pending review, and activation to `active`.
  - _Requirements: 5.3, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
- [x] 10.1 Return the caller's gym
  - Add `GET /gyms/me` on `src/modules/gyms/gyms.controller.ts` and `src/modules/gyms/gyms.service.ts`, declared before any `:id` route. Require `manage_gym_setup`. Return `{ id, status, gymName, address, contact, timing, logoValue }` for `ownerId = currentUser.id`. `logoValue` is the last profile save, `timing` is the last setup save, and `address`, `contact`, and `gymName` are whichever route saved them last. Unsaved fields are `null`. No gym returns 404 `Gym was not found`.
  - _Requirements: 5.3, 5.5, 5.6_
- [x] 10.2 Complete setup into pending
  - Add `POST /gyms/me/complete-setup` requiring `manage_gym_setup`. Set `status` to `pending` only when `status` is `setup_in_progress` and `gymName`, `address`, `contact`, `timing`, and `logoValue` are each stored, non-null, and length at least 1. Do not change those fields or `ownerId`. If any field is missing or empty, return 409 `Setup is incomplete` and write nothing. That incomplete rejection applies only to the gym whose `ownerId` is the session user and leaves every other gym unchanged. If status is `pending` or `active`, return 409 `Setup completion is not allowed for this gym status` and write nothing. If the owner has no gym, return 404. Never set `active`.
  - _Requirements: 6.1, 6.2, 6.4, 6.5_
- [x] 10.3 List pending gyms and activate one
  - Add `GET /gyms/pending` and `POST /gyms/:id/activate` on the same controller, with `GET /gyms/me` and `GET /gyms/pending` declared before `POST /gyms/:id/activate`. Both require `review_gyms`. Pending list returns only `pending` gyms, in unspecified order, each `{ id, status, gymName, address, contact, timing, logoValue, ownerEmail }` where `ownerEmail` is the linked account's stored email, or `{ "gyms": [] }` when none are pending. Activate with `updateMany` where `id` and `status = pending`, setting only `status` to `active`. Other gyms are not updated. Unknown id returns 404 `Activation requires one stored gym`. Status `setup_in_progress` or `active` returns 409 `Only a pending gym can be activated`. A caller without `review_gyms` is stopped by the guard with 403 and the gym is unchanged. While status is `pending`, no other Phase 1 operation changes it.
  - _Requirements: 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
- [x]* 10.4 Write the property test for pending and active transitions
  - Add `test/gym-status.property.e2e-spec.ts` using `test/helpers/gym-platform.ts`. Name it `Feature: gym-saas-foundation, Property 7: Pending only from complete setup, active only from review`. Setup completion sets `pending` only when status is `setup_in_progress` and all five fields are non-empty, and that write does not change those fields or `ownerId`. Otherwise the row is unchanged. The only write that sets `pending` to `active` is activation while `RolePermission` for `review_gyms` is enabled on the caller's current role, and that write changes only status. While status remains `pending`, every other Phase 1 operation leaves it `pending`. Run at least 100 examples with `pnpm test:e2e`.
  - **Property 7: Pending only from complete setup, active only from review**
  - **Validates: Requirements 6.1, 7.2, 7.6**
  - _Requirements: 6.1, 7.2, 7.6_

- [x] 11. Manage roles and permissions
  - Fill `src/modules/roles/` so a caller with `manage_roles` can list roles, create a role, and change one permission at a time, including the Super_Admin lock.
  - _Requirements: 8.1, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 11.7_
- [x] 11.1 List, create, and edit roles
  - Fill `src/modules/roles/dto/`, `roles.service.ts`, and `roles.controller.ts`. `GET /roles`, `POST /roles`, and `PATCH /roles/permissions` require `manage_roles`. `GET /roles` returns every role's `name` and the seven states as the strings `"enabled"` and `"disabled"`, including `Super_Admin` and `Gym_Owner`, and no permission name outside the seven. `POST /roles` accepts `{ "name": string }`. The name must be 1 to 64 characters, must not start or end with U+0020, and must contain a character that is not U+0020. Comparison is exact, including case. Invalid names return 400 `Role name is not valid`. An exact collision returns 409 `Role name is already used` and leaves existing roles unchanged. A valid create inserts the role and seven `RolePermission` rows, all `enabled = false`. `PATCH /roles/permissions` accepts `{ "roleName", "permission", "state": "enabled" | "disabled" }` and updates that one row only. Any other shape returns 400 `Permission change is not valid` and writes nothing. An unknown role name returns 404 `Role was not found`. For the role named exactly `Super_Admin`, `"disabled"` on `view_dashboard`, `manage_users`, `manage_roles`, or `review_gyms` returns 400 `view_dashboard, manage_users, manage_roles, and review_gyms cannot be disabled on Super_Admin` and does not write. Setting one of those four to `"enabled"` writes `true` and leaves the other six rows unchanged. `create_gym`, `manage_owner_profile`, and `manage_gym_setup` on `Super_Admin` can be set either way. No other role has a locked permission. A permission change leaves every `UserAccount`, `OwnerProfile`, `Gym`, role name, and the other six permission states unchanged. There is no rename, delete, or permission-create route.
  - _Requirements: 8.1, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 11.7_
- [x]* 11.2 Write the property test for locked Super_Admin permissions
  - Add `src/modules/roles/roles.property.spec.ts` with a mocked `PrismaService`. Name it `Feature: gym-saas-foundation, Property 9: Super_Admin cannot drop the four locked permissions`. For any of `view_dashboard`, `manage_users`, `manage_roles`, and `review_gyms`, setting that permission to disabled on the role named `Super_Admin` is rejected, that row stays enabled, and the other six `RolePermission` rows on that role stay as they were. Run at least 100 examples with `pnpm test`.
  - **Property 9: Super_Admin cannot drop the four locked permissions**
  - **Validates: Requirements 8.9**
  - _Requirements: 8.9_
- [x] 11.3 Add unit tests for role name and permission rejection
  - Add `src/modules/roles/roles.service.spec.ts`. Cover an invalid name, a case-sensitive collision (`super_admin` is not `Super_Admin`), an unknown permission name, a missing or non-enabled/disabled state, an unknown role name, and a successful one-row update that leaves the other six states untouched. Run with `pnpm test`.
  - _Requirements: 8.6, 8.7, 8.10, 8.11, 8.13, 8.14, 8.15_

- [x] 12. List users and assign one role
  - Fill `src/modules/users/` so a caller with `manage_users` can see every account and replace one account's role.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 12.1 List users and assign one role
  - Fill `src/modules/users/dto/`, `users.service.ts`, and `users.controller.ts`. `GET /users` and `PUT /users/role` require `manage_users`. `GET /users` returns `{ "users": [ { "email", "role" } ] }` for every `UserAccount`, including every super admin and every gym owner. `role` is the current role name. Do not select `passwordHash`, `emailKey`, or the password. `PUT /users/role` body is `{ "email", "roleName" }`. Resolve email with the Phase 1 predicate and `emailKey`. `roleName` must match a stored role name character for character. On success replace `roleId` only. A missing email, an email that is not valid, an unknown account, a missing role name, or an unknown role name returns 400 `Role assignment is not valid`, creates no user, creates no role, and updates nothing.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 12.2 Add unit tests for the user list and role assignment
  - Add `src/modules/users/users.service.spec.ts` with a mocked `PrismaService`. The list includes every stored account and omits the hash. A known email and exact role name replaces only `roleId`. An unknown email or unknown role name writes nothing and creates nothing. Run with `pnpm test`.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 13. Return the four platform counts
  - Fill `src/modules/dashboard/` so `GET /dashboard` returns only the four stored counts.
  - _Requirements: 10.1, 10.2_
- [x] 13.1 Return the four platform counts
  - Fill `src/modules/dashboard/dashboard.service.ts` and `dashboard.controller.ts`. `GET /dashboard` requires `view_dashboard`. In one Prisma transaction at isolation `RepeatableRead`, return exactly `{ "userCount", "setupInProgressCount", "pendingCount", "activeCount" }`. `userCount` is the `UserAccount` count. The other three are `Gym` counts by `status`, using 0 when a status has no rows. The object has no revenue, attendance, or list.
  - _Requirements: 10.1, 10.2_
- [x]* 13.2 Write the property test for the four stored counts
  - Add `test/dashboard.property.e2e-spec.ts` using `test/helpers/gym-platform.ts`. Name it `Feature: gym-saas-foundation, Property 10: Dashboard is four stored counts`. For any set of stored users and gyms, `GET /dashboard` returns the four counts equal to the `UserAccount` rows and the `Gym` rows in each status, using 0 when a status is absent. The JSON object has no other keys and no embedded list. Run at least 100 examples with `pnpm test:e2e`.
  - **Property 10: Dashboard is four stored counts**
  - **Validates: Requirements 10.1, 10.2**
  - _Requirements: 10.1, 10.2_
- [x] 13.3 Add a unit test for a missing status count
  - Add `src/modules/dashboard/dashboard.service.spec.ts`. Map a `groupBy` result that omits a status onto `0`, and assert `Object.keys` of the response equal the four count names and do not include revenue or attendance. Run with `pnpm test`.
  - _Requirements: 10.1, 10.2_

- [x] 14. Prove permission checks read RolePermission after sign-in
  - Add the optional property test that a token issued earlier follows the committed permission row.
  - _Requirements: 11.1, 11.2, 11.3, 11.6_
- [x]* 14.1 Write the property test that permission checks read RolePermission
  - Add `test/permission-enforcement.property.e2e-spec.ts` using `test/helpers/gym-platform.ts`. Name it `Feature: gym-saas-foundation, Property 8: Permission reads use RolePermission after the token is issued`. For any role, any of the seven permissions, and any JWT whose `sub` was signed before a change to that permission, sign in, `PATCH /roles/permissions`, then call the mapped route with the original bearer token. The request is rejected when the committed `RolePermission.enabled` is false and is not rejected for a disabled permission when the committed value is true. The decision matches the row read on that request, not a claim inside the token. The token still works afterward. A protected route with no token returns 401 `Authenticated_Session is required` and writes nothing. Run at least 100 examples with `pnpm test:e2e`.
  - **Property 8: Permission reads use RolePermission after the token is issued**
  - **Validates: Requirements 11.2, 11.3**
  - _Requirements: 11.1, 11.2, 11.3, 11.6_

- [x] 15. Cover the remaining acceptance examples
  - Add the example end-to-end cases from the design that are not properties.
  - _Requirements: 1.4, 2.5, 3.4, 6.2, 7.3, 8.10, 10.2_
- [x] 15.1 Add end-to-end examples for the remaining acceptance messages
  - Add `test/phase1-examples.e2e-spec.ts` using `test/helpers/gym-platform.ts`. Cover an invalid registration email (`Email_Address is not valid`, no user created), an empty sign-in password (`Sign-in input is invalid`, no token), `GET /owner-profile` before any put (empty strings and zero `OwnerProfile` rows), setup completion with one field still null (`Setup is incomplete`, row unchanged), activation of a non-pending gym (`Only a pending gym can be activated`), a role-name case collision (`Role name is already used`), and a dashboard body that does not contain revenue or attendance keys. Run with `pnpm test:e2e`.
  - _Requirements: 1.4, 2.5, 3.4, 6.2, 7.3, 8.10, 10.2_


## Notes

Passwords use the installed `bcrypt` package at cost 12. Do not add argon2, a pre-hash, or a refresh token. The database is six tables only (`UserAccount`, `Role`, `Permission`, `RolePermission`, `OwnerProfile`, `Gym`), with unique `Gym.ownerId`, one gym row for name, logo string, address, contact, and timing, and setup edits rejected while status is `pending` or `active`. Permission checks load `RolePermission` on each request. Optional tasks marked `*` are the property tests for the correctness properties in the design. Parent tasks are sequencing headers; the waves below list only the numbered subtasks.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "2.4", "2.5", "4.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.3", "2.6"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 6, "tasks": ["5.2"] },
    { "id": 7, "tasks": ["5.3"] },
    { "id": 8, "tasks": ["5.4", "6.1"] },
    { "id": 9, "tasks": ["6.2"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["8.1"] },
    { "id": 13, "tasks": ["8.2"] },
    { "id": 14, "tasks": ["9.1"] },
    { "id": 15, "tasks": ["9.2"] },
    { "id": 16, "tasks": ["9.3", "9.4", "9.5"] },
    { "id": 17, "tasks": ["10.1"] },
    { "id": 18, "tasks": ["10.2"] },
    { "id": 19, "tasks": ["10.3"] },
    { "id": 20, "tasks": ["10.4"] },
    { "id": 21, "tasks": ["11.1"] },
    { "id": 22, "tasks": ["11.2", "11.3"] },
    { "id": 23, "tasks": ["12.1"] },
    { "id": 24, "tasks": ["12.2"] },
    { "id": 25, "tasks": ["13.1"] },
    { "id": 26, "tasks": ["13.2", "13.3"] },
    { "id": 27, "tasks": ["14.1"] },
    { "id": 28, "tasks": ["15.1"] }
  ]
}
```
