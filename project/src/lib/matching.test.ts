import { describe, it, expect } from 'vitest';
import { findMatches, benchmarkMatch, computeCorridorOverlap } from './matching';
import type { JourneyRequest, Profile, AppConfig } from './types';
import { DEFAULT_CONFIG } from './types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    institution_id: 'inst-1',
    scholar_id: 'SCH001',
    full_name: 'Test User',
    email: 'test@manit.ac.in',
    role: 'student_staff',
    account_state: 'active',
    badge: 'bronze',
    trust_points: 50,
    safety_index: 50,
    completed_walks: 5,
    total_requests: 10,
    avg_rating: 4.0,
    no_show_count: 0,
    is_demo: false,
    profile_completeness: 100,
    silent_shake: true,
    silent_voice: false,
    silent_taps: true,
    silent_keyboard: false,
    silent_trigger_url: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<JourneyRequest> = {}): JourneyRequest {
  const baseRoute = [
    { lat: 23.215, lng: 77.403 },
    { lat: 23.216, lng: 77.407 },
    { lat: 23.217, lng: 77.409 },
  ];
  return {
    id: 'req-1',
    institution_id: 'inst-1',
    user_id: 'user-1',
    mode: 'inside_campus',
    origin_label: 'Hostel',
    origin_lat: 23.215,
    origin_lng: 77.403,
    dest_label: 'Library',
    dest_lat: 23.217,
    dest_lng: 77.409,
    departure_time: new Date(Date.now() + 15 * 60000).toISOString(),
    route_geo: baseRoute,
    is_group: false,
    group_max: 5,
    status: 'open',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('matching engine', () => {
  it('excludes self from results', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me' });
    const otherProfile = makeProfile({ id: 'other', full_name: 'Other Person' });
    const otherReq = makeRequest({ id: 'req-other', user_id: 'other' });

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates: [
        { request: otherReq, profile: otherProfile },
        { request: myReq, profile: myProfile }, // self
      ],
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    expect(results.find(r => r.userId === 'me')).toBeUndefined();
  });

  it('excludes blocked users', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me' });
    const blockedProfile = makeProfile({ id: 'blocked', full_name: 'Blocked User' });
    const blockedReq = makeRequest({ id: 'req-blocked', user_id: 'blocked' });

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates: [{ request: blockedReq, profile: blockedProfile }],
      blockedUserIds: new Set(['blocked']),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    expect(results.find(r => r.userId === 'blocked')).toBeUndefined();
  });

  it('excludes inactive users', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me' });
    const inactiveProfile = makeProfile({ id: 'inactive', account_state: 'suspended' });
    const inactiveReq = makeRequest({ id: 'req-inactive', user_id: 'inactive' });

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates: [{ request: inactiveReq, profile: inactiveProfile }],
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    expect(results.find(r => r.userId === 'inactive')).toBeUndefined();
  });

  it('excludes users with different mode', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me', mode: 'inside_campus' });
    const otherProfile = makeProfile({ id: 'other' });
    const otherReq = makeRequest({ id: 'req-other', user_id: 'other', mode: 'outside_campus' });

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates: [{ request: otherReq, profile: otherProfile }],
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    expect(results.find(r => r.userId === 'other')).toBeUndefined();
  });

  it('excludes users outside timing tolerance', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({
      user_id: 'me',
      departure_time: new Date(Date.now() + 15 * 60000).toISOString(),
    });
    const otherProfile = makeProfile({ id: 'other' });
    const otherReq = makeRequest({
      id: 'req-other',
      user_id: 'other',
      departure_time: new Date(Date.now() + 40 * 60000).toISOString(), // 25 min diff > 10 tolerance
    });

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates: [{ request: otherReq, profile: otherProfile }],
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    expect(results.find(r => r.userId === 'other')).toBeUndefined();
  });

  it('excludes users already in active journeys', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me' });
    const busyProfile = makeProfile({ id: 'busy' });
    const busyReq = makeRequest({ id: 'req-busy', user_id: 'busy' });

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates: [{ request: busyReq, profile: busyProfile }],
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(['busy']),
      config: DEFAULT_CONFIG,
    });

    expect(results.find(r => r.userId === 'busy')).toBeUndefined();
  });

  it('returns results sorted by score descending', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me' });

    const candidates = [];
    for (let i = 0; i < 10; i++) {
      const p = makeProfile({
        id: `cand-${i}`,
        full_name: `Cand${i}`,
        avg_rating: 3 + (i % 20) / 10,
        completed_walks: i % 12,
        badge: i % 3 === 0 ? 'gold' : i % 2 === 0 ? 'silver' : 'bronze',
        trust_points: 40 + i * 5,
      });
      const r = makeRequest({
        id: `req-${i}`,
        user_id: `cand-${i}`,
        departure_time: new Date(Date.now() + (15 + (i % 5)) * 60000).toISOString(),
      });
      candidates.push({ request: r, profile: p });
    }

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates,
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('limits to max_results', () => {
    const myProfile = makeProfile({ id: 'me' });
    const myReq = makeRequest({ user_id: 'me' });

    const candidates = [];
    for (let i = 0; i < 20; i++) {
      const p = makeProfile({ id: `cand-${i}`, full_name: `Cand${i}` });
      const r = makeRequest({ id: `req-${i}`, user_id: `cand-${i}` });
      candidates.push({ request: r, profile: p });
    }

    const results = findMatches({
      myRequest: myReq,
      myProfile,
      candidates,
      blockedUserIds: new Set(),
      activeJourneyUserIds: new Set(),
      config: DEFAULT_CONFIG,
    });

    expect(results.length).toBeLessThanOrEqual(DEFAULT_CONFIG.max_results);
  });

  it('corridor overlap returns high value for identical routes', () => {
    const route = [
      { lat: 23.215, lng: 77.403 },
      { lat: 23.216, lng: 77.407 },
      { lat: 23.217, lng: 77.409 },
    ];
    const overlap = computeCorridorOverlap(route, route, 40);
    expect(overlap).toBeGreaterThan(90);
  });

  it('corridor overlap returns low value for divergent routes', () => {
    const routeA = [
      { lat: 23.215, lng: 77.403 },
      { lat: 23.216, lng: 77.407 },
      { lat: 23.217, lng: 77.409 },
    ];
    const routeB = [
      { lat: 23.220, lng: 77.420 },
      { lat: 23.225, lng: 77.425 },
      { lat: 23.230, lng: 77.430 },
    ];
    const overlap = computeCorridorOverlap(routeA, routeB, 40);
    expect(overlap).toBeLessThan(60);
  });

  it('benchmark completes in under 500ms with 60 users and 50 requests', () => {
    const result = benchmarkMatch(60, 50, DEFAULT_CONFIG);
    expect(result.durationMs).toBeLessThan(500);
  });
});
