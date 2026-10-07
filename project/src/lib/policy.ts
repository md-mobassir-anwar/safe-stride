import type { AppConfig, TravelMode } from './types';
import { DEFAULT_CONFIG } from './types';

export interface PolicyResult {
  allowed: boolean;
  reason: string;
  nextChange: Date;
  nextChangeLabel: string;
  isLocked: boolean;
}

export function checkPolicy(
  mode: TravelMode,
  departureTime: Date,
  config: AppConfig = DEFAULT_CONFIG,
  now: Date = new Date()
): PolicyResult {
  if (mode === 'inside_campus') {
    return {
      allowed: true,
      reason: 'Inside campus mode is available 24/7.',
      nextChange: getNextChange(now, config),
      nextChangeLabel: 'Outside campus opens at',
      isLocked: false,
    };
  }

  const hour = departureTime.getHours();
  const openHour = config.outside_open_hour;
  const closeHour = config.outside_close_hour;

  const isWithinWindow = hour >= openHour && hour < closeHour;

  if (isWithinWindow) {
    const nextClose = new Date(departureTime);
    nextClose.setHours(closeHour, 0, 0, 0);
    if (nextClose <= departureTime) {
      nextClose.setDate(nextClose.getDate() + 1);
    }
    return {
      allowed: true,
      reason: `Outside campus mode is open (06:00–19:00 IST).`,
      nextChange: nextClose,
      nextChangeLabel: 'Outside campus locks at',
      isLocked: false,
    };
  }

  // Locked: find next opening time
  const nextOpen = new Date(now);
  nextOpen.setHours(openHour, 0, 0, 0);
  if (nextOpen <= now) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }

  return {
    allowed: false,
    reason: `Outside campus mode is locked (19:00–06:00 IST). Departures resume at 06:00.`,
    nextChange: nextOpen,
    nextChangeLabel: 'Outside campus unlocks at',
    isLocked: true,
  };
}

function getNextChange(now: Date, config: AppConfig): Date {
  const hour = now.getHours();
  if (hour < config.outside_open_hour) {
    const next = new Date(now);
    next.setHours(config.outside_open_hour, 0, 0, 0);
    return next;
  } else if (hour < config.outside_close_hour) {
    const next = new Date(now);
    next.setHours(config.outside_close_hour, 0, 0, 0);
    return next;
  } else {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(config.outside_open_hour, 0, 0, 0);
    return next;
  }
}

export function getCountdown(target: Date, now: Date = new Date()): {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  label: string;
} {
  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours,
    minutes,
    seconds,
    totalSeconds,
    label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}

export function shouldCancelOutsideMatched(
  mode: TravelMode,
  departureTime: Date,
  config: AppConfig = DEFAULT_CONFIG,
  now: Date = new Date()
): boolean {
  if (mode !== 'outside_campus') return false;
  const hour = departureTime.getHours();
  return hour >= config.outside_close_hour || hour < config.outside_open_hour;
}
