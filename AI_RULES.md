# Gym SaaS — AI Development Rules

## 1. Purpose

This file defines mandatory rules for AI-assisted development of the Gym SaaS Phase 1 backend.

The AI MUST follow:

1. The Requirements Document.
2. This AI_RULES.md file.
3. The existing project architecture.
4. Existing code conventions.
5. Existing database schema and migrations.

The AI MUST NOT invent business requirements.

If the Requirements Document and existing code conflict, STOP and report the conflict before making a destructive change.

---

# 2. Source of Truth

## Priority Order

When implementing functionality, use this priority:

1. Explicit user instruction in the current task
2. Phase 1 Requirements Document
3. `AI_RULES.md`
4. Existing architecture and code
5. Existing tests
6. General engineering best practices

General knowledge MUST NOT override an explicit Phase 1 requirement.

---

# 3. Anti-Hallucination Rules

## 3.1 Never Invent Requirements

The AI MUST NOT introduce functionality that is not required.

Do NOT automatically add:

- subscriptions
- payments
- Razorpay
- UPI
- invoices
- attendance
- member management
- staff management
- diet plans
- workout plans
- notifications
- WhatsApp integration
- SMS
- email campaigns
- analytics beyond Phase 1
- gym branches
- multi-gym ownership
- commissions
- revenue sharing
- coupons
- referral systems
- file storage
- cloud storage
- AI features
- reports
- audit systems
- chat
- mobile-specific functionality

unless explicitly requested later.

Phase 2 adds manual subscriptions as defined in §63. Payment gateways, including Razorpay and UPI, invoices, and coupons stay excluded.

Phase 3 adds member records and memberships as defined in §64. Attendance, QR check-in, and Super_Admin monitoring stay excluded.

Phase 4 adds staff accounts, role templates, and a staff audit log as defined in §65. Attendance, QR check-in, branches, and Super_Admin monitoring stay excluded.

Phase 5 adds finance and billing as defined in §66. Payment gateways, bank payouts, PDF invoices, and invoice emails stay excluded.

Phase 6 adds stored messages and retention reminders as defined in §67. WhatsApp, SMS, and push providers, and scheduled jobs, stay excluded.

Gym profile fields are defined in §68. File upload and image storage stay excluded.

---

# 4. Phase 1 Scope

Phase 1 contains only:

- Super_Admin
- Gym_Owner
- User_Account
- Role
- Permission
- Owner_Profile
- Gym
- Platform_Stats
- Authentication
- Authorization
- Gym setup
- Gym approval
- User administration
- Dashboard

Staff accounts and member accounts are OUT OF SCOPE for Phase 1. Members are defined in §64. Staff accounts are defined in §65. Finance is defined in §66. Communication is defined in §67.

---

# 5. Current Architecture

The backend MUST follow this structure:

```text
src/
  main.ts
  app.module.ts

  common/
    constants/
    decorators/
    filters/
    guards/
    interceptors/
    interfaces/
    pipes/

  config/
    configuration.ts

  infrastructure/
    database/

  modules/
    auth/
    users/
    roles/
    owner-profiles/
    gyms/
    dashboard/
    plans/
    subscriptions/
    members/
    staff/
    finance/
    communications/
    health/

test/
  app.e2e-spec.ts
```

Do not create random top-level folders.

Do not create duplicate architecture such as:

```text
src/services/
src/controllers/
src/repositories/
src/utils/
src/helpers/
```

unless the project architecture is explicitly changed.

---

# 6. Module Boundaries

## auth

Responsible for:

- registration
- sign-in
- authentication strategies
- authentication DTOs
- session/token creation

Auth MUST NOT contain Gym business logic.

---

## users

Responsible for:

- User_Account
- user lookup
- user listing
- role assignment

Users MUST NOT directly implement Gym setup logic.

---

## roles

Responsible for:

- Role
- Permission
- role creation
- permission state
- role listing
- permission validation

Permissions MUST NOT be hardcoded independently inside every controller.

---

## owner-profiles

Responsible for:

- Owner_Profile creation/update
- Owner_Profile retrieval

---

## gyms

Responsible for:

- Gym creation
- Gym profile
- Gym setup
- Gym status
- setup completion
- pending gyms
- gym activation

---

## dashboard

Responsible for:

- Platform_Stats
- dashboard read operations

Dashboard MUST NOT become a general analytics module.

---

## health

Responsible only for health/readiness checks.

---

# 7. app.module.ts Rule

`app.module.ts` is the composition root only.

It SHOULD:

- import modules
- configure global infrastructure
- configure global guards/interceptors/filters where required

It MUST NOT contain:

- business logic
- Gym logic
- authentication logic
- database queries
- role logic
- permission logic

---

# 8. common/ Rule

`common/` contains reusable technical components only.

Allowed:

- decorators
- guards
- filters
- interceptors
- pipes
- interfaces
- constants

Do NOT place business services inside `common/`.

Bad:

```text
common/services/gym.service.ts
```

Good:

```text
modules/gyms/gyms.service.ts
```

---

# 9. Authentication Rules

## Registration

Registration creates:

```text
User_Account
  └── Role = Gym_Owner
```

Registration MUST NOT:

- create a Gym
- create Owner_Profile
- create an Authenticated_Session

The password MUST only be stored as a one-way verification value.

The password or password hash MUST NEVER be returned in an API response.

---

# 10. Sign-In Rules

There is ONE sign-in flow for:

- Super_Admin
- Gym_Owner

Do NOT create:

```text
/admin/login
/owner/login
```

unless explicitly required.

Use one authentication action.

A successful sign-in creates an Authenticated_Session identifying the User_Account.

Authentication MUST NOT depend on permissions.

A user can sign in even when a permission is disabled.

---

# 11. Password Security

Never store plaintext passwords.

Never return:

```json
{
  "password": "...",
  "passwordHash": "..."
}
```

Use a proper password hashing/verification mechanism.

Never log:

- password
- password hash
- JWT secret
- authentication token
- sensitive credentials

---

# 12. Email Rules

Follow the exact Phase 1 Requirements Document.

Do not silently change email semantics.

The requirements specify:

- trim only leading/trailing spaces, tabs, carriage returns and line feeds
- 3–254 characters after trimming
- exactly one `@`
- at least one character before `@`
- at least one character after `@`
- no whitespace characters remaining
- ASCII A-Z/a-z comparisons are case-insensitive for uniqueness
- other characters are compared exactly
- stored email preserves submitted letter case after trimming

Do not introduce additional email normalization unless explicitly requested.

---

# 13. Role Rules

Phase 1 starts with exactly:

```text
Super_Admin
Gym_Owner
```

Do not rename them.

Do not silently create:

```text
Admin
Staff
Manager
Member
Trainer
Accountant
```

---

# 14. Permission Rules

The complete Phase 1 permission set is:

```text
view_dashboard
manage_users
manage_roles
review_gyms
create_gym
manage_owner_profile
manage_gym_setup
```

Do not invent additional permissions.

Every protected action MUST map to the appropriate permission.

---

# 15. Default Permission Rules

## Super_Admin

Default enabled:

```text
view_dashboard
manage_users
manage_roles
review_gyms
```

Default disabled:

```text
create_gym
manage_owner_profile
manage_gym_setup
```

The following four permissions MUST remain enabled on Super_Admin:

```text
view_dashboard
manage_users
manage_roles
review_gyms
```

They cannot be disabled by the Phase 1 role-management operation.

---

## Gym_Owner

Default enabled:

```text
create_gym
manage_owner_profile
manage_gym_setup
```

Default disabled:

```text
view_dashboard
manage_users
manage_roles
review_gyms
```

---

# 16. Authorization Rules

Authentication and authorization are different.

Authentication:

```text
Who are you?
```

Authorization:

```text
Are you allowed to perform this action?
```

Every protected action MUST perform both checks.

Expected flow:

```text
Request
  ↓
Authentication
  ↓
Current User
  ↓
Current Role
  ↓
Permission
  ↓
Controller
  ↓
Service
```

---

# 17. Permission Evaluation

Permission state MUST be evaluated from the current saved Role state.

Do NOT permanently cache permissions inside a JWT unless explicitly designed to support permission changes.

If a permission changes after a session starts, subsequent requests MUST use the newly saved permission state.

---

# 18. Protected Actions

Use this mapping:

```text
Dashboard read
→ view_dashboard

User list
→ manage_users

Role assignment
→ manage_users

Role creation
→ manage_roles

Role list
→ manage_roles

Permission changes
→ manage_roles

Pending Gym list
→ review_gyms

Gym activation
→ review_gyms

Gym creation
→ create_gym

Owner_Profile read
→ manage_owner_profile

Owner_Profile update
→ manage_owner_profile

Own Gym read
→ manage_gym_setup

Gym profile update
→ manage_gym_setup

Basic setup update
→ manage_gym_setup

Setup completion
→ manage_gym_setup
```

---

# 19. Gym Ownership Rule

Phase 1 allows:

```text
One Gym_Owner
    ↓
Maximum one Gym
```

A Gym_Owner MUST NOT create a second Gym.

Do not implement multi-gym ownership unless explicitly requested.

---

# 20. Gym Status State Machine

Allowed states:

```text
setup_in_progress
        ↓
     pending
        ↓
      active
```

Allowed transitions:

```text
setup_in_progress → pending
pending → active
```

No other transitions are allowed in Phase 1.

Do NOT implement:

```text
active → pending
active → suspended
pending → rejected
active → inactive
setup_in_progress → active
```

unless explicitly requested.

---

# 21. Gym Creation

Gym creation:

```text
Authenticated Gym_Owner
        ↓
Permission: create_gym
        ↓
Create Gym
        ↓
status = setup_in_progress
```

Creating a Gym MUST NOT automatically:

- activate the Gym
- make it pending
- create a second Gym
- create members
- create staff

---

# 22. Gym Setup

Setup fields are:

```text
Gym_Name
address
contact
timing
Logo_Value
```

Do not create additional mandatory fields.

Do not silently add:

```text
GST
PAN
latitude
longitude
website
Instagram
ownerName
capacity
registrationNumber
```

unless explicitly requested.

---

# 23. Setup Completion

Setup completion is allowed only when all required setup fields are present and non-empty:

```text
Gym_Name
address
contact
timing
Logo_Value
```

Then:

```text
setup_in_progress
        ↓
pending
```

Setup completion MUST NOT activate the Gym.

---

# 24. Gym Approval

Only a Super_Admin with:

```text
review_gyms
```

enabled can activate a pending Gym.

Activation:

```text
pending
   ↓
active
```

Activation MUST NOT modify:

- Gym_Name
- address
- contact
- timing
- Logo_Value
- Gym_Owner

---

# 25. Pending Gym Rule

A pending Gym remains:

```text
pending
```

until explicitly activated by an authorized Super_Admin.

Do not automatically activate pending Gyms.

---

# 26. Owner Profile

Owner_Profile contains only:

```text
displayName
contact
```

One Gym_Owner has one Owner_Profile.

Do not add:

- avatar
- bio
- address
- GST
- PAN
- date of birth
- bank account
- social links

unless explicitly requested.

---

# 27. Database Rules

Prisma is the database access layer.

Prisma Client belongs under:

```text
src/infrastructure/database/
```

Database access MUST NOT be performed directly inside controllers.

Bad:

```text
Controller
  ↓
Prisma query
```

Good:

```text
Controller
  ↓
Service
  ↓
Prisma / Repository layer
  ↓
Database
```

---

# 28. Database Integrity

Business invariants SHOULD be enforced at the database level where possible.

Examples:

- unique User email identity
- one Gym per Gym_Owner
- valid Role references
- valid Gym status values

Do not rely only on frontend validation.

---

# 29. DTO Rules

Every external request MUST be validated through DTOs.

Do not trust request bodies.

DTOs MUST define:

- required fields
- optional fields
- type validation
- length validation
- allowed values

Do not put database queries inside DTOs.

Do not put business logic inside DTOs.

---

# 30. Controller Rules

Controllers should be thin.

Controller responsibilities:

1. Receive request.
2. Validate DTO.
3. Read authenticated user.
4. Call service.
5. Return response.

Controllers MUST NOT contain complex business rules.

Bad:

```text
if gym.status === ...
if owner.hasGym === ...
prisma.gym.find...
```

Move business logic into services.

---

# 31. Service Rules

Services contain business rules.

Examples:

```text
GymService
RoleService
UserService
AuthService
OwnerProfileService
DashboardService
```

Services MUST enforce Phase 1 invariants.

---

# 32. Response Rules

Never return sensitive fields.

Never expose:

```text
passwordHash
JWT secret
internal authentication data
database credentials
```

Responses should contain only fields required by the API contract.

Do not expose entire Prisma entities by default.

Prefer explicit response DTOs.

---

# 33. Error Handling

Use consistent HTTP errors.

Examples:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
```

Use:

```text
401
```

when authentication is missing/invalid.

Use:

```text
403
```

when authentication exists but permission is disabled.

Use:

```text
409
```

for conflicts such as duplicate account/Gym creation where appropriate.

Do not expose internal stack traces to clients.

---

# 34. Security Rules

Never commit:

```text
.env
JWT secrets
database passwords
production credentials
API keys
private keys
```

Use configuration/environment variables.

Configuration MUST be centralized.

Example:

```text
config/configuration.ts
```

---

# 35. Configuration Rules

The configured initial Super_Admin must come from configuration.

Required configuration includes:

```text
port
database
JWT configuration
initial Super_Admin email
initial Super_Admin password
```

Do not hardcode the initial Super_Admin password in application source code.

---

# 36. Seed / Initialization Rules

The platform must start with one initial Super_Admin.

Initialization MUST be idempotent.

Running initialization twice MUST NOT create duplicate Super_Admin accounts.

---

# 37. API Design Rules

Use REST-style endpoints.

Keep endpoint naming consistent.

Prefer:

```text
POST   /auth/register
POST   /auth/sign-in

GET    /users
PUT    /users/:id/role

GET    /roles
POST   /roles
PUT    /roles/:id/permissions

GET    /owner-profile
PUT    /owner-profile

POST   /gyms
GET    /gyms/me
PUT    /gyms/me/profile
PUT    /gyms/me/setup
POST   /gyms/me/complete-setup

GET    /gyms/pending
POST   /gyms/:id/activate

GET    /dashboard
```

These endpoint names are architectural suggestions, NOT additional requirements.

If the existing API contract specifies different routes, follow the existing contract.

---

# 38. No Frontend Assumptions

The backend MUST NOT assume:

- React
- Next.js
- mobile app
- browser storage
- localStorage
- frontend validation
- specific UI

The backend API must enforce its own rules.

---

# 39. No Business Logic in Guards

Guards should answer questions such as:

```text
Is the user authenticated?
Does the current role have this permission?
```

Guards MUST NOT perform complex Gym business operations.

---

# 40. Decorator Rules

Reusable decorators may include:

```text
@Public()
@CurrentUser()
@RequirePermission(...)
```

Do not create decorators for every individual business action.

Prefer reusable authorization abstractions.

---

# 41. Logging Rules

Logs MUST NOT contain:

- passwords
- password hashes
- JWTs
- secrets
- authorization headers
- sensitive user credentials

Useful operational information may include:

```text
request id
route
status code
duration
error type
```

Avoid excessive logging.

---

# 42. Testing Rules

Every Phase 1 business rule should have tests.

Minimum test coverage should include:

## Authentication

- valid registration
- duplicate email
- invalid email
- invalid password
- valid sign-in
- invalid credentials
- missing credentials

## Owner Profile

- create profile
- update profile
- read profile
- invalid profile

## Gym

- create first Gym
- prevent second Gym
- update setup
- read own Gym
- prevent access to another owner's Gym
- prevent setup update after pending
- prevent setup update after active

## Setup

- incomplete setup cannot complete
- complete setup becomes pending
- pending cannot complete again
- active cannot complete

## Approval

- Super_Admin can view pending Gyms
- authorized Super_Admin can activate
- non-authorized user cannot activate
- setup_in_progress cannot activate
- active cannot activate again

## Roles

- default roles exist
- create role
- duplicate role rejected
- permission update
- invalid permission rejected
- protected Super_Admin permissions cannot be disabled

## Authorization

- unauthenticated request rejected
- disabled permission rejected
- enabled permission allowed
- permission changes affect subsequent requests

---

# 43. Test First for Business Changes

Before changing business logic:

1. Identify the requirement.
2. Identify affected module.
3. Identify affected tests.
4. Update/add tests.
5. Implement the change.
6. Run tests.
7. Verify no unrelated behavior changed.

---

# 44. Migration Rules

Never modify an existing migration that has already been applied.

Create a new migration for schema changes.

Never delete production data as part of normal development.

Never silently change existing data semantics.

---

# 45. Dependency Rules

Before adding a package, ask:

1. Is it actually required?
2. Does NestJS/Node/Prisma already provide the capability?
3. Does the package introduce unnecessary complexity?
4. Is the package maintained?
5. Does it affect security?

Do not add dependencies merely for convenience.

---

# 46. Naming Rules

Use consistent naming.

Classes:

```text
AuthService
UsersService
RolesService
GymsService
DashboardService
```

DTOs:

```text
RegisterDto
SignInDto
CreateRoleDto
UpdatePermissionDto
CreateOwnerProfileDto
UpdateGymSetupDto
```

Enums:

```text
GymStatus
Permission
RoleName
```

Database naming should remain consistent with Prisma conventions.

Do not randomly mix:

```text
gym_status
gymStatus
GymStatus
```

across the same layer without a deliberate mapping.

---

# 47. No Duplicate Logic

Do not duplicate authorization checks in every service.

Do not duplicate email validation.

Do not duplicate Gym ownership checks.

Do not duplicate permission names.

Create reusable abstractions where appropriate.

---

# 48. No Premature Abstraction

Do not create generic frameworks for functionality that Phase 1 does not need.

Avoid unnecessary:

```text
BaseService
BaseController
GenericCrudService
GenericRepositoryFactory
GenericBusinessEngine
```

unless there is a demonstrated need.

Simple code is preferred.

---

# 49. Do Not Over-Engineer Phase 1

The goal is:

```text
Correct
Secure
Testable
Maintainable
Simple
```

NOT:

```text
Maximum abstraction
Maximum microservices
Maximum dependencies
Maximum architecture
```

Keep Phase 1 as a modular monolith unless explicitly instructed otherwise.

---

# 50. No Microservices

Do not split Phase 1 into:

```text
auth-service
gym-service
user-service
role-service
dashboard-service
```

The Phase 1 backend should remain one application.

Modules provide separation.

---

# 51. Transaction Rules

Use database transactions when multiple related database changes must succeed or fail together.

Examples:

- role assignment with related permission operations
- Gym creation with required relationships
- initialization of required platform records

Do not use transactions unnecessarily for simple reads.

---

# 52. Ownership Security

A Gym_Owner may access only their own Gym.

Never trust:

```text
gymId
ownerId
userId
```

from the request body when the identity can be obtained from the authenticated session.

Prefer:

```text
Authenticated User
        ↓
User ID
        ↓
Owned Gym
```

---

# 53. Never Trust Client-Supplied Role

Registration MUST always create:

```text
Gym_Owner
```

The client MUST NOT be able to register as:

```text
Super_Admin
```

Do not accept:

```json
{
  "role": "Super_Admin"
}
```

as a mechanism for privilege escalation.

---

# 54. Never Trust Client-Supplied Owner ID

For Gym_Owner operations, determine the owner from the authenticated session.

Do not allow:

```json
{
  "ownerId": "another-user"
}
```

to override the authenticated owner.

---

# 55. Requirement Traceability

When implementing a feature, identify the requirement it satisfies.

Example:

```text
Feature:
Gym activation

Requirement:
Requirement 7

Permission:
review_gyms

State transition:
pending → active
```

If a feature cannot be mapped to a Phase 1 requirement, treat it as a new requirement and ask for confirmation.

---

# 56. Before Coding

Before writing code, the AI MUST determine:

```text
1. Which requirement is being implemented?
2. Which module owns the behavior?
3. Which permission controls it?
4. Which database entities are affected?
5. Which state transitions are allowed?
6. What validation is required?
7. What existing tests could be affected?
8. Does the request introduce a new requirement?
```

If any answer is unclear and cannot be safely inferred from the Requirements Document, ASK instead of guessing.

---

# 57. Before Modifying Existing Code

The AI MUST inspect:

```text
relevant module
related service
related controller
DTOs
guards
database schema
existing tests
configuration
```

Do not overwrite existing implementation blindly.

---

# 58. After Coding

The AI MUST verify:

```text
TypeScript compilation
Lint
Unit tests
E2E tests
Prisma schema/migration validity
No accidental API changes
No sensitive data exposure
No functionality outside Phase 1, §63, §64, §65, §66, §67, and §68
```

---

# 59. Change Summary

For every meaningful implementation change, report:

```text
Requirement:
<requirement>

Files changed:
<files>

Behavior added:
<behavior>

Tests added/updated:
<tests>

Database changes:
<yes/no>

API changes:
<yes/no>

Potential breaking changes:
<none/details>
```

---

# 60. Stop Conditions

The AI MUST STOP and ask for clarification when:

- requirements contradict each other
- an important business rule is missing
- a new role is requested but its permissions are undefined
- a new Gym status is needed
- a new permission is needed
- multiple Gyms per owner are requested
- members or staff beyond §64 and §65 are requested
- payment functionality beyond §66 is requested
- a database migration would destroy or reinterpret existing data
- an API contract is unclear
- authentication behavior is unclear
- security implications are unclear

Do not fill these gaps with assumptions.

---

# 61. Phase Boundary

If the user requests functionality outside Phase 1:

1. Identify it as outside current scope.
2. Do not implement it silently.
3. Ask whether the requirement should be added to a future phase.
4. Keep Phase 1 code isolated from future functionality.

Example:

```text
User asks:
"Add member attendance."

AI response:
"Attendance is outside Phase 1. Should I define it as a Phase 2 requirement?"
```

---

# 62. Final Rule

The AI is an implementation assistant, not a product decision maker.

When requirements are explicit:

```text
FOLLOW THEM EXACTLY.
```

When requirements are missing:

```text
ASK.
```

When requirements conflict:

```text
STOP AND REPORT.
```

When functionality is outside Phase 1:

```text
DO NOT IMPLEMENT WITHOUT CONFIRMATION.
```

When security and business requirements conflict:

```text
DO NOT WEAKEN SECURITY TO MAKE THE FEATURE WORK.
```

The objective is to implement the specified Gym SaaS Phase 1 accurately without inventing product behavior.

---

# 63. Phase 2: Plan + Subscription Engine

The user confirmed Phase 2 on 2026-11-22. Its source of truth is `.kiro/specs/plan-subscription-engine/` (`requirements.md`, `design.md`, and `tasks.md`). Sections 1 to 62 still apply. Where they list only Phase 1 items, this section adds to them.

## 63.1 Phase 2 adds only

- Plan: a configurable catalog. `basic`, `pro`, and `enterprise` are seeded inactive with price 0, trial 0, no feature flags, and every limit 0.
- Subscription: belongs to one Gym, started by a trial or by manual payment.
- Entitlements read.
- The modules `src/modules/plans/` and `src/modules/subscriptions/`.

## 63.2 Phase 2 still excludes

- payment gateways, including Razorpay, UPI, and Stripe
- invoices, receipts, refunds, and proration
- coupons and add-ons
- cancellation
- yearly prices and currencies other than INR
- enforcement of any plan limit or feature flag
- scheduled jobs and notifications
- any change to Platform_Stats
- any change to Gym_Status or its transitions (§20)

## 63.3 Permissions

The complete permission set is the seven Phase 1 names in §14 plus:

```text
view_plans
manage_plans
manage_subscriptions
manage_gym_subscription
```

Defaults:

| Permission | Super_Admin | Gym_Owner | Other roles |
| --- | --- | --- | --- |
| `view_plans` | disabled | enabled | disabled |
| `manage_plans` | enabled, locked | disabled | disabled |
| `manage_subscriptions` | enabled, locked | disabled | disabled |
| `manage_gym_subscription` | disabled | enabled | disabled |

`manage_plans` and `manage_subscriptions` cannot be disabled on Super_Admin, in addition to the four permissions locked in §15.

## 63.4 Protected actions

```text
Available plan list
→ view_plans

Full plan list, plan creation, plan update
→ manage_plans

Subscription list, mark paid
→ manage_subscriptions

Own subscription read, entitlements read, trial start, plan request
→ manage_gym_subscription
```

## 63.5 Subscription rules

- A Subscription belongs to a Gym. A Gym_Owner can select a Plan only when Gym_Status is `active`.
- Stored states are `trialing`, `pending_payment`, and `active`. The reported states add `expired`, which is computed on read from the period end.
- Prices are whole paise in INR.
- Limits are `maxMembers`, `maxStaff`, and `maxBranches`. `null` means unlimited.
- A Subscription copies the Plan's values when it starts and when it is renewed. Plan edits never change a Subscription.
- Each Gym gets one trial ever and has at most one `pending_payment` Subscription. The database enforces both.
- A Super_Admin marks a request paid by hand. That ends the Subscription in effect, with no credit for remaining time.
- A trial cannot be marked paid. The owner submits a plan request instead.
- One billing period is one calendar month in UTC.
- A deactivated Plan is hidden from owners but stays renewable.
- Plans are never deleted.

---

# 64. Phase 3: Core Gym Management

The user confirmed Phase 3 on 2026-11-22. Its source of truth is `.kiro/specs/core-gym-management/` (`requirements.md`, `design.md`, and `tasks.md`). Sections 1 to 63 still apply. Where they list only earlier items, this section adds to them.

## 64.1 Phase 3 adds only

- Member: a record owned by one Gym. No login and no User_Account.
- Membership_Product: a product that Gym sells. Name, price in paise, duration in days, active flag.
- Membership: at most one per Member. Assign, renew, switch, freeze, and unfreeze.
- A Member can be marked left. A left Member does not use a seat.
- A payment record on assign, renew, and switch: list price, amount received, date, and cash, UPI, or card. No gateway.
- The module `src/modules/members/`.
- The Permission `manage_members`, enabled on Gym_Owner and disabled on Super_Admin. It is not locked.

## 64.2 Phase 3 still excludes

- attendance and QR check-in
- Super_Admin monitoring, revenue, and usage metrics
- staff accounts and branches
- deleting a Member or a Membership_Product
- editing or deleting a payment record
- refunds and payment gateways
- enforcing `maxStaff`, `maxBranches`, or Feature_Flags

## 64.3 Protected actions

```text
Member list, member create, member update, leave, and restore
Membership product list, create, and update
Assign, renew, switch, freeze, and unfreeze
→ manage_members
```

Every action requires the caller's Gym and Gym_Status `active`.

## 64.4 Membership rules

- A Member may be stored with no Membership.
- Renew keeps the same product. An in-effect renew extends the stored end. An expired renew starts at the current time.
- Duration is a whole number of 24-hour days, from 1 to 3650.
- Stored states are `active` and `frozen`. `expired` is computed on read.
- Freeze stores one start time. Unfreeze adds the elapsed time to the end date. Past freezes are not stored.
- `maxMembers` from Entitlements blocks creating a Member who is not left. `null` means unlimited. `0` blocks every create. A left Member does not use a seat. Edit, renew, freeze, and unfreeze do not consume a seat. A lower limit later does not remove stored Members.
- Switch replaces the current product. The new period starts at the current time. Unused days are not credited. A frozen Membership can be switched, and the pause is cleared.
- Assign, renew, and switch each store one payment row. The row is not edited or deleted. The amount received may be lower than the list price.
- The default Member list omits left Members. `status` may be `active`, `expiring`, `expired`, `frozen`, `none`, or `left`. `expiring` means in effect and ending within 7 days.
- Creating a Member with a contact already stored for that Gym is rejected unless the request explicitly allows the duplicate.

---

# 65. Phase 4: Staff + Permissions

The user confirmed Phase 4 on 2026-11-22. Its source of truth is `.kiro/specs/staff-permissions/` (`requirements.md`, `design.md`, and `tasks.md`). Sections 1 to 64 still apply. Where they list only earlier items, this section adds to them.

## 65.1 Phase 4 adds only

- Role_Template: three platform templates, `Owner`, `Manager`, and `Staff`. A Super_Admin with `manage_roles` reads them and changes their view, create, and manage flags. Templates are not Roles and are not deleted.
- Staff_Member: a User_Account that can sign in, linked to one Gym. The Gym_Owner creates it. It has a title `trainer`, `reception`, or `accountant`, a copied template, and its own view, create, and manage flags.
- The Role `Gym_Staff`. Public registration still creates only `Gym_Owner`.
- The Permission `manage_staff`, enabled on Gym_Owner and disabled on Super_Admin and on Gym_Staff. It is not locked.
- Enforcement of `maxStaff` from Entitlements when a staff member is created or enabled. `null` means unlimited. `0` blocks every create. A disabled staff member does not use a seat.
- An append-only audit log of template and staff changes. It is not a general audit system.
- The module `src/modules/staff/`.

## 65.2 Phase 4 still excludes

- attendance and QR check-in
- branches, payroll, shift schedules, and notifications
- Super_Admin monitoring of a gym's staff or members
- deleting a staff member, a template, or an audit row
- staff self-registration and password-reset email
- payment gateways
- enforcing `maxBranches` or Feature_Flags
- any change to Gym_Status or its transitions (§20)

## 65.3 Protected actions

```text
Role template list and update
Platform audit read
→ manage_roles

Staff list, create, update, disable, and enable
Gym audit read
→ manage_staff

Member list and membership product list
→ manage_members for a non-staff caller, or view for a staff caller

Member create, membership product create, and assign
→ manage_members for a non-staff caller, or create for a staff caller

Member update, leave, restore, product update, renew, switch, freeze, and unfreeze
→ manage_members for a non-staff caller, or manage for a staff caller
```

Staff routes require the caller's Gym and Gym_Status `active`. Template routes do not.

## 65.4 Staff rules

- A staff member belongs to one Gym. The request body does not select a Gym or an owner.
- The title does not grant permissions. The three flags do, and they are independent.
- Creating a staff member copies the template's flags. Later template edits do not change staff already stored.
- A Gym_Owner may replace the flags or apply a template again.
- Seeded flags are: Owner has view, create, and manage. Manager has view and create. Staff has view only.
- There is one sign-in endpoint. A disabled staff member cannot sign in. Authentication still does not depend on the three flags.
- A staff caller is authorized only by that staff member's flags. Enabling `manage_members` on `Gym_Staff` does not widen those flags.
- A non-staff caller keeps the Phase 3 `manage_members` checks.
- `maxStaff` counts staff who are not disabled. A lower limit later does not remove stored staff. Disable and update do not consume a seat. Enable does.
- The audit log stores no password and no password hash. A failed change stores no audit row.

---

# 66. Phase 5: Finance + Billing

The user confirmed Phase 5 on 2026-11-22. Its source of truth is `.kiro/specs/finance-billing/` (`requirements.md`, `design.md`, and `tasks.md`). Sections 1 to 65 still apply. Where they list only earlier items, this section adds to them.

## 66.1 Phase 5 adds only

- Platform_Charge: one row when a subscription is marked paid, renewed, or marked failed. A paid charge copies the commission percent.
- Refund: a full refund of one paid platform charge. It does not change the subscription period.
- Failed subscription status: `pending_payment` can become `failed`. That status is terminal and is not in effect.
- Settlement: one record per UTC month for the commission still paid in that month.
- Expense: an append-only gym expense.
- Reads: platform report, gym income from membership payments, outstanding, ledger, invoice, receipt, and gym report.
- The Permission `manage_platform_finance`, enabled and locked on Super_Admin.
- The Permission `manage_gym_finance`, enabled on Gym_Owner and disabled on Super_Admin. It is not locked.
- The module `src/modules/finance/`.
- `COMMISSION_PERCENT`, a whole number from 0 to 100. Missing means 0.

## 66.2 Phase 5 still excludes

- payment gateways, including Razorpay, Stripe, and UPI collection
- bank payouts and stored card or bank details
- PDF invoices, invoice email, and receipt email
- partial refunds and proration
- collecting an outstanding balance later
- editing or deleting a membership payment or an expense
- backfilling charges for payments recorded before this phase
- staff access to finance
- any change to dashboard counts or Gym_Status

## 66.3 Protected actions

```text
Platform payment list, refund, mark failed, settlement, platform report
→ manage_platform_finance

Gym income, expense, outstanding, ledger, invoice, receipt, gym report
→ manage_gym_finance

Mark subscription paid
→ manage_subscriptions
```

Gym finance routes require the caller's Gym and Gym_Status `active`.

## 66.4 Finance rules

- Amounts are whole paise in INR.
- Commission is `floor(amount * percent / 100)` and is copied onto the charge.
- A refund is the full amount and does not shorten the subscription.
- Gym income is the membership payment recorded by assign, renew, or switch. There is no second income action.
- Outstanding is the positive gap between list price and amount received. It is a report only.
- The ledger running balance is income received minus expenses. It starts at 0 for the requested range.
- Invoice and receipt are JSON reads of one membership payment.
- The request body does not select a Gym.

---

# 67. Phase 6: Communication + Member Retention

The user confirmed Phase 6 on 2026-11-23. Its source of truth is `.kiro/specs/communication-retention/` (`requirements.md`, `design.md`, and `tasks.md`). Sections 1 to 66 still apply. Where they list only earlier items, this section adds to them.

## 67.1 Phase 6 adds only

- Message_Template: platform copy for `whatsapp`, `sms`, and `push`. Templates are not deleted.
- Message: one stored send to one Member of the caller's Gym. Status is `sent` or `failed`.
- Gym automation settings for `expiry`, `payment`, and `inactive`, run by a request, not by a scheduler.
- Delivery analytics as counts by channel and status.
- The Permission `manage_message_templates`, enabled and locked on Super_Admin.
- The Permission `manage_communications`, enabled on Gym_Owner and disabled on Super_Admin. It is not locked.
- The module `src/modules/communications/`.

## 67.2 Phase 6 still excludes

- WhatsApp, SMS, and push providers
- scheduled jobs and email
- device tokens and push delivery to a phone
- editing or deleting a Message or a template
- staff access to communication
- Super_Admin lists of message bodies or member names
- any change to Gym_Status, subscriptions, or dashboard counts

## 67.3 Protected actions

```text
Template list, create, and update
Delivery analytics
→ manage_message_templates

Gym message list, manual send, automation read, automation update, and automation run
→ manage_communications
```

Gym communication routes require the caller's Gym and Gym_Status `active`.

## 67.4 Communication rules

- WhatsApp and SMS are `sent` only when the Member contact has at least 8 digits. Push is stored as `failed` because a Member has no device token.
- Placeholders are `{{memberName}}`, `{{gymName}}`, `{{endDate}}`, and `{{unpaidAmount}}`.
- Expiry is an in-effect Membership ending within 7 days. Payment is an outstanding gap above 0. Inactive is 14 days without an in-effect Membership.
- A run stores at most one automation Message per Member per trigger per UTC day, and at most 100 Messages.
- Left Members are not messaged. The request body does not select a Gym.

---

# 68. Gym profile fields

The user confirmed the optional gym fields on 2026-11-23 and removed gym branding the same day. Branding routes, colours, theme, and button style are not part of the API. Its source of truth for the fields that remain is `.kiro/specs/gym-profile-branding/` (`requirements.md`, `design.md`, and `tasks.md`). Sections 1 to 67 still apply. Where they list only earlier items, this section adds to them.

## 68.1 This section adds only

- Three optional Gym columns: `contactEmail`, `description`, and `mapsUrl`.
- Those fields on `PATCH /gyms/me/profile`, and on every response that already returns a gym.

## 68.2 This section still excludes

- gym branding, including theme, colours, and button style
- a second logo field. The gym logo is an image uploaded to `POST /gyms/me/logo`, not a text value
- any change to Owner_Profile, authentication, roles, the permission set, finance, communication, members, or staff behavior
- audit-log entries for these edits
- any change to Gym_Status or its transitions (§20)
- any change to subscriptions

## 68.3 Protected actions

```text
Gym profile update, including the three optional fields
→ manage_gym_setup
```

No new Permission is added.

## 68.4 Profile rules

- The three fields are optional. A submitted `null` clears that field. An empty string is rejected. They do not count toward setup completion. The five setup fields stay non-clearable.
- They are accepted only by `PATCH /gyms/me/profile`, and only while Gym_Status is `setup_in_progress`. The locked error stays `Gym profile and basic setup cannot be changed while status is pending or active`.
- `contactEmail` reuses the existing email check and is at most 254 characters. `description` is 1 to 500 characters. `mapsUrl` is an absolute `https` URL of at most 2048 characters. Any other scheme is rejected.
- A bad optional value is 400 `Gym profile values are not valid`.
- Gym responses gain `contactEmail`, `description`, and `mapsUrl`. Existing rows are null. No existing response key changes type or meaning.
- `logoValue` is the public path of the uploaded image, or null before an upload. `PATCH /gyms/me/profile` does not accept it. `POST /gyms/me/logo` accepts one `logo` file: PNG, JPEG, WEBP, or GIF, at most 2,000,000 bytes, and only while the gym is `setup_in_progress`. The file bytes must match the declared image type. A missing or invalid file is 400 `Gym logo must be an image`.
