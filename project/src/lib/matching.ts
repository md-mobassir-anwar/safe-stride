import * as turf from '@turf/turf';
import type { LatLng, MatchCandidate, AppConfig, JourneyRequest, Profile, BadgeLevel } from './types';
import { DEFAULT_CONFIG } from './types';

export interface MatchInput {
  myRequest: JourneyRequest;
  myProfile: Profile;
  candidates: Array<{
    request: JourneyRequest;
    profile: Profile;
  }>;
  blockedUserIds: Set<string>;
  activeJourneyUserIds: Set<string>;
  config: AppConfig;
}

function firstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName;
}

function timingScore(
  myDeparture: Date,
  theirDeparture: Date,
  config: AppConfig
): { score: number; departsInMin: number } {
  const diffMs = Math.abs(myDeparture.getTime() - theirDeparture.getTime());
  const diffMin = diffMs / 60000;
  const departsInMin = Math.round((theirDeparture.getTime() - Date.now()) / 60000);

  if (diffMin > config.timing_tolerance_minutes) {
    return { score: 0, departsInMin };
  }

  const fullScoreMin = config.timing_full_score_minutes;
  if (diffMin <= fullScoreMin) {
    return { score: 1, departsInMin };
  }

  const score = 1 - (diffMin - fullScoreMin) / (config.timing_tolerance_minutes - fullScoreMin);
  return { score: Math.max(0, score), departsInMin };
}

function corridorOverlap(
  routeA: LatLng[],
  routeB: LatLng[],
  bufferMeters: number
): number {
  if (routeA.length < 2 || routeB.length < 2) return 0;

  try {
    const lineA = turf.lineString(routeA.map(p => [p.lng, p.lat]));
    const lineB = turf.lineString(routeB.map(p => [p.lng, p.lat]));
    const bufferedB = turf.buffer(lineB, bufferMeters / 1000, { units: 'kilometers' });

    if (!bufferedB) return 0;

    const lengthA = turf.length(lineA, { units: 'kilometers' });
    if (lengthA === 0) return 0;

    // Check if lineA is entirely inside bufferB (no intersections = fully inside or fully outside)
    const intersectA = turf.lineIntersect(lineA, bufferedB);
    const startPtA = turf.point(routeA[0] ? [routeA[0].lng, routeA[0].lat] : [0, 0]);
    const startInsideA = turf.booleanPointInPolygon(startPtA, bufferedB);

    let overlapLenA = 0;
    if (intersectA.features.length === 0 && startInsideA) {
      // Entirely inside buffer
      overlapLenA = lengthA;
    } else if (intersectA.features.length > 0) {
      // Split lineA by the buffer polygon and sum overlapping segment lengths
      const withinA = turf.lineSplit(lineA, bufferedB);
      if (withinA && withinA.features.length > 0) {
        for (const seg of withinA.features) {
          if (seg.geometry && seg.geometry.type === 'LineString') {
            const segLen = turf.length(seg, { units: 'kilometers' });
            const midPoint = turf.along(seg, segLen / 2, { units: 'kilometers' });
            if (midPoint && turf.booleanPointInPolygon(midPoint, bufferedB)) {
              overlapLenA += segLen;
            }
          }
        }
      }
    }

    // Do the same in reverse: what fraction of B is within buffer of A
    const lengthB = turf.length(lineB, { units: 'kilometers' });
    if (lengthB === 0) return 0;
    const bufferedA = turf.buffer(lineA, bufferMeters / 1000, { units: 'kilometers' });
    if (!bufferedA) return 0;

    const intersectB = turf.lineIntersect(lineB, bufferedA);
    const startPtB = turf.point(routeB[0] ? [routeB[0].lng, routeB[0].lat] : [0, 0]);
    const startInsideB = turf.booleanPointInPolygon(startPtB, bufferedA);

    let overlapLenB = 0;
    if (intersectB.features.length === 0 && startInsideB) {
      overlapLenB = lengthB;
    } else if (intersectB.features.length > 0) {
      const withinB = turf.lineSplit(lineB, bufferedA);
      if (withinB && withinB.features.length > 0) {
        for (const seg of withinB.features) {
          if (seg.geometry && seg.geometry.type === 'LineString') {
            const segLen = turf.length(seg, { units: 'kilometers' });
            const midPoint = turf.along(seg, segLen / 2, { units: 'kilometers' });
            if (midPoint && turf.booleanPointInPolygon(midPoint, bufferedA)) {
              overlapLenB += segLen;
            }
          }
        }
      }
    }

    const pctA = (overlapLenA / lengthA) * 100;
    const pctB = (overlapLenB / lengthB) * 100;
    return Math.min(pctA, pctB);
  } catch {
    return 0;
  }
}

function trustScore(profile: Profile, config: AppConfig): number {
  const completeness = profile.profile_completeness / 100;
  const ratingScore = profile.avg_rating / 5;
  const walksScore = Math.min(profile.completed_walks / 10, 1);
  const badgeScore: number = profile.badge === 'gold' ? 1 : profile.badge === 'silver' ? 0.7 : 0.4;
  return (completeness * 0.25 + ratingScore * 0.35 + walksScore * 0.2 + badgeScore * 0.2);
}

function priorityBoost(badge: BadgeLevel): number {
  if (badge === 'gold') return 0.05;
  if (badge === 'silver') return 0.03;
  return 0;
}

export function findMatches(input: MatchInput): MatchCandidate[] {
  const { myRequest, myProfile, candidates, blockedUserIds, activeJourneyUserIds, config } = input;
  const myDeparture = new Date(myRequest.departure_time);
  const results: MatchCandidate[] = [];

  for (const { request: theirRequest, profile: theirProfile } of candidates) {
    // Exclude self
    if (theirProfile.id === myProfile.id) continue;

    // Exclude blocked (either direction)
    if (blockedUserIds.has(theirProfile.id)) continue;

    // Exclude suspended or inactive
    if (theirProfile.account_state !== 'active') continue;
    if (theirProfile.suspended_until && new Date(theirProfile.suspended_until) > new Date()) continue;

    // Exclude users already in an active journey in an overlapping window
    if (activeJourneyUserIds.has(theirProfile.id)) continue;

    // Same mode
    if (theirRequest.mode !== myRequest.mode) continue;

    // Filter 1: Timing
    const { score: tScore, departsInMin } = timingScore(
      myDeparture,
      new Date(theirRequest.departure_time),
      config
    );
    if (tScore <= 0) continue;

    // Filter 2: Corridor overlap
    const overlap = corridorOverlap(
      myRequest.route_geo,
      theirRequest.route_geo,
      config.corridor_buffer_meters
    );
    if (overlap < config.corridor_min_overlap_pct) continue;

    // Filter 3: Trust
    const tTrust = trustScore(theirProfile, config);

    // Final score
    const rawScore =
      config.score_weight_timing * tScore +
      config.score_weight_overlap * (overlap / 100) +
      config.score_weight_trust * tTrust;

    const boostedScore = Math.min(1, rawScore + priorityBoost(theirProfile.badge));

    results.push({
      requestId: theirRequest.id,
      userId: theirProfile.id,
      firstName: firstName(theirProfile.full_name),
      department: theirProfile.department || '',
      year: theirProfile.year || '',
      rating: theirProfile.avg_rating,
      badge: theirProfile.badge,
      overlapPct: Math.round(overlap),
      departsInMin,
      score: Math.round(boostedScore * 1000) / 1000,
      profileCompleteness: theirProfile.profile_completeness,
      completedWalks: theirProfile.completed_walks,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, config.max_results);
}

export function computeCorridorOverlap(routeA: LatLng[], routeB: LatLng[], bufferMeters: number): number {
  return corridorOverlap(routeA, routeB, bufferMeters);
}

export { timingScore, trustScore };

export function benchmarkMatch(
  userCount: number,
  openRequestCount: number,
  config: AppConfig = DEFAULT_CONFIG
): { durationMs: number; resultCount: number } {
  const baseLat = 23.216;
  const baseLng = 77.407;

  const profiles: Profile[] = [];
  const requests: Array<{ request: JourneyRequest; profile: Profile }> = [];

  for (let i = 0; i < userCount; i++) {
    const p: Profile = {
      id: `bench-user-${i}`,
      institution_id: 'inst-1',
      scholar_id: `SCH${i}`,
      full_name: `User${i} Lastname`,
      email: `user${i}@manit.ac.in`,
      role: 'student_staff',
      account_state: 'active',
      badge: i % 10 === 0 ? 'gold' : i % 5 === 0 ? 'silver' : 'bronze',
      trust_points: 50 + (i % 50),
      safety_index: 50 + (i % 50),
      completed_walks: i % 12,
      total_requests: i % 20,
      avg_rating: 3 + (i % 20) / 10,
      no_show_count: i % 3,
      is_demo: true,
      profile_completeness: 80 + (i % 20),
      silent_shake: true,
      silent_voice: false,
      silent_taps: true,
      silent_keyboard: false,
      silent_trigger_url: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    profiles.push(p);
  }

  const now = Date.now();
  for (let i = 0; i < openRequestCount; i++) {
    const profile = profiles[i % userCount];
    const offset = (i % 20) - 10;
    const depTime = new Date(now + offset * 60000);
    const lat1 = baseLat + (Math.random() - 0.5) * 0.002;
    const lng1 = baseLng + (Math.random() - 0.5) * 0.002;
    const lat2 = baseLat + (Math.random() - 0.5) * 0.002;
    const lng2 = baseLng + (Math.random() - 0.5) * 0.002;

    const route: LatLng[] = [
      { lat: lat1, lng: lng1 },
      { lat: (lat1 + lat2) / 2, lng: (lng1 + lng2) / 2 },
      { lat: lat2, lng: lng2 },
    ];

    requests.push({
      request: {
        id: `req-${i}`,
        institution_id: 'inst-1',
        user_id: profile.id,
        mode: 'inside_campus',
        origin_label: 'Origin',
        origin_lat: lat1,
        origin_lng: lng1,
        dest_label: 'Destination',
        dest_lat: lat2,
        dest_lng: lng2,
        departure_time: depTime.toISOString(),
        route_geo: route,
        is_group: false,
        group_max: 5,
        status: 'open',
        created_at: new Date().toISOString(),
      },
      profile,
    });
  }

  const myProfile = profiles[0];
  const myRequest = requests[0].request;

  const start = performance.now();
  const results = findMatches({
    myRequest,
    myProfile,
    candidates: requests.slice(1).map(r => ({ request: r.request, profile: r.profile })),
    blockedUserIds: new Set<string>(),
    activeJourneyUserIds: new Set<string>(),
    config,
  });
  const duration = performance.now() - start;

  return { durationMs: duration, resultCount: results.length };
}
