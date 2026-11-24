# Requirements Document

## Introduction

Phase 1 is the foundation of the Gym_Platform, a gym SaaS API. A Gym_Owner can register, sign in, save an Owner_Profile, create one Gym, and record that Gym's profile and basic setup. After setup is finished, the Gym stays pending until a Super_Admin reviews it and activates it. A Super_Admin can sign in, view User_Accounts, assign Roles, manage editable Roles and Permissions, review and activate Gyms, and read Platform_Stats.

Phase 1 includes only the Super_Admin and Gym_Owner actors from the request. Staff accounts, member accounts, and any other user type are out of scope because that decision was not specified.

The following limits are the smallest assumptions needed to make the requested behavior testable:

- A Gym_Owner creates one Gym. More than one Gym for the same Gym_Owner is out of scope.
- Logo_Value is a single value the Gym_Owner submits and the Gym_Platform returns with the Gym. Binary file upload and external file storage are out of scope.
- Platform_Stats are the four counts in the Glossary. Those counts are the Phase 1 platform stats and basic analytics. Revenue, attendance, and any other metric are out of scope.
- Owner_Profile is a display name and a contact value.
- Gym address, Gym contact, timing, and Gym_Name are values the Gym_Owner submits. Address, contact, and Gym_Name are stored once on the Gym, whether submitted as profile data or as basic setup data.
- The Permission names in the Glossary are the complete Phase 1 set.
- The Gym_Platform starts with one Super_Admin User_Account so approval and administration can happen. The initial email address and password are supplied as configuration. The installation method is out of scope.

## Glossary

- **Gym_Platform**: The Phase 1 gym SaaS API that registers and signs in users, stores Gyms, and enforces Roles and Permissions.
- **Super_Admin**: A User_Account assigned the Super_Admin Role.
- **Gym_Owner**: A User_Account assigned the Gym_Owner Role.
- **User_Account**: A sign-in identity with an Email_Address, a password, and one Role.
- **Email_Address**: A value that contains a local part, an @ character, and a domain part.
- **Role**: A named set of Permission states. Super_Admin and Gym_Owner are Roles, and a Super_Admin can create more Roles and edit Permission states.
- **Permission**: One named capability that is enabled or disabled on a Role. The Phase 1 Permission names are `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, and `manage_gym_setup`.
- **Protected_Action**: Any requested action other than registration and sign-in. Dashboard read maps to `view_dashboard`. User_Account list and Role assignment map to `manage_users`. Role creation, Role list, and Permission changes map to `manage_roles`. Pending Gym list and Gym activation map to `review_gyms`. Gym creation maps to `create_gym`. Owner_Profile read and update map to `manage_owner_profile`. Gym profile update, basic setup update, own Gym read, and setup completion map to `manage_gym_setup`.
- **Gym**: The business record linked to one Gym_Owner, holding a Gym_Name along with address, contact, timing, Logo_Value, and Gym_Status. Gym_Name is one value stored on the Gym.
- **Gym_Status**: The Gym state. The allowed values are `setup_in_progress`, `pending`, and `active`.
- **Owner_Profile**: The display name and contact value saved for one Gym_Owner.
- **Logo_Value**: The single logo value stored on a Gym.
- **Gym_Name**: The single non-empty name stored on a Gym.
- **Setup_Fields**: The Gym address, Gym contact, timing, Logo_Value, and Gym_Name.
- **Authenticated_Session**: Proof that a User_Account signed in with that User_Account's Email_Address and password.
- **Platform_Stats**: The count of User_Accounts, the count of Gyms in `setup_in_progress`, the count of Gyms in `pending`, and the count of Gyms in `active`.

## Requirements

### Requirement 1: Gym Owner Registration

**User Story:** As a Gym_Owner, I want to register an account, so that I can create and set up a gym.

#### Acceptance Criteria

1. WHEN registration is submitted with a password of 1 to 128 characters inclusive, counting every submitted character and without removing spaces, and with an email value that after removal of only leading and trailing spaces, tabs, carriage returns, and line feeds has 3 to 254 characters inclusive, contains exactly one @ character, has at least one character before that @ character and at least one character after it, contains none of those whitespace characters, and matches no User_Account Email_Address when ASCII letters A-Z and a-z are compared as equal and every other character is compared exactly, THE Gym_Platform SHALL create one User_Account with that trimmed email value as its Email_Address and with its letter case unchanged, assigned the Gym_Owner Role, and with no Gym, SHALL return that Email_Address and the Gym_Owner Role, SHALL NOT return the submitted password or the one-way verification value, and SHALL NOT start an Authenticated_Session.
2. WHEN a User_Account is created, THE Gym_Platform SHALL store the password only as a one-way verification value that is different from the submitted password and from which the submitted password cannot be recovered, and SHALL NOT return the submitted password or that verification value.
3. IF registration is submitted with no email value, or with an email value that has no characters after removal of only leading and trailing spaces, tabs, carriage returns, and line feeds, THEN THE Gym_Platform SHALL reject registration with an error indicating that an Email_Address is required and SHALL NOT create a User_Account.
4. IF registration is submitted with an email value that, after removal of only leading and trailing spaces, tabs, carriage returns, and line feeds, still has characters but is shorter than 3 characters, longer than 254 characters, does not contain exactly one @ character, has no character before the @ character, has no character after the @ character, or contains a space, tab, carriage return, or line feed, THEN THE Gym_Platform SHALL reject registration with an error indicating that the Email_Address is not valid and SHALL NOT create a User_Account.
5. IF registration is submitted with a password of 1 to 128 characters inclusive and an email value that, after removal of only leading and trailing spaces, tabs, carriage returns, and line feeds, has 3 to 254 characters inclusive, contains exactly one @ character, has at least one character before that @ character and at least one character after it, and contains none of those whitespace characters, and that trimmed value matches an existing User_Account Email_Address when ASCII letters A-Z and a-z are compared as equal and every other character is compared exactly, THEN THE Gym_Platform SHALL reject registration with an error indicating that the Email_Address is already used, SHALL NOT create a User_Account, and SHALL leave that existing User_Account, including its Email_Address, one-way verification value, and Role, and any linked Gym unchanged.
6. IF registration is submitted with an email value that, after removal of only leading and trailing spaces, tabs, carriage returns, and line feeds, has 3 to 254 characters inclusive, contains exactly one @ character, has at least one character before that @ character and at least one character after it, and contains none of those whitespace characters, and the password is missing, has no characters, or has more than 128 characters, THEN THE Gym_Platform SHALL reject registration with an error indicating that the password is not accepted, SHALL NOT create a User_Account, and SHALL leave any existing User_Account and any linked Gym unchanged.
7. WHEN more than one registration is submitted for email values that match when ASCII letters A-Z and a-z are compared as equal and every other character is compared exactly, no User_Account already uses that Email_Address, and each registration has a password of 1 to 128 characters inclusive and a trimmed email value of 3 to 254 characters inclusive with exactly one @ character, at least one character on each side of that @ character, and no leading or trailing-only removal still leaving a space, tab, carriage return, or line feed, THE Gym_Platform SHALL create exactly one User_Account assigned the Gym_Owner Role and no Gym, storing the trimmed Email_Address and letter case from one of those registrations, and SHALL reject every other registration with an error indicating that the Email_Address is already used without changing the created User_Account.

### Requirement 2: Sign-In

**User Story:** As a Super_Admin or Gym_Owner, I want to sign in, so that I can use the actions my Role allows.

#### Acceptance Criteria

1. WHEN sign-in is submitted with an Email_Address equal to a User_Account's Email_Address and a non-empty password that verifies against that User_Account's stored one-way verification value, THE Gym_Platform SHALL return an Authenticated_Session that identifies only that User_Account and leave that User_Account's Email_Address, stored one-way verification value, and Role unchanged, including when that User_Account has no Gym and when that User_Account's Gym has Gym_Status `setup_in_progress`, `pending`, or `active`.
2. THE Gym_Platform SHALL use one sign-in action, which accepts an Email_Address and a password, for a User_Account assigned the Super_Admin Role and for a User_Account assigned the Gym_Owner Role.
3. IF sign-in is submitted with an Email_Address that equals no User_Account's Email_Address and a non-empty password, or with an Email_Address that equals a User_Account's Email_Address and a non-empty password that does not verify against that User_Account's stored one-way verification value, THEN THE Gym_Platform SHALL reject sign-in with an error indicating that the Email_Address and password do not match a User_Account, use that same error for both mismatches so the error does not indicate which submitted value failed, return no Authenticated_Session, and leave every User_Account unchanged.
4. THE Gym_Platform SHALL provide one initial User_Account assigned the Super_Admin Role whose Email_Address is the configured initial Email_Address and whose password is stored only as a one-way verification value that verifies the configured initial password.
5. IF sign-in is submitted without an Email_Address, with a value that is not an Email_Address, without a password, or with an empty password, THEN THE Gym_Platform SHALL reject sign-in with an error indicating that the sign-in input is invalid, return no Authenticated_Session, and leave every User_Account unchanged.

### Requirement 3: Owner Profile

**User Story:** As a Gym_Owner, I want to save my profile, so that the platform has my display name and contact value.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_owner_profile` enabled, WHEN an Authenticated_Session for a Gym_Owner submits a display name of 1 to 100 characters and a contact value of 1 to 254 characters, and each value contains at least one character other than a space, a tab, a carriage return, or a line feed, THE Gym_Platform SHALL store the submitted display name and contact value exactly as submitted as that Gym_Owner's single Owner_Profile, replacing any previously stored display name and contact value, whether or not the contact value is an Email_Address.
2. WHERE the User_Account Role has `manage_owner_profile` enabled, WHEN an Authenticated_Session for a Gym_Owner requests the Owner_Profile and that Gym_Owner has a stored Owner_Profile, THE Gym_Platform SHALL return the stored display name and the stored contact value.
3. WHERE the User_Account Role has `manage_owner_profile` enabled, IF an Authenticated_Session for a Gym_Owner submits an Owner_Profile update that omits the display name, omits the contact value, includes a display name or contact value of zero characters, includes a display name or contact value containing no character other than a space, a tab, a carriage return, or a line feed, includes a display name longer than 100 characters, or includes a contact value longer than 254 characters, THEN THE Gym_Platform SHALL reject the update with an error indicating that the display name or contact value is empty or exceeds the maximum length of 100 characters for the display name or 254 characters for the contact value, create no Owner_Profile when none is stored, and leave any stored display name and contact value unchanged.
4. WHERE the User_Account Role has `manage_owner_profile` enabled, WHEN an Authenticated_Session for a Gym_Owner requests the Owner_Profile and that Gym_Owner has no stored Owner_Profile, THE Gym_Platform SHALL return a display name whose length is 0 characters and a contact value whose length is 0 characters, and create no stored Owner_Profile.

### Requirement 4: Gym Creation

**User Story:** As a Gym_Owner, I want to create a gym, so that I can enter the gym profile and basic setup.

#### Acceptance Criteria

1. WHERE the User_Account Role has `create_gym` enabled, WHEN an Authenticated_Session for a Gym_Owner to whom no Gym is linked submits gym creation, THE Gym_Platform SHALL create exactly one Gym linked to that Gym_Owner with Gym_Status `setup_in_progress` and with none of the Setup_Fields saved.
2. IF an Authenticated_Session for a Gym_Owner who is already linked to one Gym whose Gym_Status is `setup_in_progress`, `pending`, or `active` submits gym creation, THEN THE Gym_Platform SHALL reject creation, create no additional Gym, and leave that Gym's Gym_Status, saved Setup_Fields, and link to that Gym_Owner unchanged.

### Requirement 5: Gym Profile and Basic Setup

**User Story:** As a Gym_Owner, I want to record my gym name, logo, address, contact, and timing, so that a Super_Admin can review the gym.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_gym_setup` enabled, WHILE the Gym linked to a Gym_Owner has Gym_Status `setup_in_progress`, WHEN an Authenticated_Session for that Gym_Owner submits a gym profile update for that Gym with one or more of address, contact, Logo_Value, and Gym_Name, and every submitted value contains at least one character, THE Gym_Platform SHALL store each submitted address, contact, Logo_Value, or Gym_Name as the only current value of that field on that Gym, store a submitted address as the same Gym address a basic setup update stores, store a submitted contact as the same Gym contact a basic setup update stores, store a submitted Gym_Name as the only current Gym_Name on that Gym and as the same single Gym_Name a basic setup update stores, leave timing unchanged, leave any of address, contact, Logo_Value, and Gym_Name that was not submitted unchanged, and leave Gym_Status as `setup_in_progress`.
2. WHERE the User_Account Role has `manage_gym_setup` enabled, WHILE the Gym linked to a Gym_Owner has Gym_Status `setup_in_progress`, WHEN an Authenticated_Session for that Gym_Owner submits a basic setup update for that Gym with one or more of timing, address, contact, and Gym_Name, and every submitted value contains at least one character, THE Gym_Platform SHALL store each submitted timing value, address, contact, or Gym_Name as the only current value of that field on that Gym, store a submitted address as the same Gym address a gym profile update stores, store a submitted contact as the same Gym contact a gym profile update stores, store a submitted Gym_Name as the only current Gym_Name on that Gym and as the same single Gym_Name a gym profile update stores, leave Logo_Value unchanged, leave any of timing, address, contact, and Gym_Name that was not submitted unchanged, and leave Gym_Status as `setup_in_progress`.
3. WHERE the User_Account Role has `manage_gym_setup` enabled, WHEN an Authenticated_Session for a Gym_Owner requests that Gym_Owner's Gym, THE Gym_Platform SHALL return that Gym's Gym_Status, its single address, its single contact, its single timing value, its single Logo_Value, and its single Gym_Name, with address and contact each being the value last saved by a gym profile update or a basic setup update, timing being the value last saved by a basic setup update, Logo_Value being the submitted value last saved by a gym profile update, Gym_Name being the value last saved by a gym profile update or a basic setup update, and with each of address, contact, timing, Logo_Value, and Gym_Name that has not been saved returned as missing.
4. IF a gym profile update submits an address, a contact, a Logo_Value, or a Gym_Name that does not contain at least one character, or a basic setup update submits a timing value, an address, a contact, or a Gym_Name that does not contain at least one character, THEN THE Gym_Platform SHALL reject the update and leave the stored Gym unchanged.
5. IF an Authenticated_Session for a Gym_Owner requests a Gym linked to another Gym_Owner, or submits a gym profile update or a basic setup update for a Gym linked to another Gym_Owner, THEN THE Gym_Platform SHALL reject the request and leave that Gym unchanged.
6. IF an Authenticated_Session for a Gym_Owner who has no Gym requests that Gym_Owner's Gym, submits a gym profile update, or submits a basic setup update, THEN THE Gym_Platform SHALL reject the request.
7. IF an Authenticated_Session for a Gym_Owner who has a Gym submits a gym profile update that includes none of address, contact, Logo_Value, and Gym_Name, or submits a basic setup update that includes none of timing, address, contact, and Gym_Name, THEN THE Gym_Platform SHALL reject the update and leave the stored Gym unchanged.
8. IF an Authenticated_Session for a Gym_Owner submits a gym profile update or a basic setup update for that Gym_Owner's Gym and that Gym's Gym_Status is `pending` or `active`, THEN THE Gym_Platform SHALL reject the update and leave the stored Gym unchanged.

### Requirement 6: Setup Completion

**User Story:** As a Gym_Owner, I want to finish setup, so that my gym waits for Super_Admin activation.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_gym_setup` enabled, WHEN an Authenticated_Session for a Gym_Owner submits setup completion for that Gym_Owner's Gym and that Gym has Gym_Status `setup_in_progress` and address, contact, timing, Logo_Value, and Gym_Name are each already stored as a non-empty value, THE Gym_Platform SHALL set that Gym's Gym_Status to `pending` and leave address, contact, timing, Logo_Value, Gym_Name, and the linked Gym_Owner unchanged.
2. IF an Authenticated_Session for a Gym_Owner submits setup completion for the Gym that belongs to that Gym_Owner, and address, contact, timing, Logo_Value, or Gym_Name on that Gym is missing or empty, THEN THE Gym_Platform SHALL reject setup completion and leave that Gym unchanged, and this rejection applies only because that Gym belongs to the Gym_Owner of that Authenticated_Session.
3. WHILE a Gym has Gym_Status `pending`, IF a requested action is not activation of that Gym by an Authenticated_Session for a Super_Admin whose Role has `review_gyms` enabled, THEN THE Gym_Platform SHALL leave that Gym_Status as `pending`.
4. IF an Authenticated_Session for a Gym_Owner who has no Gym submits setup completion, THEN THE Gym_Platform SHALL reject setup completion and leave that Gym_Owner with no Gym.
5. IF an Authenticated_Session for a Gym_Owner submits setup completion for that Gym_Owner's Gym whose Gym_Status is `pending` or `active`, THEN THE Gym_Platform SHALL reject setup completion and leave the stored Gym unchanged.
6. WHERE the User_Account Role has `manage_gym_setup` enabled, WHILE the Gym linked to a Gym_Owner has Gym_Status `setup_in_progress`, WHEN an Authenticated_Session for that Gym_Owner submits one or more of address, contact, timing, Logo_Value, and Gym_Name for that Gym, THE Gym_Platform SHALL leave that Gym_Status as `setup_in_progress`.

### Requirement 7: Gym Activation

**User Story:** As a Super_Admin, I want to review and activate a pending gym, so that the gym becomes active only after approval.

#### Acceptance Criteria

1. WHERE the User_Account Role has `review_gyms` enabled, WHEN an Authenticated_Session for a Super_Admin requests Gyms awaiting review, THE Gym_Platform SHALL return, in any order, each Gym whose Gym_Status is `pending` and no Gym of any other Gym_Status, returning no Gym when no Gym has Gym_Status `pending`, and each returned Gym includes the non-empty saved address, the non-empty saved contact, the non-empty saved timing, the non-empty saved Logo_Value, the non-empty saved Gym_Name, and the Email_Address of the linked Gym_Owner.
2. WHERE the User_Account Role has `review_gyms` enabled, WHEN an Authenticated_Session for a Super_Admin activates one stored Gym whose Gym_Status is `pending`, THE Gym_Platform SHALL set that Gym's Gym_Status to `active` and leave that Gym's Setup_Fields and linked Gym_Owner unchanged, and leave every other Gym's Gym_Status, Setup_Fields, and linked Gym_Owner unchanged.
3. IF an Authenticated_Session activates a Gym whose Gym_Status is `setup_in_progress` or `active`, THEN THE Gym_Platform SHALL reject activation and leave that Gym's Gym_Status, Setup_Fields, and linked Gym_Owner unchanged.
4. IF an Authenticated_Session for a Super_Admin whose User_Account Role has `review_gyms` enabled activates without selecting one stored Gym, THEN THE Gym_Platform SHALL reject activation, create no Gym, and leave every stored Gym unchanged.
5. IF an Authenticated_Session that is not for a Super_Admin whose User_Account Role has `review_gyms` enabled activates a Gym, THEN THE Gym_Platform SHALL reject activation and leave that Gym's Gym_Status, Setup_Fields, and linked Gym_Owner unchanged.
6. WHILE a Gym's Gym_Status is `pending`, THE Gym_Platform SHALL keep that Gym_Status `pending` until an Authenticated_Session for a Super_Admin whose User_Account Role has `review_gyms` enabled activates that Gym.

### Requirement 8: Roles and Permissions

**User Story:** As a Super_Admin, I want to create roles and turn individual permissions on or off, so that Gym_Owner access stays editable instead of hardcoded.

#### Acceptance Criteria

1. THE Gym_Platform SHALL include exactly one Role named `Super_Admin` and exactly one Role named `Gym_Owner`.
2. WHILE no Permission change has been saved for the Super_Admin Role, THE Gym_Platform SHALL keep `view_dashboard`, `manage_users`, `manage_roles`, and `review_gyms` enabled on the Super_Admin Role.
3. WHILE no Permission change has been saved for the Super_Admin Role, THE Gym_Platform SHALL keep `create_gym`, `manage_owner_profile`, and `manage_gym_setup` disabled on the Super_Admin Role.
4. WHILE no Permission change has been saved for the Gym_Owner Role, THE Gym_Platform SHALL keep `create_gym`, `manage_owner_profile`, and `manage_gym_setup` enabled on the Gym_Owner Role.
5. WHILE no Permission change has been saved for the Gym_Owner Role, THE Gym_Platform SHALL keep `view_dashboard`, `manage_users`, `manage_roles`, and `review_gyms` disabled on the Gym_Owner Role.
6. WHERE the User_Account Role has `manage_roles` enabled, WHEN an Authenticated_Session for a Super_Admin creates a Role with a name of 1 to 64 characters that does not start or end with a space, includes at least one non-space character, and is not character-for-character identical, including case, to an existing Role name, THE Gym_Platform SHALL add one Role with that exact name and with `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, and `manage_gym_setup` disabled, without changing any existing Role name or Permission state.
7. WHERE the User_Account Role has `manage_roles` enabled, WHEN an Authenticated_Session for a Super_Admin sets one of `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, or `manage_gym_setup` to enabled or to disabled on the Gym_Owner Role or on any other existing Role whose name is not `Super_Admin`, THE Gym_Platform SHALL save that submitted state for that one Permission and leave the other six Permission states on that Role unchanged.
8. WHERE the User_Account Role has `manage_roles` enabled, WHEN an Authenticated_Session for a Super_Admin sets one of `create_gym`, `manage_owner_profile`, or `manage_gym_setup` to enabled or to disabled on the Super_Admin Role, THE Gym_Platform SHALL save that submitted state for that one Permission, leave the other two of those three Permission states unchanged, and keep `view_dashboard`, `manage_users`, `manage_roles`, and `review_gyms` enabled on the Super_Admin Role.
9. WHERE the User_Account Role has `manage_roles` enabled, IF an Authenticated_Session for a Super_Admin sets `view_dashboard`, `manage_users`, `manage_roles`, or `review_gyms` to disabled on the Super_Admin Role, THEN THE Gym_Platform SHALL reject the change, keep that Permission enabled, and leave every other Permission state on the Super_Admin Role unchanged.
10. WHERE the User_Account Role has `manage_roles` enabled, IF an Authenticated_Session for a Super_Admin creates a Role with a name that is character-for-character identical, including case, to an existing Role name, THEN THE Gym_Platform SHALL reject creation, add no Role, and leave every existing Role and its Permission states unchanged.
11. WHERE the User_Account Role has `manage_roles` enabled, IF an Authenticated_Session for a Super_Admin sets a Permission name that is not `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, or `manage_gym_setup`, or omits the Permission state, or sets a Permission state other than enabled or disabled, THEN THE Gym_Platform SHALL reject the change and leave every Role and its Permission states unchanged.
12. WHERE the User_Account Role has `manage_roles` enabled, WHEN an Authenticated_Session for a Super_Admin requests Roles, THE Gym_Platform SHALL return each existing Role's name and the enabled or disabled state of only `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, and `manage_gym_setup` on that Role, including the Role named `Super_Admin` and the Role named `Gym_Owner`.
13. WHERE the User_Account Role has `manage_roles` enabled, IF an Authenticated_Session for a Super_Admin creates a Role without a name, with an empty name, with a name longer than 64 characters, with a name that starts or ends with a space, or with a name that contains only spaces, THEN THE Gym_Platform SHALL reject creation, add no Role, and leave every existing Role and its Permission states unchanged.
14. WHERE the User_Account Role has `manage_roles` enabled, IF an Authenticated_Session for a Super_Admin sets one of `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, or `manage_gym_setup` to enabled or to disabled on a Role name that is not character-for-character identical, including case, to any existing Role name, THEN THE Gym_Platform SHALL reject the change and leave every Role and its Permission states unchanged.
15. WHERE the User_Account Role has `manage_roles` enabled, WHEN an Authenticated_Session for a Super_Admin sets `view_dashboard`, `manage_users`, `manage_roles`, or `review_gyms` to enabled on the Super_Admin Role, THE Gym_Platform SHALL keep that Permission enabled and leave every other Permission state on the Super_Admin Role unchanged.

### Requirement 9: User Administration

**User Story:** As a Super_Admin, I want to view users and assign roles, so that I can see who is on the platform and which Role each account has.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_users` enabled, WHEN an Authenticated_Session for a Super_Admin requests User_Accounts, THE Gym_Platform SHALL return every stored User_Account, with no stored User_Account omitted, including every Super_Admin and every Gym_Owner, and for each returned User_Account the Email_Address and the name of that User_Account's one Role.
2. WHERE the User_Account Role has `manage_users` enabled, WHEN an Authenticated_Session for a Super_Admin submits an Email_Address that a User_Account uses and a Role name that matches the name of any stored Role character for character, THE Gym_Platform SHALL save that Role as that User_Account's one Role, replacing the previous Role, leave that User_Account's Email_Address and password unchanged, and leave every other User_Account unchanged.
3. IF an Authenticated_Session for a Super_Admin submits a Role assignment for an Email_Address that a User_Account uses, and the submitted Role name is missing or does not match the name of any stored Role character for character, THEN THE Gym_Platform SHALL reject the assignment, leave every stored User_Account unchanged, and not add a Role.
4. IF an Authenticated_Session for a Super_Admin submits a Role assignment without an Email_Address, with a value that is not an Email_Address, or with an Email_Address that no User_Account uses, THEN THE Gym_Platform SHALL reject the assignment, leave every stored User_Account unchanged, not create a User_Account, and not add a Role.

### Requirement 10: Platform Dashboard

**User Story:** As a Super_Admin, I want to view platform stats, so that I can see how many accounts and gyms the platform has and which gyms are still in setup, pending, or active.

#### Acceptance Criteria

1. WHERE the User_Account Role has `view_dashboard` enabled, WHEN an Authenticated_Session for a Super_Admin requests the dashboard, THE Gym_Platform SHALL return Platform_Stats from the same stored User_Accounts and Gyms at the time of the request as four whole-number counts equal to the number of all stored User_Accounts, the number of all stored Gyms whose Gym_Status is `setup_in_progress`, the number of all stored Gyms whose Gym_Status is `pending`, and the number of all stored Gyms whose Gym_Status is `active`, using 0 when the matching number is zero.
2. WHERE the User_Account Role has `view_dashboard` enabled, WHEN an Authenticated_Session for a Super_Admin requests the dashboard, THE Gym_Platform SHALL limit Platform_Stats to those four counts and exclude revenue, attendance, any list of User_Accounts or Gyms, and any other metric.

### Requirement 11: Access Control

**User Story:** As a Super_Admin, I want each protected action checked against the caller's role, so that turning a Permission off changes what that Role can do.

#### Acceptance Criteria

1. IF a Protected_Action is requested without an Authenticated_Session, THEN THE Gym_Platform SHALL reject the Protected_Action with an error indicating that an Authenticated_Session is required, without starting an Authenticated_Session, without returning that Protected_Action's data, and without changing stored User_Accounts, Roles, Permission states, Owner_Profiles, or Gyms.
2. IF an Authenticated_Session requests a Protected_Action and the Permission mapped to that Protected_Action is disabled on the Role saved on that Authenticated_Session's User_Account at the time of the request, including when another Permission on that Role is enabled and including when that disabled state was saved after the Authenticated_Session started, THEN THE Gym_Platform SHALL reject the Protected_Action with an error indicating that the mapped Permission is disabled, without returning that Protected_Action's data, without changing stored User_Accounts, Roles, Permission states, Owner_Profiles, or Gyms, and without ending that Authenticated_Session.
3. WHEN the saved enabled or disabled state of a Permission on a Role changes, THE Gym_Platform SHALL, for every User_Account whose saved Role at the time of the request is that Role, including a User_Account whose Authenticated_Session started before the change, reject each Protected_Action mapped to that Permission that is requested after the change when the changed state is disabled, and not reject that Protected_Action because that Permission is disabled when the changed state is enabled.
4. WHEN registration is submitted with an Email_Address that no User_Account uses and a non-empty password, THE Gym_Platform SHALL create that User_Account even when the submission has no Authenticated_Session and even when every Permission on the Gym_Owner Role is disabled.
5. WHEN sign-in is submitted with the Email_Address and password of a User_Account, THE Gym_Platform SHALL start an Authenticated_Session for that User_Account without requiring an existing Authenticated_Session and without requiring any Permission on that User_Account's Role to be enabled.
6. WHEN an Authenticated_Session requests a Protected_Action and the Permission mapped to that Protected_Action is enabled on the Role saved on that Authenticated_Session's User_Account at the time of the request, THE Gym_Platform SHALL NOT reject the Protected_Action because that Permission is disabled or because a different Permission on that Role is disabled.
7. IF the saved enabled or disabled state of a Permission on a Role changes, THEN THE Gym_Platform SHALL leave every User_Account, Owner_Profile, Gym, Role name, and every other Permission state as they were before that change.
