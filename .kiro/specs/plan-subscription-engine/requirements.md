# Requirements Document

## Introduction

Phase 2 adds a plan and subscription engine to the Gym_Platform. A Super_Admin manages a catalog of Plans, starting with Basic, Pro, and Enterprise. Each Plan has a monthly price, Feature_Flags, and member, staff, and branch limits. A Gym_Owner whose Gym is `active` views the available Plans, selects one, and either starts a free trial or waits for a Super_Admin to record payment by hand. The result is a Subscription for that Gym, plus an Entitlements read that later modules can use.

Phase 1 behavior stays as specified in `.kiro/specs/gym-saas-foundation/requirements.md`. The one exception is Requirement 1 below, which grows the Permission set from seven names to eleven.

The user confirmed these decisions on 2026-11-22:

- A Super_Admin records payment by hand. There is no payment gateway, no API key, and no webhook.
- A Subscription belongs to a Gym. A Gym_Owner can select a Plan only when that Gym's Gym_Status is `active`. Subscriptions never change Gym_Status.
- Plans store limits and Feature_Flags, and the Entitlements read returns them. No Phase 2 action enforces a limit or a flag, because members, staff, and branches do not exist yet.
- Plans are configurable. Basic, Pro, and Enterprise are seeded. A Super_Admin can create, edit, deactivate, and reactivate Plans. Plans are never deleted.
- Each Plan has one monthly price in INR, stored as a whole number of paise.
- The limits are three fixed values. Feature_Flags are snake_case keys that the Super_Admin types in.
- Add-ons are deferred to a later phase.
- Each Plan has its own trial length in days, and 0 means no trial. Each Gym gets one trial ever.
- The Subscription states are `trialing`, `pending_payment`, `active`, and `expired`. Expiry is computed when a Subscription is read. A Gym_Owner can request a different Plan. There is no cancellation.
- A Subscription copies the Plan's values when it starts and when it is renewed. Later Plan edits do not change it.
- When no Subscription is in effect, Entitlements are empty: no Plan, no flags, and every limit 0.
- Four Permissions are added. The two Super_Admin management Permissions are locked on Super_Admin.

The user also accepted these decisions on 2026-11-22. They were first proposed as assumptions:

- The seeded Basic, Pro, and Enterprise Plans start inactive, with price 0, trial length 0, no Feature_Flags, and every limit 0. A Super_Admin sets the real values and then activates each Plan. No price or limit is written into source code.
- One Billing_Period is one calendar month in UTC. When the start day does not exist in the next month, the period ends on the last day of that month at the same time of day.
- When a requested Plan is marked paid, the Subscription that was in effect ends at that moment. Remaining trial or paid time is not carried over, credited, or refunded.
- A trial cannot be marked paid. To pay during or after a trial, the Gym_Owner submits a Plan_Request.
- Deactivating a Plan only hides it from Gym_Owners. Existing Subscriptions and Plan_Requests on that Plan keep working, and a Super_Admin can still mark them paid or renew them.
- The database, not only the service, enforces one trial per Gym and at most one Plan_Request per Gym.
- Every Subscription response says whether the Subscription is a trial (Requirement 10.7), so clients can tell an expired trial from an expired paid Subscription. This was added after implementation, on the same date, as an additive response field.

Out of scope for Phase 2: payment gateways (including Razorpay, UPI, and Stripe), invoices, receipts, refunds, proration, coupons, add-ons, cancellation, yearly prices, currencies other than INR, enforcement of any limit or Feature_Flag, scheduled jobs, notifications, and any change to Platform_Stats.

## Glossary

- **Plan**: A catalog entry managed by a Super_Admin. It has a Plan_Code, a Plan name, a Plan_Price, Trial_Days, Feature_Flags, Plan_Limits, and an active or inactive state.
- **Plan_Code**: The unique identifier of a Plan. It is 1 to 32 characters long, starts with a lowercase ASCII letter, and continues with lowercase ASCII letters, digits, or `_`. It cannot be changed after the Plan is created.
- **Plan name**: A display name of 1 to 64 characters that contains at least one character other than a space, a tab, a carriage return, or a line feed. It is stored exactly as submitted.
- **Plan_Price**: The monthly price of a Plan in INR, as a whole number of paise from 0 to 2,147,483,647.
- **Trial_Days**: A whole number from 0 to 365. The value 0 means the Plan has no trial.
- **Feature_Flag**: A key that is 1 to 64 characters long, starts with a lowercase ASCII letter, and continues with lowercase ASCII letters, digits, or `_`. A Plan has 0 to 50 distinct Feature_Flags.
- **Plan_Limits**: The three values `maxMembers`, `maxStaff`, and `maxBranches`. Each one is either a whole number from 0 to 2,147,483,647 or unlimited.
- **Available_Plan**: A Plan whose state is active.
- **Subscription**: A record that links one Gym to one Plan. Its stored state is `trialing`, `pending_payment`, or `active`.
- **Plan_Request**: A Subscription whose stored state is `pending_payment`. A Gym has at most one.
- **Plan_Snapshot**: The Plan name, Plan_Price, Feature_Flags, and Plan_Limits copied onto a Subscription when it starts or is renewed.
- **Billing_Period**: One calendar month in UTC, as described in the decisions above.
- **Subscription_Period**: The start time and end time stored on a `trialing` or `active` Subscription. A Plan_Request has no Subscription_Period.
- **In_Effect**: Describes a `trialing` or `active` Subscription whose Subscription_Period end is later than the current time.
- **Subscription_Status**: The status reported for a Subscription at the time of a request. It is `pending_payment` for a Plan_Request. It is the stored state, `trialing` or `active`, while the Subscription is In_Effect. It is `expired` for a `trialing` or `active` Subscription whose Subscription_Period end is not later than the current time.
- **Current_Subscription**: The `trialing` or `active` Subscription of a Gym with the latest Subscription_Period end, whether or not it is In_Effect.
- **Entitlements**: The Plan_Code, Plan name, Subscription_Status, Feature_Flags, Plan_Limits, and Subscription_Period end of the Subscription that is In_Effect for a Gym.

Phase 1 terms (Gym_Platform, Super_Admin, Gym_Owner, User_Account, Role, Permission, Protected_Action, Gym, Gym_Status, Gym_Name, Setup_Fields, Authenticated_Session, Platform_Stats) keep their Phase 1 meaning.

## Requirements

### Requirement 1: Phase 2 Permissions

**User Story:** As a Super_Admin, I want plan and subscription actions controlled by Permissions, so that access follows the same Role rules as Phase 1.

#### Acceptance Criteria

1. THE Gym_Platform SHALL add the Permissions `view_plans`, `manage_plans`, `manage_subscriptions`, and `manage_gym_subscription` to the seven Phase 1 Permissions, so that the complete Permission set has eleven names.
2. WHILE no Permission change has been saved for the Super_Admin Role, THE Gym_Platform SHALL keep `manage_plans` and `manage_subscriptions` enabled and keep `view_plans` and `manage_gym_subscription` disabled on the Super_Admin Role.
3. WHILE no Permission change has been saved for the Gym_Owner Role, THE Gym_Platform SHALL keep `view_plans` and `manage_gym_subscription` enabled and keep `manage_plans` and `manage_subscriptions` disabled on the Gym_Owner Role.
4. WHEN the Gym_Platform starts with data saved by Phase 1, THE Gym_Platform SHALL give the Super_Admin Role and the Gym_Owner Role the four new Permission states from criteria 2 and 3, give every other existing Role the four new Permissions disabled, and leave every Permission state saved before that start unchanged.
5. WHEN a Role is created, THE Gym_Platform SHALL give that Role all eleven Permissions disabled.
6. IF a Permission change sets `manage_plans` or `manage_subscriptions` to disabled on the Super_Admin Role, THEN THE Gym_Platform SHALL reject the change with an error indicating that `manage_plans` and `manage_subscriptions` cannot be disabled on Super_Admin, and leave every Permission state unchanged.
7. THE Gym_Platform SHALL accept each of the eleven names in a Permission change and SHALL return the states of all eleven names in the Role list. This replaces the seven-name lists in Phase 1 Requirements 8.6, 8.7, 8.11, 8.12, and 8.14. The Phase 1 rule that keeps `view_dashboard`, `manage_users`, `manage_roles`, and `review_gyms` enabled on the Super_Admin Role, and its error, stay unchanged.
8. THE Gym_Platform SHALL map each Phase 2 Protected_Action to one Permission: the Available_Plan list to `view_plans`; the full Plan list, Plan creation, and Plan update to `manage_plans`; the Subscription list and marking a Subscription paid to `manage_subscriptions`; and the own Subscription read, the Entitlements read, trial start, and Plan_Request to `manage_gym_subscription`. Phase 1 Requirement 11 SHALL apply to each of these Protected_Actions.

### Requirement 2: Seeded Plans

**User Story:** As a Super_Admin, I want Basic, Pro, and Enterprise to exist from the start, so that I only need to set their values.

#### Acceptance Criteria

1. WHEN the Gym_Platform starts and no Plan uses the Plan_Code `basic`, `pro`, or `enterprise`, THE Gym_Platform SHALL create that Plan with the Plan name `Basic`, `Pro`, or `Enterprise` respectively, a Plan_Price of 0, Trial_Days of 0, no Feature_Flags, each of the three Plan_Limits set to 0, and the inactive state.
2. WHEN the Gym_Platform starts and a Plan already uses one of those Plan_Codes, THE Gym_Platform SHALL leave that Plan unchanged.
3. WHEN the Gym_Platform starts more than once, including more than once at the same time, THE Gym_Platform SHALL keep exactly one Plan for each of those three Plan_Codes.

### Requirement 3: Plan Creation

**User Story:** As a Super_Admin, I want to create plans, so that I can offer plans beyond the three seeded ones.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_plans` enabled, WHEN a Plan creation is submitted with a Plan_Code that no Plan uses, a Plan name, a Plan_Price, Trial_Days, a list of Feature_Flags, a value for each of the three Plan_Limits, and optionally an active or inactive state, THE Gym_Platform SHALL store one Plan with exactly those values, use the active state when no state is submitted, and return the stored Plan.
2. IF a Plan creation omits any value other than the state, or submits a value that does not meet its Glossary definition, or submits the same Feature_Flag more than once, THEN THE Gym_Platform SHALL reject the creation with an error indicating that the Plan values are not valid and store no Plan.
3. IF a Plan creation submits a Plan_Code that an existing Plan uses, THEN THE Gym_Platform SHALL reject the creation with an error indicating that the Plan_Code is already used and leave the existing Plan unchanged.
4. WHEN more than one Plan creation with the same unused Plan_Code is submitted at the same time, THE Gym_Platform SHALL create exactly one Plan and reject every other creation with an error indicating that the Plan_Code is already used.
5. WHEN a Plan is created, THE Gym_Platform SHALL leave every other Plan and every Subscription unchanged.

### Requirement 4: Plan Update and Deactivation

**User Story:** As a Super_Admin, I want to edit, deactivate, and reactivate plans, so that the catalog stays current without breaking existing subscriptions.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_plans` enabled, WHEN a Plan update for an existing Plan_Code submits one or more of the Plan name, Plan_Price, Trial_Days, Feature_Flags, each Plan_Limit, and the active or inactive state, and every submitted value meets Requirement 3, THE Gym_Platform SHALL store each submitted value, replace the whole Feature_Flag list when a list is submitted, leave every value that was not submitted and the Plan_Code unchanged, and return the stored Plan.
2. IF a Plan update submits none of those values, or submits a value that does not meet Requirement 3, THEN THE Gym_Platform SHALL reject the update with an error indicating that the Plan values are not valid and leave the Plan unchanged.
3. IF a Plan update submits a Plan_Code value in the request body, THEN THE Gym_Platform SHALL reject the update and leave the Plan unchanged.
4. IF a Plan update names a Plan_Code that no Plan uses, THEN THE Gym_Platform SHALL reject the update with an error indicating that the Plan was not found and change no Plan.
5. WHEN a Plan is updated, THE Gym_Platform SHALL leave every Subscription unchanged, including its Plan_Snapshot, its Subscription_Period, and its stored state.
6. WHILE a Plan is inactive, THE Gym_Platform SHALL leave it out of the Available_Plan list and reject trial starts and Plan_Requests for it as described in Requirements 6 and 7, and SHALL keep every Subscription and Plan_Request on that Plan working as described in Requirements 8 to 11.
7. THE Gym_Platform SHALL NOT provide any action that deletes a Plan.

### Requirement 5: Plan Lists

**User Story:** As a Gym_Owner, I want to see available plans with their price, features, and limits, so that I can choose one. As a Super_Admin, I want to see every plan, so that I can manage the catalog.

#### Acceptance Criteria

1. WHERE the User_Account Role has `view_plans` enabled, WHEN the Available_Plans are requested, THE Gym_Platform SHALL return every Available_Plan and no inactive Plan, each with its Plan_Code, Plan name, Plan_Price, the currency INR, Trial_Days, Feature_Flags, and Plan_Limits, ordered by Plan_Price ascending and then by Plan_Code ascending.
2. WHERE the User_Account Role has `manage_plans` enabled, WHEN all Plans are requested, THE Gym_Platform SHALL return every Plan, active or inactive, with the same values and its state, in the same order.
3. WHEN either list is requested, THE Gym_Platform SHALL leave every Plan unchanged.

### Requirement 6: Trial Start

**User Story:** As a Gym_Owner, I want to try a plan for free, so that I can use it before paying.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_gym_subscription` enabled, WHEN an Authenticated_Session for a Gym_Owner whose Gym has Gym_Status `active` starts a trial for an Available_Plan whose Trial_Days is at least 1, and that Gym has never had a `trialing` Subscription and has no Subscription In_Effect, THE Gym_Platform SHALL create one `trialing` Subscription for that Gym and Plan with a Plan_Snapshot of the Plan's values at that time and a Subscription_Period that starts at the current time and ends Trial_Days × 24 hours later, leave any Plan_Request of that Gym unchanged, and return the Subscription.
2. IF a trial start is submitted by a Gym_Owner who has no Gym, THEN THE Gym_Platform SHALL reject it with the Phase 1 error indicating that the Gym was not found.
3. IF a trial start is submitted for a Gym whose Gym_Status is `setup_in_progress` or `pending`, THEN THE Gym_Platform SHALL reject it with an error indicating that plan selection requires an active Gym.
4. IF a trial start omits the Plan_Code or submits a Plan_Code that is not a non-empty string, THEN THE Gym_Platform SHALL reject it with an error indicating that the plan selection is not valid.
5. IF a trial start submits a Plan_Code that matches no Available_Plan, THEN THE Gym_Platform SHALL reject it with an error indicating that the Plan was not found.
6. IF a trial start selects an Available_Plan whose Trial_Days is 0, THEN THE Gym_Platform SHALL reject it with an error indicating that the Plan has no trial.
7. IF a trial start is submitted for a Gym that has had a `trialing` Subscription, including when more than one trial start for that Gym is submitted at the same time, THEN THE Gym_Platform SHALL keep exactly one `trialing` Subscription for that Gym and reject every other trial start with an error indicating that the trial was already used.
8. IF a trial start is submitted for a Gym that has a Subscription In_Effect, THEN THE Gym_Platform SHALL reject it with an error indicating that a Subscription is already in effect.
9. IF a trial start is rejected, THEN THE Gym_Platform SHALL create no Subscription and leave every stored Subscription unchanged.

### Requirement 7: Plan Request

**User Story:** As a Gym_Owner, I want to choose a paid plan or switch to a different one, so that a Super_Admin can activate it after I pay.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_gym_subscription` enabled, WHEN an Authenticated_Session for a Gym_Owner whose Gym has Gym_Status `active` requests an Available_Plan and that Gym has no Plan_Request, THE Gym_Platform SHALL create one Plan_Request for that Gym and Plan with no Plan_Snapshot and no Subscription_Period, leave every other Subscription of that Gym unchanged, and return the Plan_Request.
2. WHEN a Gym that already has a Plan_Request requests an Available_Plan, THE Gym_Platform SHALL set that existing Plan_Request's Plan to the requested Plan, create no other Subscription, and return the Plan_Request.
3. WHEN more than one Plan_Request for the same Gym is submitted at the same time, THE Gym_Platform SHALL keep exactly one Plan_Request for that Gym, whose Plan is the Plan of one of those requests.
4. IF a Plan_Request selects the Plan of an `active` Subscription that is In_Effect for that Gym, THEN THE Gym_Platform SHALL reject it with an error indicating that the Plan is already in effect, and leave every Subscription unchanged.
5. IF a Plan_Request is submitted by a Gym_Owner who has no Gym, for a Gym whose Gym_Status is not `active`, without a valid Plan_Code, or for a Plan_Code that matches no Available_Plan, THEN THE Gym_Platform SHALL reject it with the matching error from Requirement 6 criteria 2 to 5 and leave every Subscription unchanged.
6. WHEN a Plan_Request is created or changed, THE Gym_Platform SHALL NOT start a trial and SHALL leave the Subscription In_Effect for that Gym, if there is one, unchanged.

### Requirement 8: Manual Payment Activation

**User Story:** As a Super_Admin, I want to record that a gym has paid, so that its requested plan becomes active.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_subscriptions` enabled, WHEN an Authenticated_Session for a Super_Admin marks a Plan_Request paid, THE Gym_Platform SHALL set that Subscription's stored state to `active`, store a Plan_Snapshot of its Plan's values at that time whether or not that Plan is an Available_Plan, set its Subscription_Period to start at the current time and end one Billing_Period later, set the Subscription_Period end of any other Subscription of the same Gym that is In_Effect to the current time, and leave every Subscription of every other Gym unchanged.
2. IF marking paid selects an identifier that matches no Subscription, THEN THE Gym_Platform SHALL reject it with an error indicating that the Subscription was not found and change no Subscription.
3. IF marking paid selects a `trialing` Subscription, THEN THE Gym_Platform SHALL reject it with an error indicating that a trial cannot be marked paid and change no Subscription.
4. WHEN a Subscription is marked paid, THE Gym_Platform SHALL leave the Gym's Gym_Status, Setup_Fields, and linked Gym_Owner unchanged.

### Requirement 9: Renewal

**User Story:** As a Super_Admin, I want to record another month of payment, so that a gym's subscription continues.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_subscriptions` enabled, WHEN an Authenticated_Session for a Super_Admin marks paid an `active` Subscription that is its Gym's Current_Subscription and is In_Effect, THE Gym_Platform SHALL move its Subscription_Period end forward by one Billing_Period counted from the stored end, keep its Subscription_Period start, and replace its Plan_Snapshot with its Plan's values at that time.
2. WHERE the User_Account Role has `manage_subscriptions` enabled, WHEN an Authenticated_Session for a Super_Admin marks paid an `active` Subscription that is its Gym's Current_Subscription and is not In_Effect, THE Gym_Platform SHALL set its Subscription_Period to start at the current time and end one Billing_Period later, and replace its Plan_Snapshot with its Plan's values at that time.
3. IF marking paid selects an `active` Subscription that is not its Gym's Current_Subscription, THEN THE Gym_Platform SHALL reject it with an error indicating that only the Current_Subscription can be renewed and change no Subscription.
4. WHEN a Subscription is renewed, THE Gym_Platform SHALL leave every other Subscription, including any Plan_Request of that Gym, unchanged.

### Requirement 10: Subscription Read and Expiry

**User Story:** As a Gym_Owner, I want to see my gym's subscription and any pending request, so that I know what plan is in effect and when it ends.

#### Acceptance Criteria

1. THE Gym_Platform SHALL compute each Subscription_Status at the time of the request from the stored state and the Subscription_Period, without a scheduled job and without writing to any Subscription.
2. WHERE the User_Account Role has `manage_gym_subscription` enabled, WHEN an Authenticated_Session for a Gym_Owner requests that Gym_Owner's Subscription, THE Gym_Platform SHALL return the Current_Subscription of that Gym_Owner's Gym or none, the Plan_Request of that Gym or none, and whether that Gym has had a `trialing` Subscription.
3. WHEN a `trialing` or `active` Subscription is returned, THE Gym_Platform SHALL return its Subscription_Status, Plan_Code, Plan_Snapshot, and Subscription_Period.
4. WHEN a Plan_Request is returned, THE Gym_Platform SHALL return the Subscription_Status `pending_payment`, the Plan_Code, the current Plan name, Plan_Price, Feature_Flags, and Plan_Limits of its Plan, and no Subscription_Period.
5. IF a Gym_Owner who has no Gym requests that Gym_Owner's Subscription, THEN THE Gym_Platform SHALL reject the request with the Phase 1 error indicating that the Gym was not found.
6. WHEN a Gym_Owner whose Gym has Gym_Status `setup_in_progress` or `pending` requests that Gym_Owner's Subscription, THE Gym_Platform SHALL return no Current_Subscription, no Plan_Request, and that no trial has been used.
7. WHEN any Subscription is returned, THE Gym_Platform SHALL also return whether its stored state is `trialing`: true for a trial whether or not it is In_Effect, and false for a Plan_Request and for an `active` Subscription, so that an `expired` trial can be told apart from an `expired` paid Subscription.

### Requirement 11: Entitlements

**User Story:** As a later platform module, I want one place to read a gym's plan flags and limits, so that I can enforce them when members, staff, and branches exist.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_gym_subscription` enabled, WHEN an Authenticated_Session for a Gym_Owner requests Entitlements and a Subscription is In_Effect for that Gym_Owner's Gym, THE Gym_Platform SHALL return that Subscription's Plan_Code, the Plan name, Feature_Flags, and Plan_Limits from its Plan_Snapshot, its Subscription_Status, and its Subscription_Period end.
2. WHEN Entitlements are requested and no Subscription is In_Effect for the Gym, including when the Gym's Gym_Status is not `active`, when the Gym never had a Subscription, when it has only a Plan_Request, and when its Current_Subscription is `expired`, THE Gym_Platform SHALL return no Plan, no Subscription_Status, no Feature_Flags, each of the three Plan_Limits as 0, and no Subscription_Period end.
3. IF a Gym_Owner who has no Gym requests Entitlements, THEN THE Gym_Platform SHALL reject the request with the Phase 1 error indicating that the Gym was not found.
4. WHILE a Subscription is In_Effect, THE Gym_Platform SHALL return Entitlements from its Plan_Snapshot and not from the Plan's values at the time of the request.
5. THE Gym_Platform SHALL NOT use Entitlements to allow or reject any Phase 1 or Phase 2 action.

### Requirement 12: Subscription List

**User Story:** As a Super_Admin, I want to see every subscription and request, so that I know which gyms to mark paid or renew.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_subscriptions` enabled, WHEN an Authenticated_Session for a Super_Admin requests Subscriptions, THE Gym_Platform SHALL return every Subscription, each with its identifier, Subscription_Status, the Gym identifier, the Gym_Name, the Email_Address of the linked Gym_Owner, and the values described in Requirement 10 criteria 3, 4, and 7, ordered by creation time ascending.
2. WHEN the Subscription list is requested with a filter of `trialing`, `pending_payment`, `active`, or `expired`, THE Gym_Platform SHALL return only the Subscriptions whose Subscription_Status at the time of the request equals that filter.
3. IF the Subscription list is requested with a filter that is not one of those four values, THEN THE Gym_Platform SHALL reject the request with an error indicating that the Subscription filter is not valid.

### Requirement 13: Phase Boundaries

**User Story:** As the platform operator, I want Phase 2 to leave Phase 1 data alone, so that gym approval and administration keep working as before.

#### Acceptance Criteria

1. THE Gym_Platform SHALL keep at most one Subscription In_Effect for each Gym at any time.
2. WHEN any Phase 2 action runs, THE Gym_Platform SHALL leave every Gym's Gym_Status, Setup_Fields, and linked Gym_Owner, every Owner_Profile, and every User_Account unchanged.
3. THE Gym_Platform SHALL keep Platform_Stats as the four counts defined in Phase 1 Requirement 10.
4. THE Gym_Platform SHALL NOT contact a payment provider, create an invoice or receipt, apply a coupon or add-on, prorate or refund an amount, cancel a Subscription, or run a scheduled job as part of Phase 2.
