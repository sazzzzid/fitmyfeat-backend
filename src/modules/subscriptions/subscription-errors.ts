export const SUBSCRIPTION_ERRORS = {
  selectionInvalid: 'Plan selection is not valid',
  gymNotActive: 'Plan selection requires an active gym',
  planNotFound: 'Plan was not found',
  noTrial: 'This plan has no trial',
  trialUsed: 'Trial already used',
  alreadyInEffect: 'A subscription is already in effect',
  planInEffect: 'This plan is already in effect',
  subscriptionNotFound: 'Subscription was not found',
  trialNotPayable: 'A trial cannot be marked paid',
  notCurrent: 'Only the current subscription can be renewed',
  filterInvalid: 'Subscription filter is not valid',
} as const;
