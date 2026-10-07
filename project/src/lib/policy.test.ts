import { describe, it, expect } from 'vitest';
import { checkPolicy, getCountdown, shouldCancelOutsideMatched } from './policy';
import { DEFAULT_CONFIG } from './types';

function makeDate(hour: number, minute: number = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('policy engine', () => {
  it('allows inside campus 24/7', () => {
    for (let h = 0; h < 24; h++) {
      const result = checkPolicy('inside_campus', makeDate(h), DEFAULT_CONFIG, makeDate(h));
      expect(result.allowed).toBe(true);
      expect(result.isLocked).toBe(false);
    }
  });

  it('allows outside campus at 06:00', () => {
    const result = checkPolicy('outside_campus', makeDate(6, 0), DEFAULT_CONFIG, makeDate(6, 0));
    expect(result.allowed).toBe(true);
    expect(result.isLocked).toBe(false);
  });

  it('allows outside campus at 18:59', () => {
    const result = checkPolicy('outside_campus', makeDate(18, 59), DEFAULT_CONFIG, makeDate(18, 59));
    expect(result.allowed).toBe(true);
    expect(result.isLocked).toBe(false);
  });

  it('rejects outside campus at 19:00', () => {
    const result = checkPolicy('outside_campus', makeDate(19, 0), DEFAULT_CONFIG, makeDate(19, 0));
    expect(result.allowed).toBe(false);
    expect(result.isLocked).toBe(true);
  });

  it('rejects outside campus at 19:01', () => {
    const result = checkPolicy('outside_campus', makeDate(19, 1), DEFAULT_CONFIG, makeDate(19, 1));
    expect(result.allowed).toBe(false);
    expect(result.isLocked).toBe(true);
  });

  it('rejects outside campus at 05:59', () => {
    const result = checkPolicy('outside_campus', makeDate(5, 59), DEFAULT_CONFIG, makeDate(5, 59));
    expect(result.allowed).toBe(false);
    expect(result.isLocked).toBe(true);
  });

  it('rejects outside campus at 23:30', () => {
    const result = checkPolicy('outside_campus', makeDate(23, 30), DEFAULT_CONFIG, makeDate(23, 30));
    expect(result.allowed).toBe(false);
    expect(result.isLocked).toBe(true);
  });

  it('shouldCancelOutsideMatched returns true for departure at 19:00', () => {
    expect(shouldCancelOutsideMatched('outside_campus', makeDate(19, 0))).toBe(true);
  });

  it('shouldCancelOutsideMatched returns true for departure at 05:00', () => {
    expect(shouldCancelOutsideMatched('outside_campus', makeDate(5, 0))).toBe(true);
  });

  it('shouldCancelOutsideMatched returns false for departure at 12:00', () => {
    expect(shouldCancelOutsideMatched('outside_campus', makeDate(12, 0))).toBe(false);
  });

  it('shouldCancelOutsideMatched returns false for inside campus', () => {
    expect(shouldCancelOutsideMatched('inside_campus', makeDate(23, 0))).toBe(false);
  });

  it('getCountdown produces valid time components', () => {
    const target = new Date(Date.now() + 90 * 1000); // 1.5 min from now
    const cd = getCountdown(target, new Date());
    expect(cd.totalSeconds).toBeLessThanOrEqual(90);
    expect(cd.totalSeconds).toBeGreaterThan(80);
    expect(cd.hours).toBe(0);
    expect(cd.minutes).toBe(1);
  });
});
