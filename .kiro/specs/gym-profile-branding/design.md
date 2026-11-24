# Gym Profile and Branding Design

## Overview

Optional profile fields are columns on `gyms`. Branding is one `gym_branding` row per Gym, inserted on the first successful `PATCH /gyms/me/branding`. Both actions use `manage_gym_setup`. No new module, permission, or audit row is added.

Validation of the new values lives in `gym-profile-values.ts` and runs in `GymsService` before any write. The global validation pipe still whitelists profile keys. Branding is checked from the raw body so an unknown key uses `Branding values are not valid` rather than the pipe's default unknown-property text.

A body is validated before the Gym is loaded. An invalid body is 400 even when the owner has no Gym. A valid body with no Gym is 404. That matches profile updates today.

## Routes

| Route | Permission | Success |
| --- | --- | --- |
| `PATCH /gyms/me/profile` | `manage_gym_setup` | 200, full gym |
| `GET /gyms/me/branding` | `manage_gym_setup` | 200, branding |
| `PATCH /gyms/me/branding` | `manage_gym_setup` | 200, branding |

`PATCH /gyms/me/setup` does not accept the three new fields. The pipe rejects them as unknown properties.

## Gym response

Every gym response gains three keys. Create, `GET /gyms/me`, both profile and setup patches, complete setup, `GET /gyms/pending`, and activation all use the same shape.

```json
{
  "id": "…",
  "status": "setup_in_progress",
  "gymName": null,
  "address": null,
  "contact": null,
  "timing": null,
  "logoValue": null,
  "contactEmail": null,
  "description": null,
  "mapsUrl": null
}
```

`GET /gyms/pending` still adds `ownerEmail` on each item.

`contactEmail` uses `isValidEmailAddress` and is stored exactly. It is not lowercased and it is not trimmed. `description` uses JavaScript string length, from 1 to 500, with no trim. `mapsUrl` must match `/^https:\/\//i`, parse as a URL, use the `https:` protocol, have a hostname, and be at most 2048 characters. The stored map link is the submitted string. `null` clears one optional field. The five setup fields still require a string of at least one character, including `logoValue` of `nice`.

Profile writes are rejected with the existing locked message once status is `pending` or `active`. Invalid values are rejected before that lock check, and before the Gym lookup, so a bad body writes nothing.

Setup completion still checks only `gymName`, `address`, `contact`, `timing`, and `logoValue`.

## Branding response

```json
{
  "theme": "neon",
  "primaryColor": "#C7FF3D",
  "secondaryColor": "#111414",
  "buttonStyle": "medium"
}
```

`GET` returns those defaults when `gym_branding` has no row for the Gym and does not insert one. `PATCH` accepts any subset of the four keys and requires at least one. The first save inserts a row, filling omitted keys from the defaults. A later save changes only the submitted keys.

Colours match `/^#[0-9A-Fa-f]{6}$/` and are stored with `toUpperCase()`. Theme and button style are exact lowercase enums. Null, an empty string, an unknown theme, an unknown button style, an unknown key, and an empty object are 400 `Branding values are not valid`.

Branding does not read or write `status`, setup fields, optional profile fields, or subscriptions. It is allowed for every Gym_Status.

The response has no `id` and no `gymId`. The caller's Gym comes from the authenticated user. The body cannot select a Gym.

## Data model

New migration `prisma/migrations/20261123180000_gym_profile_branding`. Do not edit earlier migrations.

`gyms` gains nullable `contact_email`, `description`, and `maps_url`. Existing rows stay null.

`gym_branding` has `gym_id` unique, `theme`, `primary_color`, `secondary_color`, and `button_style`. Colours are checked as `^#[0-9A-F]{6}$`. Optional gym values are checked only for length, and a map link must start with `https://`, so a value the service accepts is a value the database accepts.

`StaffService` copies the three new gym keys when it builds a `GymResponse` for an internal caller. It does not grow branding routes.

## Errors

| Condition | Status | Message |
| --- | --- | --- |
| Bad email, description, or map link | 400 | `Gym profile values are not valid` |
| Empty setup field, or null setup field | 400 | `Submitted gym value must contain at least one character` |
| Profile or setup write while pending or active | 409 | `Gym profile and basic setup cannot be changed while status is pending or active` |
| Bad branding body | 400 | `Branding values are not valid` |
| No Gym | 404 | `Gym was not found` |
| `manage_gym_setup` disabled | 403 | `Permission is disabled` |

The body is always `{ "statusCode": number, "message": string }`.
