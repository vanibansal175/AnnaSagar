import { ListingStatus } from '../models/Listing.js';

export interface TimeRulesConfig {
  maxListingDurationMinutes: number;
  minListingDurationMinutes: number;
  maxFoodAgeAtPickupMinutes: number;
  warningMinutes: number;
}

export interface ValidateListingTimesParams {
  cookedAt: Date;
  pickupDeadline: Date;
  now?: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates cookedAt and pickupDeadline according to D6 food safety rules.
 *
 * Rules:
 * 1. cookedAt must not be in the future (relative to now).
 * 2. (pickupDeadline - now) must be >= MIN_LISTING_DURATION_MINUTES.
 * 3. (pickupDeadline - now) must be <= MAX_LISTING_DURATION_MINUTES.
 * 4. (pickupDeadline - cookedAt) must be <= MAX_FOOD_AGE_AT_PICKUP_MINUTES.
 * 5. pickupDeadline must be after cookedAt.
 */
export function validateListingTimeRules(
  params: ValidateListingTimesParams,
  config: TimeRulesConfig
): ValidationResult {
  const now = params.now || new Date();
  const errors: string[] = [];

  const cookedAtMs = params.cookedAt.getTime();
  const pickupDeadlineMs = params.pickupDeadline.getTime();
  const nowMs = now.getTime();

  // Allow up to 10 seconds of clock drift for cookedAt in case of slight client-server divergence
  if (cookedAtMs > nowMs + 10_000) {
    errors.push('Cooked-at time cannot be in the future');
  }

  if (pickupDeadlineMs <= cookedAtMs) {
    errors.push('Pickup deadline must be after cooked-at time');
  }

  const durationMinutes = (pickupDeadlineMs - nowMs) / (60 * 1000);

  if (durationMinutes < config.minListingDurationMinutes) {
    errors.push(
      `Pickup deadline must be at least ${config.minListingDurationMinutes} minutes from now`
    );
  }

  if (durationMinutes > config.maxListingDurationMinutes) {
    errors.push(
      `Pickup deadline cannot exceed ${config.maxListingDurationMinutes} minutes from now`
    );
  }

  const foodAgeAtPickupMinutes = (pickupDeadlineMs - cookedAtMs) / (60 * 1000);

  if (foodAgeAtPickupMinutes > config.maxFoodAgeAtPickupMinutes) {
    errors.push(
      `Total food age at pickup (${Math.round(foodAgeAtPickupMinutes)} mins) exceeds maximum allowed age (${config.maxFoodAgeAtPickupMinutes} mins)`
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculates the timestamp at which a listing enters the derived WARNING stage.
 * warnAt = pickupDeadline - WARNING_MINUTES
 */
export function calculateWarnAt(pickupDeadline: Date, warningMinutes: number): Date {
  return new Date(pickupDeadline.getTime() - warningMinutes * 60 * 1000);
}

/**
 * Derives whether an AVAILABLE listing is in WARNING stage.
 * Derived stage: status === 'AVAILABLE' and now >= warnAt and now < pickupDeadline.
 */
export function isWarningStage(
  status: ListingStatus,
  pickupDeadline: Date,
  now: Date = new Date(),
  warningMinutes: number
): boolean {
  if (status !== 'AVAILABLE') {
    return false;
  }

  const nowMs = now.getTime();
  const deadlineMs = pickupDeadline.getTime();
  const warnAtMs = deadlineMs - warningMinutes * 60 * 1000;

  return nowMs >= warnAtMs && nowMs < deadlineMs;
}

/**
 * Status Transition Table
 *
 * Terminal statuses: COLLECTED, EXPIRED, CANCELLED.
 */
const ALLOWED_TRANSITIONS: Record<ListingStatus, ReadonlySet<ListingStatus>> = {
  AVAILABLE: new Set<ListingStatus>(['CLAIMED', 'CANCELLED', 'EXPIRED']),
  CLAIMED: new Set<ListingStatus>(['COLLECTED', 'AVAILABLE', 'EXPIRED', 'CANCELLED']),
  COLLECTED: new Set<ListingStatus>(),
  EXPIRED: new Set<ListingStatus>(),
  CANCELLED: new Set<ListingStatus>()
};

/**
 * Validates whether transitioning a listing from one status to another is legal.
 */
export function isValidStatusTransition(
  fromStatus: ListingStatus,
  toStatus: ListingStatus
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }

  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  return allowed ? allowed.has(toStatus) : false;
}
