import type { AppConfig } from './types';
import { DEFAULT_CONFIG } from './types';

export interface NoShowCheckInput {
  journeyId: string;
  departureTime: Date;
  isReady: boolean;
  cancelledAt: Date | null;
  now?: Date;
  config?: AppConfig;
}

export interface NoShowResult {
  isNoShow: boolean;
  reason: string;
}

export function checkNoShow(input: NoShowCheckInput): NoShowResult {
  const { journeyId, departureTime, isReady, cancelledAt, config = DEFAULT_CONFIG } = input;
  const now = input.now ?? new Date();

  if (cancelledAt) {
    return { isNoShow: false, reason: 'Journey was cancelled before departure.' };
  }

  if (isReady) {
    return { isNoShow: false, reason: 'Participant marked as ready.' };
  }

  const gracePeriodMs = config.noshow_grace_minutes * 60 * 1000;
  const deadline = new Date(departureTime.getTime() + gracePeriodMs);

  if (now >= deadline) {
    return {
      isNoShow: true,
      reason: `Participant did not tap "I'm ready" by departure + ${config.noshow_grace_minutes} min grace.`,
    };
  }

  return {
    isNoShow: false,
    reason: `Grace period has not elapsed (deadline: ${deadline.toISOString()}).`,
  };
}

export function computeSuspensionUntil(
  now: Date = new Date(),
  config: AppConfig = DEFAULT_CONFIG
): Date {
  return new Date(now.getTime() + config.noshow_suspend_hours * 60 * 60 * 1000);
}
