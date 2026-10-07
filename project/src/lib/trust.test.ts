import { describe, it, expect } from 'vitest';
import {
  computeSafetyIndex,
  computeBadge,
  trustAfterCompleted,
  trustAfterNoShow,
  isMatchingLocked,
} from './trust';
import { DEFAULT_CONFIG } from './types';
import type { Profile } from './types';

describe('trust and safety index', () => {
  it('completed journey gives +15 trust', () => {
    expect(trustAfterCompleted(50)).toBe(65);
    expect(trustAfterCompleted(0)).toBe(15);
  });

  it('no-show gives -30 trust (clamped at 0)', () => {
    expect(trustAfterNoShow(50)).toBe(20);
    expect(trustAfterNoShow(10)).toBe(0);
    expect(trustAfterNoShow(30)).toBe(0);
  });

  it('safety index = (completedWalks/totalRequests) * avgRating * 20 - penalties', () => {
    // 10 walks, 20 requests, 4.5 rating, 1 no-show
    const idx = computeSafetyIndex(10, 20, 4.5, 1);
    const expected = (10 / 20) * 4.5 * 20 - 10; // 45 - 10 = 35
    expect(idx).toBeCloseTo(35, 0);
  });

  it('safety index is clamped to 0-100', () => {
    const highIdx = computeSafetyIndex(100, 100, 5.0, 0);
    expect(highIdx).toBeLessThanOrEqual(100);

    const lowIdx = computeSafetyIndex(0, 10, 1.0, 10);
    expect(lowIdx).toBeGreaterThanOrEqual(0);
  });

  it('safety index is 0 when no requests', () => {
    expect(computeSafetyIndex(0, 0, 0, 0)).toBe(0);
  });

  it('badge is bronze by default', () => {
    expect(computeBadge(30, 1)).toBe('bronze');
  });

  it('badge is silver at index >= 60 and >= 3 walks', () => {
    expect(computeBadge(60, 3)).toBe('silver');
    expect(computeBadge(59, 3)).toBe('bronze');
    expect(computeBadge(60, 2)).toBe('bronze');
  });

  it('badge is gold at index >= 80 and >= 8 walks', () => {
    expect(computeBadge(80, 8)).toBe('gold');
    expect(computeBadge(79, 8)).toBe('silver');
    expect(computeBadge(80, 7)).toBe('silver');
  });

  it('matching is locked when account is not active', () => {
    const p: Profile = {
      ...{} as Profile,
      account_state: 'pending',
      profile_completeness: 100,
    } as Profile;
    const result = isMatchingLocked(p);
    expect(result.locked).toBe(true);
  });

  it('matching is locked when profile is incomplete', () => {
    const p: Profile = {
      ...{} as Profile,
      account_state: 'active',
      profile_completeness: 70,
    } as Profile;
    const result = isMatchingLocked(p);
    expect(result.locked).toBe(true);
  });

  it('matching is unlocked when active and complete', () => {
    const p: Profile = {
      ...{} as Profile,
      account_state: 'active',
      profile_completeness: 100,
    } as Profile;
    const result = isMatchingLocked(p);
    expect(result.locked).toBe(false);
  });

  it('matching is locked when suspended', () => {
    const p: Profile = {
      ...{} as Profile,
      account_state: 'active',
      profile_completeness: 100,
      suspended_until: new Date(Date.now() + 3600000).toISOString(),
    } as Profile;
    const result = isMatchingLocked(p);
    expect(result.locked).toBe(true);
  });
});
