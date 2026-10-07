import { describe, it, expect } from 'vitest';
import { checkNoShow, computeSuspensionUntil } from './noshow';
import { DEFAULT_CONFIG } from './types';

function makeDate(offsetMin: number): Date {
  return new Date(Date.now() + offsetMin * 60000);
}

describe('no-show detection', () => {
  it('is not no-show if user cancelled before departure', () => {
    const result = checkNoShow({
      journeyId: 'j1',
      departureTime: makeDate(-5),
      isReady: false,
      cancelledAt: makeDate(-10),
      now: makeDate(0),
    });
    expect(result.isNoShow).toBe(false);
  });

  it('is not no-show if user marked ready', () => {
    const result = checkNoShow({
      journeyId: 'j1',
      departureTime: makeDate(-5),
      isReady: true,
      cancelledAt: null,
      now: makeDate(0),
    });
    expect(result.isNoShow).toBe(false);
  });

  it('is no-show after departure + grace period (10 min)', () => {
    const result = checkNoShow({
      journeyId: 'j1',
      departureTime: makeDate(-15), // 15 min ago, grace is 10
      isReady: false,
      cancelledAt: null,
      now: makeDate(0),
    });
    expect(result.isNoShow).toBe(true);
  });

  it('is not no-show within grace period', () => {
    const result = checkNoShow({
      journeyId: 'j1',
      departureTime: makeDate(-5), // 5 min ago, grace is 10
      isReady: false,
      cancelledAt: null,
      now: makeDate(0),
    });
    expect(result.isNoShow).toBe(false);
  });

  it('is no-show exactly at grace boundary', () => {
    const departure = makeDate(-10);
    const result = checkNoShow({
      journeyId: 'j1',
      departureTime: departure,
      isReady: false,
      cancelledAt: null,
      now: makeDate(0),
      config: { ...DEFAULT_CONFIG, noshow_grace_minutes: 10 },
    });
    expect(result.isNoShow).toBe(true);
  });

  it('suspension is 24 hours from now', () => {
    const now = new Date();
    const until = computeSuspensionUntil(now);
    const diffMs = until.getTime() - now.getTime();
    expect(diffMs).toBeCloseTo(24 * 60 * 60 * 1000, -100);
  });
});
