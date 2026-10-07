export type UserRole = 'student_staff' | 'security' | 'admin';
export type AccountState = 'pending' | 'active' | 'suspended' | 'rejected';
export type TravelMode = 'inside_campus' | 'outside_campus';
export type JourneyState = 'requested' | 'invited' | 'matched' | 'ready' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type SosStatus = 'active' | 'acknowledged' | 'dispatched' | 'resolved';
export type BadgeLevel = 'bronze' | 'silver' | 'gold';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoutePoint extends LatLng {}

export interface Place {
  id: string;
  institution_id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  is_gateway: boolean;
  sort_order: number;
}

export interface CampusEdge {
  id: string;
  from_place_id: string;
  to_place_id: string;
  waypoints: LatLng[];
  distance_m: number;
}

export interface SavedDestination {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Profile {
  id: string;
  institution_id: string;
  scholar_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  account_state: AccountState;
  rejection_reason?: string;
  department?: string;
  year?: string;
  hostel?: string;
  badge: BadgeLevel;
  trust_points: number;
  safety_index: number;
  completed_walks: number;
  total_requests: number;
  avg_rating: number;
  no_show_count: number;
  is_demo: boolean;
  photo_url?: string;
  id_card_url?: string;
  profile_completeness: number;
  suspended_until?: string;
  silent_shake: boolean;
  silent_voice: boolean;
  silent_taps: boolean;
  silent_keyboard: boolean;
  silent_trigger_url: boolean;
  trigger_token?: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContact {
  id: string;
  profile_id: string;
  name: string;
  phone: string;
  relationship?: string;
}

export interface JourneyRequest {
  id: string;
  institution_id: string;
  user_id: string;
  mode: TravelMode;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  departure_time: string;
  route_geo: LatLng[];
  is_group: boolean;
  group_max: number;
  status: string;
  created_at: string;
}

export interface Journey {
  id: string;
  institution_id: string;
  request_id: string;
  state: JourneyState;
  is_group: boolean;
  departure_time: string;
  route_geo: LatLng[];
  sync_countdown_started_at?: string;
  in_progress_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  cancel_reason?: string;
  created_at: string;
}

export interface JourneyParticipant {
  id: string;
  journey_id: string;
  user_id: string;
  is_ready: boolean;
  ready_at?: string;
  arrived: boolean;
  arrived_at?: string;
  no_show: boolean;
  trust_delta: number;
}

export interface MatchCandidate {
  requestId: string;
  userId: string;
  firstName: string;
  department: string;
  year: string;
  rating: number;
  badge: BadgeLevel;
  overlapPct: number;
  departsInMin: number;
  score: number;
  profileCompleteness: number;
  completedWalks: number;
}

export interface Rating {
  id: string;
  journey_id: string;
  rater_id: string;
  ratee_id: string;
  stars: number;
  tags?: string[];
  comment?: string;
  created_at: string;
}

export interface SosEvent {
  id: string;
  institution_id: string;
  user_id: string;
  status: SosStatus;
  lat: number;
  lng: number;
  tracking_token: string;
  journey_id?: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  dispatched_at?: string;
  resolved_at?: string;
  resolve_notes?: string;
  is_test: boolean;
  silent: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface AppConfig {
  timing_tolerance_minutes: number;
  timing_full_score_minutes: number;
  corridor_buffer_meters: number;
  corridor_min_overlap_pct: number;
  score_weight_timing: number;
  score_weight_overlap: number;
  score_weight_trust: number;
  max_results: number;
  trust_initial: number;
  trust_completed: number;
  trust_noshow: number;
  noshow_grace_minutes: number;
  noshow_suspend_hours: number;
  index_penalty_per_noshow: number;
  index_noshow_window_days: number;
  badge_silver_index: number;
  badge_silver_walks: number;
  badge_gold_index: number;
  badge_gold_walks: number;
  outside_open_hour: number;
  outside_close_hour: number;
  location_retention_days: number;
  sos_tracking_expiry_hours: number;
  sos_stream_interval_seconds: number;
  journey_ping_interval_seconds: number;
  deviation_threshold_meters: number;
  deviation_response_seconds: number;
  sync_countdown_seconds: number;
  webhook_url: string;
  webhook_secret: string;
  group_walk_max: number;
  group_walk_min: number;
  erp_mode: string;
  sms_mode: string;
  push_mode: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  timing_tolerance_minutes: 10,
  timing_full_score_minutes: 3,
  corridor_buffer_meters: 40,
  corridor_min_overlap_pct: 60,
  score_weight_timing: 0.40,
  score_weight_overlap: 0.40,
  score_weight_trust: 0.20,
  max_results: 5,
  trust_initial: 50,
  trust_completed: 15,
  trust_noshow: -30,
  noshow_grace_minutes: 10,
  noshow_suspend_hours: 24,
  index_penalty_per_noshow: 10,
  index_noshow_window_days: 90,
  badge_silver_index: 60,
  badge_silver_walks: 3,
  badge_gold_index: 80,
  badge_gold_walks: 8,
  outside_open_hour: 6,
  outside_close_hour: 19,
  location_retention_days: 30,
  sos_tracking_expiry_hours: 2,
  sos_stream_interval_seconds: 4,
  journey_ping_interval_seconds: 5,
  deviation_threshold_meters: 100,
  deviation_response_seconds: 30,
  sync_countdown_seconds: 10,
  webhook_url: 'https://example.com/webhook',
  webhook_secret: 'safestride-hmac-secret-change-me',
  group_walk_max: 5,
  group_walk_min: 2,
  erp_mode: 'roster',
  sms_mode: 'fallback',
  push_mode: 'fallback',
};

export interface ErpRosterEntry {
  scholar_id: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  email: string;
  department?: string;
  year?: string;
  role?: string;
}
