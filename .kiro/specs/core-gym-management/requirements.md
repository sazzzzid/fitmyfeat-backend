# Requirements Document

## Introduction

Phase 3 adds member and membership management for one gym. A Gym_Owner whose Gym is `active` keeps a Member list, defines Membership_Products for that gym, and assigns, renews, freezes, and unfreezes one Membership per Member.

This slice does not include attendance, QR check-in, Super_Admin gym monitoring, revenue, usage metrics, staff, or branches. Those stay out of scope until a later phase.

The user confirmed these decisions:

- A Member is a record the gym owns. A Member cannot sign in and is not a User_Account.
- A Membership_Product belongs to one Gym. It is not a Phase 2 Plan. Platform billing is unchanged.
- A Member can be stored with no Membership. A Member has at most one Membership.
- Membership_Product fields are name, price in paise, duration in days, and an active flag.
- Assign starts a Membership. Renew extends it. Freeze pauses the clock. Unfreeze resumes it.
- Reported statuses are `active`, `frozen`, and `expired`. `expired` is computed from the end date.
- `maxMembers` from the gym's current entitlements blocks creating a Member. `0` blocks every create. `null` means unlimited. A lower limit later does not remove Members already stored. Edit, renew, freeze, and unfreeze do not consume a seat.
- One new Permission, `manage_members`, is enabled on Gym_Owner and disabled on Super_Admin. It is not locked.

These rules make the confirmed decisions testable. Correct them before implementation if they are wrong:

- Renew keeps the Membership's product. Choosing a different product is out of scope.
- Renew of a Membership that is in effect adds the product's current duration to the stored end. Renew of an `expired` Membership starts a new period at the current time. Renew copies the product's current name, price, and duration.
- An inactive product cannot be assigned. Renew of a Membership already on that product still works.
- Duration is a whole number of 24-hour days, from 1 to 3650, not a calendar month.
- Freeze stores the freeze start on the Membership. Unfreeze adds the elapsed freeze to the end date. Past freezes are not kept as separate rows.
- There is no delete of a Member or a Membership_Product.
- Every Phase 3 route requires the caller's Gym and that Gym's status `active`.

## Glossary

- **Member**: A person stored for one Gym. Fields are full name, contact, and optional notes. A Member has no password and no Role.
- **Membership_Product**: A product the Gym sells to Members. It has a name, a price in paise, a duration in days, and an active or inactive state.
- **Membership**: The one link from a Member to a Membership_Product. It stores a snapshot of that product and a period.
- **Membership_Snapshot**: The product name, price in paise, and duration in days copied onto the Membership when it is assigned or renewed.
- **Membership_Period**: The start and end stored on a Membership.
- **In_Effect**: A Membership whose stored state is `active` and whose end is later than the current time.
- **Membership_Status**: The status reported for a Membership. `frozen` when the stored state is `frozen`. `active` when the Membership is In_Effect. `expired` when the stored state is `active` and the end is not later than the current time.
- **Freeze**: The open pause on a Membership. It records the time the pause started.
- **Entitlements**: The Phase 2 read of the Subscription that is in effect for the Gym, including `maxMembers`.

Phase 1 and Phase 2 terms keep their existing meaning.

## Requirements

### Requirement 1: Permission

**User Story:** As a Gym_Owner, I want member and membership actions under one Permission, so that access follows the same Role rules as earlier phases.

#### Acceptance Criteria

1. THE Gym_Platform SHALL add the Permission `manage_members` to the existing Permission set.
2. WHILE no Permission change has been saved, THE Gym_Platform SHALL keep `manage_members` enabled on the Gym_Owner Role and disabled on the Super_Admin Role and on every other Role.
3. WHEN the Gym_Platform starts with data saved before this Permission existed, THE Gym_Platform SHALL add `manage_members` with the states in criterion 2 and SHALL leave every previously saved Permission state unchanged.
4. WHEN a Role is created, THE Gym_Platform SHALL give that Role `manage_members` disabled, together with every other Permission disabled.
5. THE Gym_Platform SHALL accept `manage_members` in a Permission change and SHALL return it in the Role list. `manage_members` is not locked on Super_Admin. The existing locks stay unchanged.
6. THE Gym_Platform SHALL map every Phase 3 route to `manage_members`: Member list, Member create, Member update, Membership_Product list, Membership_Product create, Membership_Product update, assign, renew, freeze, and unfreeze.

### Requirement 2: Create a Member

**User Story:** As a Gym_Owner, I want to add a member, so that I can keep a list of people at my gym.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_members` enabled and the caller's Gym has Gym_Status `active`, WHEN a Member is submitted with a full name of 1 to 100 characters and a contact of 1 to 254 characters, each containing at least one character other than a space, a tab, a carriage return, or a line feed, and with notes omitted or notes of 0 to 1000 characters, THE Gym_Platform SHALL store one Member for that Gym with those values exactly as submitted and with no Membership.
2. IF the submitted full name, contact, or notes does not meet criterion 1, THEN THE Gym_Platform SHALL reject the create with an error indicating that the Member values are not valid and SHALL store nothing.
3. IF the caller has no Gym, THEN THE Gym_Platform SHALL reject the request with the Phase 1 error indicating that the Gym was not found.
4. IF the caller's Gym has Gym_Status `setup_in_progress` or `pending`, THEN THE Gym_Platform SHALL reject the request with an error indicating that member management requires an active Gym and SHALL store nothing.
5. WHEN a Member is created, THE Gym_Platform SHALL count Members already stored for that Gym and SHALL read `maxMembers` from that Gym's Entitlements at that time. IF `maxMembers` is a number and the count is greater than or equal to that number, THEN THE Gym_Platform SHALL reject the create with an error indicating that the Member limit is reached and SHALL store nothing. A `maxMembers` of `null` SHALL NOT reject the create. Empty Entitlements, whose `maxMembers` is 0, SHALL reject the create.
6. WHEN two Member creates for the same Gym would both pass criterion 5 only if the other had not been stored, THE Gym_Platform SHALL store at most `maxMembers` Members for that Gym.
7. IF a later change to the Gym's Subscription lowers `maxMembers` below the number of Members already stored, THEN THE Gym_Platform SHALL leave those Members unchanged.

### Requirement 3: Read and update a Member

**User Story:** As a Gym_Owner, I want to see and correct my member list, so that names and contacts stay accurate.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_members` enabled and the caller's Gym is `active`, WHEN Members are requested, THE Gym_Platform SHALL return every Member of that Gym and no Member of any other Gym, each with its full name, contact, notes, and its Membership or none, ordered by creation time then identifier.
2. WHERE the same conditions hold, WHEN a Member of that Gym is updated with one or more of full name, contact, and notes, and every submitted value meets Requirement 2, THE Gym_Platform SHALL store the submitted values, leave omitted values unchanged, leave the Membership unchanged, and return the Member.
3. IF an update submits no Member field, or submits a value that does not meet Requirement 2, THEN THE Gym_Platform SHALL reject the update with an error indicating that the Member values are not valid and SHALL leave the Member unchanged.
4. IF a read or update names a Member that is not stored for the caller's Gym, including a Member of another Gym, THEN THE Gym_Platform SHALL reject the request with an error indicating that the Member was not found and SHALL leave every Member unchanged.
5. THE Gym_Platform SHALL NOT provide an action that deletes a Member.
6. An update SHALL NOT be rejected because of `maxMembers`.

### Requirement 4: Membership products

**User Story:** As a Gym_Owner, I want to define what I sell to members, so that I can assign those products later.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_members` enabled and the caller's Gym is `active`, WHEN a Membership_Product is submitted with a name of 1 to 64 characters that contains at least one character other than a space, a tab, a carriage return, or a line feed, a price in paise from 0 to 2,147,483,647, a duration in days from 1 to 3650, and optionally an active or inactive state, THE Gym_Platform SHALL store one Membership_Product for that Gym with those values, using the active state when no state is submitted.
2. IF a product submission omits a required value or submits a value outside those rules, THEN THE Gym_Platform SHALL reject it with an error indicating that the Membership_Product values are not valid and SHALL store nothing.
3. WHERE the same conditions hold, WHEN a Membership_Product of that Gym is updated with one or more of name, price, duration, and active state, and every submitted value meets criterion 1, THE Gym_Platform SHALL store the submitted values, leave omitted values and every Membership unchanged, and return the product.
4. IF a product update names a product that is not stored for the caller's Gym, THEN THE Gym_Platform SHALL reject it with an error indicating that the Membership_Product was not found.
5. WHEN products are requested, THE Gym_Platform SHALL return every Membership_Product of the caller's Gym, active or inactive, and no product of another Gym, ordered by creation time then identifier.
6. THE Gym_Platform SHALL NOT provide an action that deletes a Membership_Product.
7. A product create or update SHALL NOT be rejected because of `maxMembers`.

### Requirement 5: Assign a Membership

**User Story:** As a Gym_Owner, I want to give a member a membership, so that the member has a paid period.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_members` enabled and the caller's Gym is `active`, WHEN an active Membership_Product of that Gym is assigned to a Member of that Gym who has no Membership, THE Gym_Platform SHALL store one Membership in the `active` state with a Membership_Snapshot of that product's name, price, and duration at that time, a Membership_Period that starts at the current time and ends that many 24-hour days later, and no Freeze.
2. IF the Member already has a Membership, including an `expired` one, THEN THE Gym_Platform SHALL reject the assign with an error indicating that the Member already has a Membership and SHALL leave it unchanged. Extending an existing Membership is Requirement 6.
3. IF the product is inactive, is not stored, or belongs to another Gym, THEN THE Gym_Platform SHALL reject the assign with an error indicating that the Membership_Product was not found or that it is not active, and SHALL store no Membership.
4. IF the Member is not stored for the caller's Gym, THEN THE Gym_Platform SHALL reject the assign with an error indicating that the Member was not found.
5. An assign SHALL NOT be rejected because of `maxMembers`.

### Requirement 6: Renew a Membership

**User Story:** As a Gym_Owner, I want to renew a member's membership, so that they can stay on after the current period.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_members` enabled and the caller's Gym is `active`, WHEN the Membership of a Member of that Gym is In_Effect, THE Gym_Platform SHALL add the current duration of that Membership's product, measured in 24-hour days, to the stored end, leave the start unchanged, replace the Membership_Snapshot with that product's current name, price, and duration, and leave the product link unchanged.
2. WHEN that Membership's stored state is `active` and it is not In_Effect, THE Gym_Platform SHALL set the Membership_Period to start at the current time and end the product's current duration later, and SHALL replace the Membership_Snapshot the same way.
3. Renew SHALL keep the Membership's product. The request SHALL NOT select a different product.
4. IF the Membership is `frozen`, THEN THE Gym_Platform SHALL reject renew with an error indicating that the Membership is frozen and SHALL leave it unchanged.
5. IF the Member has no Membership, THEN THE Gym_Platform SHALL reject renew with an error indicating that the Member has no Membership.
6. Renew of a product that is now inactive SHALL still succeed.
7. A product edit SHALL NOT change a Membership until the next renew or assign.

### Requirement 7: Freeze and unfreeze

**User Story:** As a Gym_Owner, I want to pause a membership, so that a member does not lose days while they are away.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_members` enabled and the caller's Gym is `active`, WHEN a Membership that is In_Effect is frozen, THE Gym_Platform SHALL set its stored state to `frozen`, record the current time as the Freeze start, and leave the Membership_Period and the Membership_Snapshot unchanged.
2. WHEN a `frozen` Membership is unfrozen, THE Gym_Platform SHALL set its stored state to `active`, add the time since the Freeze start to the stored end, clear the Freeze start, and leave the start and the Membership_Snapshot unchanged.
3. IF freeze is requested for a Membership that is not In_Effect, including `expired` and already `frozen`, THEN THE Gym_Platform SHALL reject it with an error indicating that only an active Membership can be frozen and SHALL leave it unchanged.
4. IF unfreeze is requested for a Membership that is not `frozen`, THEN THE Gym_Platform SHALL reject it with an error indicating that the Membership is not frozen and SHALL leave it unchanged.
5. A Membership SHALL have at most one open Freeze. THE Gym_Platform SHALL NOT store a history of past Freezes.
6. Freeze and unfreeze SHALL NOT be rejected because of `maxMembers`.

### Requirement 8: Reported status

**User Story:** As a Gym_Owner, I want to see whether a membership is active, frozen, or expired, so that I know who can use the gym.

#### Acceptance Criteria

1. THE Gym_Platform SHALL compute Membership_Status at read time and SHALL NOT run a scheduled job and SHALL NOT write a Membership only to mark it expired.
2. THE Gym_Platform SHALL report `frozen` for a `frozen` Membership even when the stored end is not later than the current time.
3. THE Gym_Platform SHALL report `active` only for a Membership that is In_Effect, and `expired` for a stored `active` Membership that is not In_Effect.
4. A Member with no Membership SHALL be returned with no Membership_Status.

### Requirement 9: Boundaries

**User Story:** As the platform operator, I want Phase 3 to stay inside member management, so that attendance, billing, and gym approval keep their current behavior.

#### Acceptance Criteria

1. THE Gym_Platform SHALL NOT create a User_Account, a Role, a Gym, a Plan, or a Subscription as part of a Phase 3 action, and SHALL NOT change Gym_Status, Setup_Fields, or the linked Gym_Owner.
2. A Gym_Owner SHALL access only Members and Membership_Products of the Gym linked to that Gym_Owner. The request body SHALL NOT select a Gym.
3. THE Gym_Platform SHALL NOT record attendance, generate a QR code, or add revenue or usage counts to Platform_Stats.
4. THE Gym_Platform SHALL NOT enforce `maxStaff`, `maxBranches`, or any Feature_Flag in Phase 3.
5. Phase 2 Plan and Subscription behavior SHALL stay as specified. Phase 3 reads Entitlements and does not write a Subscription, except where an earlier phase already writes one.
