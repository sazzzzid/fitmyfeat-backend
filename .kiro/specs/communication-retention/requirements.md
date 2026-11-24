# Requirements Document

## Introduction

Phase 6 adds message templates, gym communication, three retention automations, and delivery counts. A Super_Admin writes templates for WhatsApp, SMS, and push. A Gym_Owner whose Gym is `active` sends a template to one Member and can turn on expiry, payment, and inactive-member reminders.

No message provider is added. There is no WhatsApp Business API, no SMS gateway, no push service, and no background scheduler. A send stores a Message. The platform decides `sent` or `failed` from the Member's stored contact. The Gym_Owner runs automations by calling one action. That action is not a cron job.

The user confirmed this phase on 2026-11-23 from the Phase 6 diagram. These rules make that diagram testable. Correct them before implementation if they are wrong:

- WhatsApp and SMS are sent only when the Member contact contains at least 8 digits. Other characters are ignored when counting digits. Push is stored as `failed` with the reason that the Member has no push destination, because a Member has no device token.
- A template belongs to the platform, not to a Gym. It is never deleted. It can be made inactive. An inactive template cannot be sent.
- Placeholders are `{{memberName}}`, `{{gymName}}`, `{{endDate}}`, and `{{unpaidAmount}}`. Any other `{{...}}` is rejected. `unpaidAmount` is rupees with two decimals. `endDate` is `YYYY-MM-DD` or empty when the Member has no Membership.
- The three automations are `expiry`, `payment`, and `inactive`. The Gym_Owner picks one active template and an on or off flag for each. Triggers are not created by the Super_Admin.
- Expiry means the Membership is in effect and its end is within 7 days. Payment means the Member's outstanding gap is greater than 0. Inactive means the Member is not left, is not frozen, and has had no in-effect Membership for 14 days.
- Left Members are never messaged. A run stores at most one Message per Member per trigger per UTC day. A manual send is not part of that limit.
- One run stores at most 100 Messages. Further due Members are left for the next run.
- Delivery analytics are counts by channel and status. They do not include message text, Member names, or a per-gym list.
- Staff cannot send messages.

## Glossary

- **Channel**: `whatsapp`, `sms`, or `push`.
- **Message_Template**: A platform template with a channel, a name, a body, and an active flag.
- **Message**: One stored send to one Member. Its status is `sent` or `failed`. Its trigger is `manual`, `expiry`, `payment`, or `inactive`.
- **Automation**: One Gym setting for one trigger. It points at one active template and is enabled or disabled.
- **Delivery_Analytics**: Counts of sent and failed Messages in a date range, grouped by channel.

Phase 1 through Phase 5 terms keep their existing meaning. Outstanding keeps its Phase 5 meaning.

## Requirements

### Requirement 1: Permissions

**User Story:** As the platform operator, I want templates and gym sends under separate Permissions, so that a gym cannot edit platform copy.

#### Acceptance Criteria

1. THE Gym_Platform SHALL add `manage_message_templates` and `manage_communications` to the Permission set.
2. WHILE no Permission change has been saved, THE Gym_Platform SHALL keep `manage_message_templates` enabled on Super_Admin and disabled on Gym_Owner, Gym_Staff, and every other Role. It SHALL keep `manage_communications` enabled on Gym_Owner and disabled on Super_Admin, Gym_Staff, and every other Role.
3. WHEN the Gym_Platform starts with data saved before these Permissions existed, THE Gym_Platform SHALL add them with the states in criterion 2 and SHALL leave every previously saved Permission state unchanged.
4. WHEN a Role is created, THE Gym_Platform SHALL give that Role both new Permissions disabled, together with every other Permission disabled.
5. IF a Permission change sets `manage_message_templates` to disabled on Super_Admin, THEN THE Gym_Platform SHALL reject it with an error indicating that `manage_message_templates` cannot be disabled on Super_Admin. `manage_communications` is not locked.
6. THE Gym_Platform SHALL map template list, template create, template update, and delivery analytics to `manage_message_templates`. It SHALL map gym message list, manual send, automation read, automation update, and automation run to `manage_communications`.

### Requirement 2: Message templates

**User Story:** As a Super_Admin, I want reusable WhatsApp, SMS, and push copy, so that gyms send the same wording.

#### Acceptance Criteria

1. WHERE the caller has `manage_message_templates` enabled, WHEN a template is submitted with a Channel, a name of 1 to 64 characters that is not only whitespace, a body of 1 to 500 characters, and optionally an active flag, THE Gym_Platform SHALL store one Message_Template. The active flag defaults to true. The body may contain only the four placeholders in the introduction. The name is stored exactly.
2. IF the channel, name, body, or a placeholder is not valid, THEN THE Gym_Platform SHALL reject the template with an error indicating that the template values are not valid and SHALL store nothing.
3. IF the channel and name are already used together, THEN THE Gym_Platform SHALL reject the create with an error indicating that the template name is already used.
4. WHEN an existing template is updated with one or more of name, body, and active flag, THE Gym_Platform SHALL store the submitted values and SHALL NOT change the channel. A name change that collides with another template of that channel is rejected, and the row is left unchanged.
5. WHEN templates are requested, THE Gym_Platform SHALL return every template, active or inactive, ordered by creation time then identifier.
6. THE Gym_Platform SHALL NOT provide an action that deletes a Message_Template. An inactive template SHALL remain readable and SHALL NOT be usable for a new send.

### Requirement 3: Manual send

**User Story:** As a Gym_Owner, I want to send one template to one member, so that I can follow up myself.

#### Acceptance Criteria

1. WHERE the caller has `manage_communications` enabled and the caller's Gym is `active`, WHEN a manual send names a Member of that Gym and an active Message_Template, THE Gym_Platform SHALL store one Message with trigger `manual`, the template channel, and the body after placeholder replacement.
2. IF the channel is `whatsapp` or `sms` and the Member contact has at least 8 digits, THE Gym_Platform SHALL store the Message as `sent`. OTHERWISE for those channels it SHALL store the Message as `failed` with an error indicating that the contact cannot receive the channel.
3. IF the channel is `push`, THE Gym_Platform SHALL store the Message as `failed` with an error indicating that the Member has no push destination.
4. IF the Member is left, is not in the caller's Gym, or the template is missing or inactive, THEN THE Gym_Platform SHALL reject the send and SHALL store no Message.
5. IF the caller has no Gym, THEN THE Gym_Platform SHALL reject the request with the Phase 1 error indicating that the Gym was not found. IF the Gym is not `active`, THEN THE Gym_Platform SHALL reject it with an error indicating that communication requires an active Gym.
6. WHEN messages are requested with a valid date range, THE Gym_Platform SHALL return Messages of that Gym in that range and no Message of another Gym, newest first. Each item includes the Member name, channel, trigger, status, failure reason, rendered body, and time. The rendered body is the stored body, not the current template body.

### Requirement 4: Automations

**User Story:** As a Gym_Owner, I want expiry, payment, and inactive reminders, so that I do not have to remember each member.

#### Acceptance Criteria

1. WHERE the caller has `manage_communications` enabled and the Gym is `active`, WHEN automations are requested, THE Gym_Platform SHALL return the three triggers. A trigger that has not been saved is disabled and has no template.
2. WHEN automations are updated, each trigger may be omitted, disabled, or enabled with an active template id. An enabled trigger without an active template is rejected. The update replaces the saved settings of the triggers included in the request and leaves the others unchanged.
3. WHEN automations are run, THE Gym_Platform SHALL consider only enabled triggers whose template is still active. It SHALL skip left Members. Expiry matches a Membership that is in effect and ends within 7 days. Payment matches a Member whose outstanding gap is greater than 0. Inactive matches a Member who is not frozen and who has not had an in-effect Membership for 14 days, using the Membership end or, when there is no Membership, the Member creation time.
4. A run SHALL store at most one Message per Member per trigger on the current UTC day, and at most 100 Messages in total. Members beyond that count are not stored and do not count as failed. A later run on the same UTC day SHALL NOT store a second Message for the same Member and trigger.
5. Each stored automation Message uses the same channel rules as a manual send. A failed contact still counts as the one Message for that Member and trigger for that day.
6. The run response SHALL include how many Messages were stored and how many due Members were left for a later run. The response SHALL NOT include a provider id.

### Requirement 5: Delivery analytics

**User Story:** As a Super_Admin, I want sent and failed counts, so that I can see whether templates are usable.

#### Acceptance Criteria

1. WHERE the caller has `manage_message_templates` enabled, WHEN analytics are requested with a valid finance-style date range, THE Gym_Platform SHALL return the number of sent Messages, the number of failed Messages, and the same two numbers for each Channel.
2. The analytics response SHALL NOT include Message bodies, Member names, phone numbers, or Gym ids.
3. IF the date range is not valid, THEN THE Gym_Platform SHALL reject it with the existing finance range error and SHALL store nothing.
4. A Gym_Owner SHALL NOT be able to read platform analytics.

### Requirement 6: Boundaries

**User Story:** As the platform operator, I want Phase 6 to stay inside stored messages, so that billing and memberships keep their current behavior.

#### Acceptance Criteria

1. THE Gym_Platform SHALL NOT call WhatsApp, an SMS gateway, a push service, or an email provider, and SHALL NOT add a scheduled job.
2. Phase 6 SHALL NOT change Gym_Status, subscriptions, expenses, dashboard counts, or membership periods.
3. A Gym_Staff caller SHALL NOT gain communication access from a staff flag.
4. The request body SHALL NOT select a Gym. A Member id selects a Member only within the caller's Gym.
5. THE Gym_Platform SHALL NOT provide an action that edits or deletes a Message.
