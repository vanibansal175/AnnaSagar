import { describe, expect, it } from 'vitest';
import {
  calculateWarnAt,
  isWarningStage,
  isValidStatusTransition,
  TimeRulesConfig,
  validateListingTimeRules
} from '../utils/time-rules.js';

describe('Time Rules Module', () => {
  const config: TimeRulesConfig = {
    maxListingDurationMinutes: 180,
    minListingDurationMinutes: 45,
    maxFoodAgeAtPickupMinutes: 240,
    warningMinutes: 30
  };

  const fixedNow = new Date('2026-11-14T12:00:00.000Z');

  describe('validateListingTimeRules', () => {
    it('accepts valid time window at exact boundaries', () => {
      // Cooked right now, pickup exactly at min duration (45 mins)
      const validMin = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt: fixedNow,
          pickupDeadline: new Date(fixedNow.getTime() + 45 * 60 * 1000)
        },
        config
      );
      expect(validMin.valid).toBe(true);
      expect(validMin.errors).toHaveLength(0);

      // Cooked right now, pickup exactly at max duration (180 mins)
      const validMax = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt: fixedNow,
          pickupDeadline: new Date(fixedNow.getTime() + 180 * 60 * 1000)
        },
        config
      );
      expect(validMax.valid).toBe(true);
      expect(validMax.errors).toHaveLength(0);

      // Cooked 60 mins ago, pickup at max duration (180 mins from now -> total age = 240 mins)
      const validMaxAge = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt: new Date(fixedNow.getTime() - 60 * 60 * 1000),
          pickupDeadline: new Date(fixedNow.getTime() + 180 * 60 * 1000)
        },
        config
      );
      expect(validMaxAge.valid).toBe(true);
      expect(validMaxAge.errors).toHaveLength(0);
    });

    it('rejects cookedAt in the future', () => {
      const futureCooked = new Date(fixedNow.getTime() + 5 * 60 * 1000); // 5 mins in future
      const result = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt: futureCooked,
          pickupDeadline: new Date(fixedNow.getTime() + 60 * 60 * 1000)
        },
        config
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cooked-at time cannot be in the future');
    });

    it('rejects pickupDeadline strictly less than min duration boundary', () => {
      // 44.9 minutes from now (< 45 minutes)
      const deadline = new Date(fixedNow.getTime() + 44 * 60 * 1000);
      const result = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt: fixedNow,
          pickupDeadline: deadline
        },
        config
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least 45 minutes'))).toBe(true);
    });

    it('rejects pickupDeadline strictly greater than max duration boundary', () => {
      // 181 minutes from now (> 180 minutes)
      const deadline = new Date(fixedNow.getTime() + 181 * 60 * 1000);
      const result = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt: fixedNow,
          pickupDeadline: deadline
        },
        config
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cannot exceed 180 minutes'))).toBe(true);
    });

    it('rejects food older than MAX_FOOD_AGE_AT_PICKUP_MINUTES at deadline', () => {
      // Cooked 65 mins ago + 180 mins deadline = 245 mins (> 240 mins)
      const cookedAt = new Date(fixedNow.getTime() - 65 * 60 * 1000);
      const deadline = new Date(fixedNow.getTime() + 180 * 60 * 1000);

      const result = validateListingTimeRules(
        {
          now: fixedNow,
          cookedAt,
          pickupDeadline: deadline
        },
        config
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds maximum allowed age'))).toBe(true);
    });
  });

  describe('isWarningStage and calculateWarnAt', () => {
    const deadline = new Date('2026-11-14T13:00:00.000Z');

    it('calculates exact warnAt timestamp', () => {
      const warnAt = calculateWarnAt(deadline, 30);
      expect(warnAt.toISOString()).toBe('2026-11-14T12:30:00.000Z');
    });

    it('identifies warning stage at exact boundaries', () => {
      // 31 minutes before deadline -> not warning yet
      const beforeWarn = new Date(deadline.getTime() - 31 * 60 * 1000);
      expect(isWarningStage('AVAILABLE', deadline, beforeWarn, 30)).toBe(false);

      // Exactly 30 minutes before deadline -> in warning
      const exactWarn = new Date(deadline.getTime() - 30 * 60 * 1000);
      expect(isWarningStage('AVAILABLE', deadline, exactWarn, 30)).toBe(true);

      // 1 minute before deadline -> in warning
      const nearDeadline = new Date(deadline.getTime() - 1 * 60 * 1000);
      expect(isWarningStage('AVAILABLE', deadline, nearDeadline, 30)).toBe(true);

      // At deadline -> no longer warning (it is expired)
      expect(isWarningStage('AVAILABLE', deadline, deadline, 30)).toBe(false);

      // After deadline -> not warning
      const pastDeadline = new Date(deadline.getTime() + 5 * 60 * 1000);
      expect(isWarningStage('AVAILABLE', deadline, pastDeadline, 30)).toBe(false);

      // Not AVAILABLE status -> never warning
      expect(isWarningStage('CLAIMED', deadline, exactWarn, 30)).toBe(false);
      expect(isWarningStage('COLLECTED', deadline, exactWarn, 30)).toBe(false);
      expect(isWarningStage('EXPIRED', deadline, exactWarn, 30)).toBe(false);
      expect(isWarningStage('CANCELLED', deadline, exactWarn, 30)).toBe(false);
    });
  });

  describe('Status Transition Table', () => {
    it('allows self-transition (noop)', () => {
      expect(isValidStatusTransition('AVAILABLE', 'AVAILABLE')).toBe(true);
      expect(isValidStatusTransition('CLAIMED', 'CLAIMED')).toBe(true);
      expect(isValidStatusTransition('COLLECTED', 'COLLECTED')).toBe(true);
      expect(isValidStatusTransition('EXPIRED', 'EXPIRED')).toBe(true);
      expect(isValidStatusTransition('CANCELLED', 'CANCELLED')).toBe(true);
    });

    it('allows valid transitions from AVAILABLE', () => {
      expect(isValidStatusTransition('AVAILABLE', 'CLAIMED')).toBe(true);
      expect(isValidStatusTransition('AVAILABLE', 'CANCELLED')).toBe(true);
      expect(isValidStatusTransition('AVAILABLE', 'EXPIRED')).toBe(true);
      expect(isValidStatusTransition('AVAILABLE', 'COLLECTED')).toBe(false);
    });

    it('allows valid transitions from CLAIMED', () => {
      expect(isValidStatusTransition('CLAIMED', 'COLLECTED')).toBe(true);
      expect(isValidStatusTransition('CLAIMED', 'AVAILABLE')).toBe(true);
      expect(isValidStatusTransition('CLAIMED', 'EXPIRED')).toBe(true);
      expect(isValidStatusTransition('CLAIMED', 'CANCELLED')).toBe(true);
    });

    it('enforces terminal statuses', () => {
      // COLLECTED is terminal
      expect(isValidStatusTransition('COLLECTED', 'AVAILABLE')).toBe(false);
      expect(isValidStatusTransition('COLLECTED', 'CLAIMED')).toBe(false);
      expect(isValidStatusTransition('COLLECTED', 'EXPIRED')).toBe(false);
      expect(isValidStatusTransition('COLLECTED', 'CANCELLED')).toBe(false);

      // EXPIRED is terminal
      expect(isValidStatusTransition('EXPIRED', 'AVAILABLE')).toBe(false);
      expect(isValidStatusTransition('EXPIRED', 'CLAIMED')).toBe(false);
      expect(isValidStatusTransition('EXPIRED', 'COLLECTED')).toBe(false);
      expect(isValidStatusTransition('EXPIRED', 'CANCELLED')).toBe(false);

      // CANCELLED is terminal
      expect(isValidStatusTransition('CANCELLED', 'AVAILABLE')).toBe(false);
      expect(isValidStatusTransition('CANCELLED', 'CLAIMED')).toBe(false);
      expect(isValidStatusTransition('CANCELLED', 'COLLECTED')).toBe(false);
      expect(isValidStatusTransition('CANCELLED', 'EXPIRED')).toBe(false);
    });
  });
});
