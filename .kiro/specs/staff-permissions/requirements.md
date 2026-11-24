# Requirements Document

## Introduction

Phase 4 adds staff who can sign in, platform role templates, and an audit log of those changes. A Super_Admin maintains three templates: Owner, Manager, and Staff. A Gym_Owner whose Gym is `active` creates staff for that Gym, with a job title of trainer, reception, or accountant, and with view, create, and manage access copied from a template.

A staff member is a User_Account. A Member is not. Public registration still creates only a Gym_Owner. There is still one sign-in endpoint.

The user confirmed this phase on 2026-11-22 from the Phase 4 diagram. These rules make that diagram testable. Correct them before implementation if they are wrong:

- `Owner`, `Manager`, and `Staff` are Role_Templates. They are not the Roles `Super_Admin` and `Gym_Owner`, and they do not replace them.
- `trainer`, `reception`, and `accountant` are job titles. A title does not grant access.
- Seeded template access is: Owner has view, create, and manage. Manager has view and create, not manage. Staff has view only.
- The three flags are independent. Create does not imply view. Manage does not imply view or create.
- The flags apply only to the existing member and membership-product routes. They do not grant dashboard, user, role, gym-setup, plan, or subscription access.
- A Gym_Owner keeps today's `manage_members` access. The Owner template is not applied to the Gym_Owner account.
- Creating or enabling a staff member enforces `maxStaff` from Entitlements. A disabled staff member does not use a seat. There is no delete.
- The audit log records template and staff changes only. It does not record member edits, and it is not a general audit system.
- The Gym_Owner sets the staff password. There is no invitation email and no self-service password reset.

Out of scope: attendance, QR check-in, branches, payroll, shift schedules, notifications, payment gateways, Super_Admin lists of a gym's staff, deleting staff or templates, and enforcement of `maxBranches` or Feature_Flags.

## Glossary

- **Role_Template**: A platform record named `Owner`, `Manager`, or `Staff`. It stores three flags: view, create, and manage. It is not a Role and has no User_Account.
- **Staff_Member**: A person who can sign in and who belongs to one Gym. The record stores the job title, the template it was last copied from, the three flags, and whether it is disabled.
- **Staff_Title**: `trainer`, `reception`, or `accountant`.
- **Gym_Staff**: The Role assigned to every Staff_Member. All platform Permissions on this Role stay disabled.
- **Staff_Access**: The three flags on one Staff_Member. They are copied from a Role_Template and may later differ from it.
- **Disabled_Staff**: A Staff_Member with a disable time set. Disabled_Staff does not use a `maxStaff` seat and cannot use staff or member routes.
- **Audit_Entry**: One append-only row for a successful template or staff change. It stores the actor, the action, the target, and a detail object. It does not store a password or a password hash.

Phase 1, Phase 2, and Phase 3 terms keep their existing meaning. `maxStaff` keeps its Phase 2 meaning: a number, or `null` for unlimited.

## Requirements

### Requirement 1: Permission and the Gym_Staff role

**User Story:** As a Gym_Owner, I want staff administration under one Permission, so that it follows the same Role rules as earlier phases.

#### Acceptance Criteria

1. THE Gym_Platform SHALL add the Permission `manage_staff` to the existing Permission set.
2. WHILE no Permission change has been saved, THE Gym_Platform SHALL keep `manage_staff` enabled on the Gym_Owner Role and disabled on the Super_Admin Role, the Gym_Staff Role, and every other Role.
3. WHEN the Gym_Platform starts with data saved before this Permission existed, THE Gym_Platform SHALL add `manage_staff` with the states in criterion 2 and SHALL leave every previously saved Permission state unchanged.
4. WHEN a Role is created, THE Gym_Platform SHALL give that Role `manage_staff` disabled, together with every other Permission disabled.
5. THE Gym_Platform SHALL accept `manage_staff` in a Permission change and SHALL return it in the Role list. `manage_staff` is not locked on Super_Admin. The existing locks stay unchanged.
6. WHEN the Gym_Platform starts and no Role is named `Gym_Staff`, THE Gym_Platform SHALL create that Role with every Permission disabled. WHEN the Role already exists, THE Gym_Platform SHALL leave its Permission states unchanged.
7. THE Gym_Platform SHALL keep public registration limited to the Gym_Owner Role. A registration body SHALL NOT select `Gym_Staff` or `Super_Admin`.
8. IF a role assignment names a User_Account that is a Staff_Member, THEN THE Gym_Platform SHALL reject it with an error indicating that the staff role cannot be changed, and SHALL leave the User_Account and the Staff_Member unchanged.
9. IF a role assignment selects the Role `Gym_Staff`, THEN THE Gym_Platform SHALL reject it with the existing error indicating that the role assignment is not valid. Only staff creation assigns `Gym_Staff`.
10. THE Gym_Platform SHALL map staff list, staff create, staff update, disable, enable, and the gym audit read to `manage_staff`. It SHALL map the template list, the template update, and the platform audit read to `manage_roles`.

### Requirement 2: Role templates

**User Story:** As a Super_Admin, I want Owner, Manager, and Staff templates, so that gyms start from the same access presets.

#### Acceptance Criteria

1. WHEN the Gym_Platform starts and a Role_Template named `Owner`, `Manager`, or `Staff` is missing, THE Gym_Platform SHALL create the missing template. `Owner` starts with view, create, and manage enabled. `Manager` starts with view and create enabled and manage disabled. `Staff` starts with view enabled and create and manage disabled.
2. WHEN a template of that name already exists, THE Gym_Platform SHALL leave its flags unchanged. Starting more than once SHALL keep exactly one template of each name.
3. WHERE the User_Account Role has `manage_roles` enabled, WHEN templates are requested, THE Gym_Platform SHALL return the three templates and no others, in the order Owner, Manager, Staff, each with its name and its three flags.
4. WHERE the same Permission is enabled, WHEN a template update submits one or more of the three flags as booleans, THE Gym_Platform SHALL store the submitted flags, leave omitted flags unchanged, and leave every Staff_Member unchanged.
5. IF a template update submits no flag, or submits a value that is not a boolean, THEN THE Gym_Platform SHALL reject it with an error indicating that the template values are not valid and SHALL leave the template unchanged.
6. IF a template update names anything other than `Owner`, `Manager`, or `Staff`, THEN THE Gym_Platform SHALL reject it with an error indicating that the template was not found.
7. THE Gym_Platform SHALL NOT provide an action that creates, renames, or deletes a Role_Template.

### Requirement 3: Create a staff member

**User Story:** As a Gym_Owner, I want to add a trainer, receptionist, or accountant, so that they can sign in and work in my gym.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_staff` enabled and the caller's Gym has Gym_Status `active`, WHEN a staff creation is submitted with an Email_Address that passes the Phase 1 email rules, a password that passes the Phase 1 registration password rules, a full name of 1 to 100 characters that contains at least one character other than a space, a tab, a carriage return, or a line feed, a Staff_Title, and a Role_Template name, THE Gym_Platform SHALL store one User_Account with the Role `Gym_Staff` and one Staff_Member for that Gym. The Staff_Member copies that template's three flags at that time, stores the full name exactly as submitted, stores the title, and is not disabled.
2. IF the email, password, full name, title, or template name does not meet criterion 1, THEN THE Gym_Platform SHALL reject the create with an error indicating that the staff values are not valid and SHALL store nothing.
3. IF the Email_Address is already used by a User_Account, THEN THE Gym_Platform SHALL reject the create with the existing duplicate-email error and SHALL store nothing.
4. IF the template name is not one of the three templates, THEN THE Gym_Platform SHALL reject the create with an error indicating that the template was not found and SHALL store nothing.
5. IF the caller has no Gym, THEN THE Gym_Platform SHALL reject the request with the Phase 1 error indicating that the Gym was not found.
6. IF the caller's Gym is `setup_in_progress` or `pending`, THEN THE Gym_Platform SHALL reject the request with an error indicating that staff management requires an active Gym and SHALL store nothing.
7. WHEN a Staff_Member is created, THE Gym_Platform SHALL count Staff_Members of that Gym that are not Disabled_Staff and SHALL read `maxStaff` from that Gym's Entitlements. IF `maxStaff` is a number and the count is greater than or equal to that number, THEN THE Gym_Platform SHALL reject the create with an error indicating that the staff limit is reached and SHALL store nothing. A `maxStaff` of `null` SHALL NOT reject the create. Empty Entitlements, whose `maxStaff` is 0, SHALL reject the create.
8. WHEN two creates for the same Gym would both pass criterion 7 only if the other had not been stored, THE Gym_Platform SHALL store at most `maxStaff` Staff_Members that are not disabled.
9. IF a later Subscription change lowers `maxStaff` below the number of Staff_Members already counted, THEN THE Gym_Platform SHALL leave those Staff_Members unchanged.
10. The create response and every later staff response SHALL NOT include the password or the password hash. The create SHALL NOT create an Owner_Profile, a Gym, a Member, a Plan, or a Subscription.

### Requirement 4: Read and update a staff member

**User Story:** As a Gym_Owner, I want to see my staff and correct their title or access, so that the gym stays accurate.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_staff` enabled and the caller's Gym is `active`, WHEN staff are requested, THE Gym_Platform SHALL return every Staff_Member of that Gym, including Disabled_Staff, and no Staff_Member of any other Gym, ordered by creation time then identifier. Each item includes the email, full name, title, template name, three flags, disabled state, and creation time, and no password.
2. WHERE the same conditions hold, WHEN a Staff_Member of that Gym is updated with one or more of full name, title, template name, view, create, manage, and password, and every submitted value meets Requirement 3, THE Gym_Platform SHALL store the submitted full name, title, or password, and SHALL leave omitted values unchanged.
3. WHEN the update submits a template name and does not submit any of the three flags, THE Gym_Platform SHALL copy that template's current flags onto the Staff_Member and record that template. WHEN the update submits one or more flags and does not submit a template name, THE Gym_Platform SHALL store those flags and leave the recorded template unchanged. IF the update submits both a template name and any flag, THEN THE Gym_Platform SHALL reject it and leave the Staff_Member unchanged.
4. IF an update submits no staff field, or submits a value that does not meet Requirement 3, THEN THE Gym_Platform SHALL reject it with an error indicating that the staff values are not valid and SHALL leave the Staff_Member unchanged.
5. IF a read or update names a Staff_Member that is not stored for the caller's Gym, including a Staff_Member of another Gym, THEN THE Gym_Platform SHALL reject the request with an error indicating that the staff member was not found and SHALL leave every Staff_Member unchanged.
6. THE Gym_Platform SHALL NOT provide an action that deletes a Staff_Member or its User_Account.
7. An update SHALL NOT be rejected because of `maxStaff`. A template edit SHALL NOT change a Staff_Member until an update copies that template again.

### Requirement 5: Disable and enable

**User Story:** As a Gym_Owner, I want to turn a staff sign-in off and on, so that someone who left cannot keep working.

#### Acceptance Criteria

1. WHERE the User_Account Role has `manage_staff` enabled and the caller's Gym is `active`, WHEN a Staff_Member of that Gym who is not disabled is disabled, THE Gym_Platform SHALL set the disable time to the current time and leave the flags, title, and template unchanged.
2. WHEN a disabled Staff_Member submits the correct password to the existing sign-in action, THE Gym_Platform SHALL reject the sign-in with an error indicating that the staff account is disabled and SHALL NOT issue a token. A wrong password SHALL still receive the existing sign-in failure, including for a disabled account.
3. IF disable is requested for a Staff_Member that is already disabled, THEN THE Gym_Platform SHALL reject it with an error indicating that the staff member is already disabled and SHALL leave it unchanged.
4. WHEN a Disabled_Staff member of that Gym is enabled, and the count of Staff_Members that are not disabled is below `maxStaff` or `maxStaff` is `null`, THE Gym_Platform SHALL clear the disable time.
5. IF enable is requested for a Staff_Member that is not disabled, THEN THE Gym_Platform SHALL reject it with an error indicating that the staff member is not disabled.
6. IF enable would exceed `maxStaff`, including a limit of 0, THEN THE Gym_Platform SHALL reject it with an error indicating that the staff limit is reached and SHALL leave the Staff_Member disabled.
7. A Staff_Member that is not disabled SHALL be able to sign in even when all three flags are disabled. Authentication SHALL NOT depend on Staff_Access.
8. AFTER a Staff_Member is disabled, a token issued before that disable SHALL be rejected on member routes and staff routes with an error indicating that the staff account is disabled. `GET /auth/me` SHALL still return that account and SHALL show that it is disabled.

### Requirement 6: View, create, and manage

**User Story:** As a Gym_Owner, I want each staff member limited to view, create, or manage, so that a trainer cannot change the gym.

#### Acceptance Criteria

1. THE Gym_Platform SHALL treat view, create, and manage as independent. A flag that is disabled SHALL reject its routes even when another flag is enabled.
2. WHERE the caller is a Staff_Member that is not disabled, view allows `GET /members` and `GET /membership-products`. Create allows `POST /members`, `POST /membership-products`, and `POST /members/:id/membership`. Manage allows member update, leave, restore, membership-product update, renew, switch, freeze, and unfreeze.
3. IF the caller is a Staff_Member, THE Gym_Platform SHALL authorize those routes only from that Staff_Member's flags. The `manage_members` state on the Gym_Staff Role SHALL NOT grant or remove those routes.
4. IF the caller is not a Staff_Member, THE Gym_Platform SHALL keep the Phase 3 rule: those routes require `manage_members`. A Gym_Owner with `manage_members` enabled SHALL keep the current success and error behavior.
5. A Staff_Member SHALL read and write only Members and Membership_Products of the Staff_Member's Gym. The request body SHALL NOT select a Gym. A Member or product of another Gym SHALL be rejected with the Phase 3 not-found errors and SHALL be left unchanged.
6. Staff routes and member routes for a Staff_Member SHALL require that Gym's status `active`. The member-route error SHALL stay the Phase 3 error indicating that member management requires an active Gym.
7. A Staff_Member SHALL NOT gain `view_dashboard`, `manage_users`, `manage_roles`, `review_gyms`, `create_gym`, `manage_owner_profile`, `manage_gym_setup`, `view_plans`, `manage_plans`, `manage_subscriptions`, `manage_gym_subscription`, or `manage_staff` from a template or from Staff_Access.

### Requirement 7: Audit log

**User Story:** As a Gym_Owner and as a Super_Admin, I want a record of staff and template changes, so that I can see who changed access.

#### Acceptance Criteria

1. WHEN a template update, staff create, staff update, disable, or enable succeeds, THE Gym_Platform SHALL store exactly one Audit_Entry in the same transaction as that change. The entry stores the acting User_Account, the action, the target type, the target identifier, and a detail object. A template entry has no Gym. A staff entry stores the Staff_Member's Gym.
2. IF the change is rejected, THEN THE Gym_Platform SHALL store no Audit_Entry and SHALL leave stored rows unchanged.
3. A template update SHALL NOT create an Audit_Entry for each Staff_Member, and SHALL NOT change any Staff_Member.
4. WHERE the caller has `manage_roles` enabled, WHEN the audit log is requested with platform scope, THE Gym_Platform SHALL return every template Audit_Entry and no staff Audit_Entry, ordered by creation time descending and then identifier descending.
5. WHERE the caller has `manage_staff` enabled and the caller's Gym is `active`, WHEN the audit log is requested with gym scope, THE Gym_Platform SHALL return every Audit_Entry of that Gym and no entry of any other Gym or of a template, in the same order.
6. IF the scope is missing or is not `platform` or `gym`, THEN THE Gym_Platform SHALL reject the read with an error indicating that the audit scope is not valid and SHALL store nothing.
7. THE Gym_Platform SHALL NOT provide an action that updates or deletes an Audit_Entry. A read SHALL NOT store an Audit_Entry.
8. An Audit_Entry SHALL NOT contain a password or a password hash. A password change SHALL be recorded only as the fact that the password changed.

### Requirement 8: Boundaries

**User Story:** As the platform operator, I want Phase 4 to stay inside staff and access, so that members, billing, and gym approval keep their current behavior.

#### Acceptance Criteria

1. THE Gym_Platform SHALL NOT record attendance, generate a QR code, create a branch, or add revenue or usage counts to Platform_Stats.
2. THE Gym_Platform SHALL NOT enforce `maxBranches` or any Feature_Flag. It SHALL enforce `maxStaff` only on staff create and staff enable.
3. Phase 4 actions SHALL NOT change Gym_Status, Setup_Fields, the linked Gym_Owner, a Plan, or a Subscription, except where an earlier phase already writes one.
4. THE Gym_Platform SHALL NOT add a Super_Admin list of Staff_Members. `GET /users` SHALL keep its current shape and MAY include a Staff_Member's email and the Role name `Gym_Staff`.
5. A User_Account SHALL be at most one of Gym owner and Staff_Member. The request body SHALL NOT set an owner id or a gym id.
6. Phase 1 sign-in, Phase 2 subscriptions, and Phase 3 member rules SHALL stay as specified, except for the staff authorization in Requirement 6 and the role-assignment limits in Requirement 1.
