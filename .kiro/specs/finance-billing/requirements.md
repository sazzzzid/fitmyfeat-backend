# Requirements Document

## Introduction

Phase 5 adds finance and billing on top of the payments the platform already records. A Super_Admin sees platform revenue, subscription payments, commission, refunds, failed payments, settlements, and a financial report. A Gym_Owner whose Gym is `active` sees membership-payment income, expenses, outstanding amounts, a ledger, an invoice, a receipt, and a gym report.

No payment gateway is added. Razorpay, Stripe, UPI collection, webhooks, and payouts to a bank stay out. Refunds, failed payments, and settlements are records a person enters. Prices stay whole paise in INR.

The user confirmed this phase on 2026-11-22 from the Phase 5 diagram. These rules make that diagram testable. Correct them before implementation if they are wrong:

- Platform revenue is a charge written when a Super_Admin marks a subscription paid or renews it. Charges are not created for payments recorded before this phase.
- Commission is one whole percent, `COMMISSION_PERCENT`, from 0 to 100. Unset means 0. The percent is copied onto the charge. A later change does not rewrite old charges.
- A refund is the full charge amount. It does not shorten or cancel the Subscription.
- A failed payment applies only to a `pending_payment` Subscription. The new stored status is `failed`. It is terminal.
- A settlement is one record per UTC calendar month. Its amount is the commission on charges that are still `paid` and were recorded in that month. The admin does not type a different amount.
- Gym income is the membership payments already stored by assign, renew, and switch. There is no second way to record income.
- An expense is append-only. It cannot be edited or deleted.
- Outstanding is the unpaid gap on those membership payments, `listPricePaise - amountReceivedPaise` when that gap is positive. It is a report. This phase does not collect it later.
- An invoice and a receipt are JSON reads of one membership payment. They are not PDF files and they are not emailed.
- Staff cannot read or write finance. The dashboard counts do not change.

## Glossary

- **Platform_Charge**: One platform money event for a Subscription. Its status is `paid`, `failed`, or `refunded`. It stores the amount, the commission percent, and the commission amount.
- **Commission**: `floor(amountPaise * commissionPercent / 100)` paise, copied onto a `paid` charge. A `failed` charge has commission 0. A refunded charge keeps the original numbers but is left out of later commission totals.
- **Settlement**: The confirmation that one UTC month's commission was settled. A month has at most one.
- **Income**: A Phase 3 membership payment. The cash amount is `amountReceivedPaise`.
- **Expense**: Money the Gym spent. It has a category, an amount in paise, a date, and optional notes.
- **Outstanding**: The sum of positive gaps between list price and amount received on that Gym's membership payments.
- **Ledger_Line**: One income or expense row in date order, with a running balance of income minus expense.
- **Invoice**: The JSON view of one membership payment, including the list price.
- **Receipt**: The JSON view of one membership payment, including the amount received and the method.

Phase 1 through Phase 4 terms keep their existing meaning.

## Requirements

### Requirement 1: Permissions

**User Story:** As the platform operator, I want finance split from gym operations, so that a gym owner cannot see platform money and staff cannot see either.

#### Acceptance Criteria

1. THE Gym_Platform SHALL add `manage_platform_finance` and `manage_gym_finance` to the Permission set.
2. WHILE no Permission change has been saved, THE Gym_Platform SHALL keep `manage_platform_finance` enabled on Super_Admin and disabled on Gym_Owner, Gym_Staff, and every other Role. It SHALL keep `manage_gym_finance` enabled on Gym_Owner and disabled on Super_Admin, Gym_Staff, and every other Role.
3. WHEN the Gym_Platform starts with data saved before these Permissions existed, THE Gym_Platform SHALL add them with the states in criterion 2 and SHALL leave every previously saved Permission state unchanged.
4. WHEN a Role is created, THE Gym_Platform SHALL give that Role both new Permissions disabled, together with every other Permission disabled.
5. IF a Permission change sets `manage_platform_finance` to disabled on Super_Admin, THEN THE Gym_Platform SHALL reject it with an error indicating that `manage_platform_finance` cannot be disabled on Super_Admin, and leave every Permission state unchanged. `manage_gym_finance` is not locked.
6. THE Gym_Platform SHALL map platform report, platform payment list, refund, mark failed, and settlement to `manage_platform_finance`. It SHALL map every gym finance route to `manage_gym_finance`. Marking a subscription paid stays on `manage_subscriptions`.

### Requirement 2: Platform charges

**User Story:** As a Super_Admin, I want each paid subscription to leave a payment record, so that revenue has a source.

#### Acceptance Criteria

1. WHEN a Subscription is marked paid or renewed by the existing action, THE Gym_Platform SHALL store one `paid` Platform_Charge in the same transaction. The amount is the subscription price in paise after that action. The commission percent is the configured percent at that moment. The commission amount is Commission for that amount. The charge stores the Gym and the Subscription.
2. A trial start SHALL NOT store a Platform_Charge. Marking a trial paid SHALL still fail with the existing error and SHALL store no charge.
3. IF the paid or renew action is rejected, THEN THE Gym_Platform SHALL store no Platform_Charge.
4. A charge stored before a commission-percent change SHALL keep its copied percent and amount.
5. WHERE the caller has `manage_platform_finance` enabled, WHEN platform payments are requested, THE Gym_Platform SHALL return every Platform_Charge, optionally limited to one status, ordered by recording time descending and then identifier descending. Each item includes the Gym id, Subscription id, amount, commission, status, and times. The response SHALL NOT include a card number or a gateway id.

### Requirement 3: Failed payment

**User Story:** As a Super_Admin, I want to record that a payment request failed, so that it does not stay open.

#### Acceptance Criteria

1. WHERE the caller has `manage_platform_finance` enabled, WHEN a `pending_payment` Subscription is marked failed, THE Gym_Platform SHALL set its stored status to `failed` and store one `failed` Platform_Charge for the Plan's current monthly price, with commission 0.
2. IF the Subscription is `trialing`, `active`, `failed`, or missing, THEN THE Gym_Platform SHALL reject the action and SHALL leave it unchanged. A `failed` Subscription SHALL NOT be marked paid.
3. A `failed` Subscription SHALL NOT be in effect, SHALL NOT affect Entitlements, and SHALL NOT block a later plan request. The one-pending rule stays limited to `pending_payment`.
4. The existing Gym_Status transitions SHALL NOT change.

### Requirement 4: Refunds

**User Story:** As a Super_Admin, I want to refund a platform payment, so that the books show the money went back.

#### Acceptance Criteria

1. WHERE the caller has `manage_platform_finance` enabled, WHEN a `paid` Platform_Charge is refunded, THE Gym_Platform SHALL set its status to `refunded` and set the refund time to the current time. The amount and commission numbers stay as stored.
2. IF the charge is `failed`, `refunded`, or missing, THEN THE Gym_Platform SHALL reject the refund and SHALL leave it unchanged.
3. A refund SHALL NOT change the Subscription period, the Subscription status, the Plan, or the Gym.
4. THE Gym_Platform SHALL NOT provide a partial refund.

### Requirement 5: Commission and settlement

**User Story:** As a Super_Admin, I want each month's commission settled once, so that the platform total is closed.

#### Acceptance Criteria

1. THE Gym_Platform SHALL read `COMMISSION_PERCENT` as a whole number from 0 to 100. A missing or empty value means 0. Any other value SHALL stop startup with an error naming `COMMISSION_PERCENT`.
2. WHERE the caller has `manage_platform_finance` enabled, WHEN a month `YYYY-MM` is settled, THE Gym_Platform SHALL store one Settlement for that UTC month. The amount is the sum of commission on `paid` charges whose recording time falls in that month. Refunded and failed charges do not add to it.
3. IF the month is not `YYYY-MM`, is in the future, or already has a Settlement, THEN THE Gym_Platform SHALL reject it and SHALL store nothing.
4. WHEN settlements are requested, THE Gym_Platform SHALL return every Settlement, newest month first.
5. THE Gym_Platform SHALL NOT call a bank, a payout API, or a payment gateway.

### Requirement 6: Platform report

**User Story:** As a Super_Admin, I want one report for a date range, so that I can see revenue, refunds, failures, and commission together.

#### Acceptance Criteria

1. WHERE the caller has `manage_platform_finance` enabled, WHEN a report is requested with `from` and `to` as `YYYY-MM-DD` and `from` is not after `to`, THE Gym_Platform SHALL return the totals for charges and refunds whose recording or refund time falls in that inclusive UTC range: revenue, refunds, commission on charges that are still `paid`, failed amount, failed count, and net revenue after refunds.
2. IF a date is missing or not `YYYY-MM-DD`, or `from` is after `to`, or the range is longer than 366 days, THEN THE Gym_Platform SHALL reject the report and SHALL store nothing.
3. The report SHALL NOT change Platform_Stats or the dashboard response.

### Requirement 7: Gym income, expenses, and outstanding

**User Story:** As a Gym_Owner, I want income, expenses, and what members still owe, so that I can see the gym's money.

#### Acceptance Criteria

1. WHERE the caller has `manage_gym_finance` enabled and the caller's Gym is `active`, WHEN income is requested, THE Gym_Platform SHALL return every membership payment of that Gym and no payment of another Gym, ordered by payment date then identifier. The fields are the existing payment fields plus the member name and product name stored on that payment's snapshot.
2. WHERE the same conditions hold, WHEN an expense is submitted with a category of 1 to 64 characters that is not only whitespace, an amount from 1 to 2,147,483,647 paise, a date `YYYY-MM-DD`, and notes omitted or notes of 0 to 500 characters, THE Gym_Platform SHALL store one Expense for that Gym.
3. IF an expense value is not valid, THEN THE Gym_Platform SHALL reject it with an error indicating that the expense values are not valid and SHALL store nothing.
4. WHEN expenses are requested, THE Gym_Platform SHALL return every Expense of that Gym, ordered by date then identifier.
5. THE Gym_Platform SHALL NOT provide an action that edits or deletes an Expense or a membership payment.
6. WHEN outstanding is requested, THE Gym_Platform SHALL compute it from membership payments of that Gym. A payment's gap is its list price minus the amount received, and a negative gap counts as 0. The response includes the total and one row per Member who has a positive gap, with the member name and the gap, ordered by gap descending then member identifier.
7. IF the caller has no Gym, THEN THE Gym_Platform SHALL reject the request with the Phase 1 error indicating that the Gym was not found. IF the Gym is not `active`, THEN THE Gym_Platform SHALL reject it with an error indicating that gym finance requires an active Gym. A payment or expense of another Gym SHALL be rejected as not found.

### Requirement 8: Ledger, invoice, receipt, and gym report

**User Story:** As a Gym_Owner, I want a ledger and a paper trail for each payment, so that I can answer what came in and what went out.

#### Acceptance Criteria

1. WHERE the caller has `manage_gym_finance` enabled and the Gym is `active`, WHEN the ledger is requested with a valid date range, THE Gym_Platform SHALL return income and expense lines in that range, ordered by date then identifier. An income line uses the amount received. Each line includes a running balance that starts at 0 for the range. Outstanding gaps are not lines.
2. WHEN an invoice is requested for a membership payment of that Gym, THE Gym_Platform SHALL return the payment id, Gym name, member name, product name, list price, amount received, date, and method. WHEN a receipt is requested for the same payment, THE Gym_Platform SHALL return the payment id, Gym name, member name, amount received, date, and method.
3. IF the payment is not in that Gym, THEN THE Gym_Platform SHALL reject the invoice and the receipt with an error indicating that the payment was not found.
4. WHEN the gym report is requested with a valid date range, THE Gym_Platform SHALL return income received in the range, expenses in the range, net income minus expenses, and outstanding computed from payments dated on or before `to`.
5. THE Gym_Platform SHALL NOT generate a PDF, send an email, or store a second copy of an invoice or a receipt.

### Requirement 9: Boundaries

**User Story:** As the platform operator, I want Phase 5 to stay inside these books, so that memberships and subscriptions keep their current behavior.

#### Acceptance Criteria

1. THE Gym_Platform SHALL NOT call a payment gateway, create a payout, or store a card or bank account.
2. Phase 5 SHALL NOT change Gym_Status, member seat rules, staff seat rules, or the dashboard counts.
3. A Gym_Staff caller SHALL NOT pass `manage_gym_finance` or `manage_platform_finance` by a staff flag.
4. The request body SHALL NOT select a Gym or an owner. Platform routes may name a Subscription or a charge that already exists.
5. Marking paid, assign, renew, and switch SHALL keep their current responses except that a successful mark-paid or renewal also stores a Platform_Charge.
