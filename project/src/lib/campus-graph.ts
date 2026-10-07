import type { LatLng, Place, CampusEdge } from './types';

export interface CampusGraph {
  places: Map<string, Place>;
  adjacency: Map<string, Array<{ to: string; distance: number; waypoints: LatLng[] }>>;
}

export function buildGraph(places: Place[], edges: CampusEdge[]): CampusGraph {
  const placeMap = new Map<string, Place>();
  for (const p of places) {
    placeMap.set(p.id, p);
  }

  const adjacency = new Map<string, Array<{ to: string; distance: number; waypoints: LatLng[] }>>();
  for (const e of edges) {
    if (!adjacency.has(e.from_place_id)) adjacency.set(e.from_place_id, []);
    if (!adjacency.has(e.to_place_id)) adjacency.set(e.to_place_id, []);
    adjacency.get(e.from_place_id)!.push({ to: e.to_place_id, distance: e.distance_m, waypoints: e.waypoints });
    adjacency.get(e.to_place_id)!.push({ to: e.from_place_id, distance: e.distance_m, waypoints: [...e.waypoints].reverse() });
  }

  return { places: placeMap, adjacency };
}

export interface DijkstraResult {
  path: string[];
  polyline: LatLng[];
  totalDistance: number;
}

export function dijkstra(graph: CampusGraph, startId: string, endId: string): DijkstraResult | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const id of graph.places.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  dist.set(startId, 0);

  while (visited.size < graph.places.size) {
    let current: string | null = null;
    let minDist = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < minDist) {
        minDist = d;
        current = id;
      }
    }
    if (current === null || minDist === Infinity) break;
    if (current === endId) break;

    visited.add(current);
    const neighbors = graph.adjacency.get(current) || [];
    for (const { to, distance } of neighbors) {
      if (visited.has(to)) continue;
      const newDist = (dist.get(current) || 0) + distance;
      if (newDist < (dist.get(to) || Infinity)) {
        dist.set(to, newDist);
        prev.set(to, current);
      }
    }
  }

  if (dist.get(endId) === Infinity) return null;

  const path: string[] = [];
  let curr: string | null = endId;
  while (curr) {
    path.unshift(curr);
    curr = prev.get(curr) || null;
  }

  if (path[0] !== startId) return null;

  const polyline: LatLng[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const from = graph.places.get(path[i])!;
    const to = graph.places.get(path[i + 1])!;
    const edge = (graph.adjacency.get(path[i]) || []).find(e => e.to === path[i + 1]);

    polyline.push({ lat: from.lat, lng: from.lng });
    if (edge && edge.waypoints.length > 0) {
      for (const wp of edge.waypoints) {
        polyline.push(wp);
      }
    }
    if (i === path.length - 2) {
      polyline.push({ lat: to.lat, lng: to.lng });
    }
  }

  if (polyline.length === 0) {
    const from = graph.places.get(startId)!;
    polyline.push({ lat: from.lat, lng: from.lng });
  }

  return {
    path,
    polyline,
    totalDistance: dist.get(endId) || 0,
  };
}

const osrmCache = new Map<string, LatLng[]>();

export function straightLineRoute(origin: LatLng, dest: LatLng): LatLng[] {
  return [
    { lat: origin.lat, lng: origin.lng },
    { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 },
    { lat: dest.lat, lng: dest.lng },
  ];
}

export async function osrmFootRoute(origin: LatLng, dest: LatLng): Promise<LatLng[]> {
  const cacheKey = `${origin.lat},${origin.lng}-${dest.lat},${dest.lng}`;
  if (osrmCache.has(cacheKey)) return osrmCache.get(cacheKey)!;

  const url = `https://router.project-osrm.org/route/v1/foot/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OSRM ${resp.status}`);
    const data = await resp.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!coords || !Array.isArray(coords)) throw new Error('No route geometry');

    const route: LatLng[] = coords.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
    osrmCache.set(cacheKey, route);
    return route;
  } catch {
    const fallback = straightLineRoute(origin, dest);
    osrmCache.set(cacheKey, fallback);
    return fallback;
  }
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pointToLineDistanceMeters(point: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
  // Project point onto line segment, return perpendicular distance
  const x0 = point.lng, y0 = point.lat;
  const x1 = lineStart.lng, y1 = lineStart.lat;
  const x2 = lineEnd.lng, y2 = lineEnd.lat;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineMeters(point, lineStart);

  let t = ((x0 - x1) * dx + (y0 - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = y1 + t * dy;
  const projLng = x1 + t * dx;
  return haversineMeters(point, { lat: projLat, lng: projLng });
}

export function isOffRoute(currentPos: LatLng, route: LatLng[], thresholdMeters: number): boolean {
  if (route.length < 2) return false;
  let minDist = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = pointToLineDistanceMeters(currentPos, route[i], route[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist > thresholdMeters;
}
