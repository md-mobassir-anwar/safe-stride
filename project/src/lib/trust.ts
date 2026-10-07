import type { AppConfig, BadgeLevel, Profile } from './types';
import { DEFAULT_CONFIG } from './types';

export function computeSafetyIndex(
  completedWalks: number,
  totalRequests: number,
  avgRating: number,
  noShowsInWindow: number,
  config: AppConfig = DEFAULT_CONFIG
): number {
  if (totalRequests === 0) return 0;
  const ratio = completedWalks / totalRequests;
  const base = ratio * avgRating * 20;
  const penalties = noShowsInWindow * config.index_penalty_per_noshow;
  return Math.max(0, Math.min(100, base - penalties));
}

export function computeBadge(
  safetyIndex: number,
  completedWalks: number,
  config: AppConfig = DEFAULT_CONFIG
): BadgeLevel {
  if (safetyIndex >= config.badge_gold_index && completedWalks >= config.badge_gold_walks) {
    return 'gold';
  }
  if (safetyIndex >= config.badge_silver_index && completedWalks >= config.badge_silver_walks) {
    return 'silver';
  }
  return 'bronze';
}

export function trustAfterCompleted(currentTrust: number, config: AppConfig = DEFAULT_CONFIG): number {
  return currentTrust + config.trust_completed;
}

export function trustAfterNoShow(currentTrust: number, config: AppConfig = DEFAULT_CONFIG): number {
  return Math.max(0, currentTrust + config.trust_noshow);
}

export function profileCompletenessPct(profile: Partial<Profile>): number {
  let pct = 0;
  if (profile.photo_url) pct += 20;
  if (profile.department) pct += 15;
  if (profile.year) pct += 10;
  if (profile.hostel) pct += 15;
  if (profile.phone) pct += 10;
  // Emergency contacts add 30% but are checked separately
  return Math.min(70, pct);
}

export function isMatchingLocked(profile: Profile): { locked: boolean; reason: string } {
  if (profile.account_state !== 'active') {
    return { locked: true, reason: 'Your account is not yet active. Verification is pending.' };
  }
  if (profile.suspended_until && new Date(profile.suspended_until) > new Date()) {
    return { locked: true, reason: 'Your account is temporarily suspended due to a no-show.' };
  }
  if (profile.profile_completeness < 100) {
    return { locked: true, reason: 'Complete your profile (photo, department, year, hostel, and at least one emergency contact) to start matching.' };
  }
  return { locked: false, reason: '' };
}

export function formatSafetyIndexBreakdown(
  completedWalks: number,
  totalRequests: number,
  avgRating: number,
  noShowsInWindow: number,
  config: AppConfig = DEFAULT_CONFIG
): { formula: string; components: Array<{ label: string; value: string }> } {
  const ratio = totalRequests > 0 ? (completedWalks / totalRequests).toFixed(3) : '0';
  const base = totalRequests > 0 ? (parseFloat(ratio) * avgRating * 20).toFixed(1) : '0';
  const penalties = (noShowsInWindow * config.index_penalty_per_noshow).toFixed(0);

  return {
    formula: `(completedWalks / totalRequests) × avgRating × 20 − penalties`,
    components: [
      { label: 'Completed walks', value: `${completedWalks}` },
      { label: 'Total requests', value: `${totalRequests}` },
      { label: 'Ratio', value: ratio },
      { label: 'Avg rating', value: avgRating.toFixed(2) },
      { label: 'Base score', value: base },
      { label: 'No-show penalties (90d)', value: `-${penalties}` },
      { label: 'Final index', value: computeSafetyIndex(completedWalks, totalRequests, avgRating, noShowsInWindow, config).toFixed(1) },
    ],
  };
}
