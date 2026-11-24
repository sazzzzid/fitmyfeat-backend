# Requirements Document

## Introduction

Gym profile fields give a Gym_Owner a contact email, a description, and a map link. Gym branding was removed on 2026-11-23. Do not add theme, colours, button style, `GET /gyms/me/branding`, or `PATCH /gyms/me/branding`.

The confirmed profile decisions are:

- `null` clears `contactEmail`, `description`, or `mapsUrl`. The five setup fields cannot be cleared.
- `contactEmail`, `description`, and `mapsUrl` are not part of setup completeness.

## Glossary

- **Optional_Profile_Field**: `contactEmail`, `description`, or `mapsUrl` on a Gym.
- **Setup_Field**: `gymName`, `address`, `contact`, `timing`, or `logoValue`. Unchanged from Phase 1.

Phase 1 through Phase 6 terms keep their existing meaning.

## Requirements

### Requirement 1: Optional gym profile fields

**User Story:** As a Gym_Owner, I want a contact email, a description, and a map link on my gym, so that the profile screen can show them.

#### Acceptance Criteria

1. THE Gym_Platform SHALL store `contactEmail`, `description`, and `mapsUrl` on the Gym. Each is text or null. A Gym created before these columns existed, and a newly created Gym, SHALL return null for each.
2. WHEN a gym is returned by create, `GET /gyms/me`, `PATCH /gyms/me/profile`, `PATCH /gyms/me/setup`, complete setup, the pending list, or activation, THE Gym_Platform SHALL include the three fields. No previously returned key SHALL change type or meaning.
3. WHERE the caller has `manage_gym_setup` and the Gym is `setup_in_progress`, WHEN `PATCH /gyms/me/profile` submits one or more Optional_Profile_Fields, THE Gym_Platform SHALL store a valid string and SHALL store null when the submitted value is null. Omitted fields SHALL stay unchanged.
4. IF an Optional_Profile_Field is not a valid value, THEN THE Gym_Platform SHALL reject the profile update with 400 `Gym profile values are not valid` and SHALL store nothing from that request. A valid email is the existing email check, at most 254 characters, stored as submitted. A description is 1 to 500 characters. A map link is an absolute `https` URL of 1 to 2048 characters. `javascript:`, `data:`, `http:`, and every other scheme are rejected. An empty string is rejected.
5. IF a Setup_Field is submitted as null or as a value that is not a string of at least one character, THEN THE Gym_Platform SHALL keep the Phase 1 error `Submitted gym value must contain at least one character` and SHALL NOT clear that field.
6. THE Gym_Platform SHALL NOT accept an Optional_Profile_Field on `PATCH /gyms/me/setup`.
7. WHEN setup is completed, THE Gym_Platform SHALL still require only the five Setup_Fields. Null Optional_Profile_Fields SHALL NOT make setup incomplete. Filled Optional_Profile_Fields SHALL NOT make an incomplete setup complete.
8. IF the Gym is `pending` or `active`, THEN a profile update that would change an Optional_Profile_Field SHALL be rejected with 409 `Gym profile and basic setup cannot be changed while status is pending or active`, and the stored Gym SHALL be unchanged.
9. THE Gym_Platform SHALL NOT add a second logo field. `logoValue` is the public path of an image uploaded with `POST /gyms/me/logo`. A text value such as `nice` is not a logo.

### Requirement 2: Gym branding

**User Story:** As a Gym_Owner, I want to choose how my gym looks, so that the profile screen can preview it.

#### Acceptance Criteria

1. WHERE the caller has `manage_gym_setup` and has a Gym, WHEN branding is read and no row is stored, THE Gym_Platform SHALL return theme `neon`, primary `#C7FF3D`, secondary `#111414`, and button style `medium`, and SHALL NOT insert a row.
2. WHEN branding is updated with one or more of `theme`, `primaryColor`, `secondaryColor`, and `buttonStyle`, THE Gym_Platform SHALL create the row on the first save and SHALL return the full branding object. A field that was not submitted SHALL keep its stored value, or the default when no row exists yet.
3. THE theme SHALL be `neon`, `dark`, `light`, or `classic`. THE button style SHALL be `rounded`, `medium`, or `square`. A colour SHALL be `#` and six hexadecimal digits, stored in uppercase.
4. IF the body is empty, contains an unknown key, or contains a value that is not valid, THEN THE Gym_Platform SHALL reject it with 400 `Branding values are not valid` and SHALL store nothing from that request. Null does not clear a branding field.
5. THE Gym_Platform SHALL allow branding while the Gym is `setup_in_progress`, `pending`, or `active`. A branding update SHALL NOT change Gym_Status, the Setup_Fields, the Optional_Profile_Fields, or a subscription.
6. IF the caller has no Gym, THEN `GET /gyms/me/branding` and a valid `PATCH /gyms/me/branding` SHALL return 404 `Gym was not found`.
7. IF `manage_gym_setup` is disabled, THEN THE Gym_Platform SHALL reject branding with 403 `Permission is disabled`.
8. A branding update SHALL apply only to the caller's Gym. Another owner's Gym and branding SHALL stay unchanged.
9. THE Gym_Platform SHALL NOT expose branding on a public or member route, SHALL NOT write an audit row for these edits, and SHALL NOT add a Permission.

### Requirement 3: Boundaries

**User Story:** As the platform operator, I want profile and branding to stay inside the gym module, so that the rest of the platform keeps its current behavior.

#### Acceptance Criteria

1. THE Gym_Platform SHALL keep Owner_Profile limited to `displayName` and `contact`.
2. Errors SHALL stay `{ "statusCode": number, "message": string }`.
3. THE Gym_Platform SHALL accept the gym logo only as an image file on `POST /gyms/me/logo`. PNG, JPEG, WEBP, and GIF are accepted. The stored `logoValue` is that file's public path.
4. Phase 1 gym status transitions SHALL stay `setup_in_progress` to `pending` to `active`.
