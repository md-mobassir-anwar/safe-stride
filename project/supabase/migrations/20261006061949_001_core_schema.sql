/*
# SafeStride Core Schema

Creates the foundational tables for the SafeStride safety companion app:
institutions, config, ERP roster, campus places/edges, profiles, emergency contacts,
journey requests, invitations, journeys, location pings, ratings, blocks, reports,
SOS events, delivery logs, notifications, verification documents, audits.

All tables carry institution_id for multi-institution support (only MANIT seeded).
RLS enabled on every table. Roles: student_staff, security, admin.
*/

-- ─── EXTENSIONS ───
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ───
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student_staff','security','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_state AS ENUM ('pending','active','suspended','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE travel_mode AS ENUM ('inside_campus','outside_campus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE journey_state AS ENUM ('requested','invited','matched','ready','in_progress','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sos_status AS ENUM ('active','acknowledged','dispatched','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE badge_level AS ENUM ('bronze','silver','gold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── INSTITUTIONS ───
CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz DEFAULT now()
);

-- ─── CONFIG (single source of tunable values, per institution) ───
CREATE TABLE IF NOT EXISTS app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, key)
);

-- ─── ERP ROSTER (built-in ERP adapter) ───
CREATE TABLE IF NOT EXISTS erp_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  scholar_id text NOT NULL,
  name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male','female','other')),
  email text NOT NULL,
  department text,
  year text,
  role text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, scholar_id)
);

-- ─── PROFILES (app users) ───
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  scholar_id text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role user_role NOT NULL DEFAULT 'student_staff',
  account_state account_state NOT NULL DEFAULT 'pending',
  rejection_reason text,
  department text,
  year text,
  hostel text,
  badge badge_level NOT NULL DEFAULT 'bronze',
  trust_points int NOT NULL DEFAULT 50,
  safety_index numeric(5,2) NOT NULL DEFAULT 0,
  completed_walks int NOT NULL DEFAULT 0,
  total_requests int NOT NULL DEFAULT 0,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  no_show_count int NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  pin_hash text,
  photo_url text,
  id_card_url text,
  profile_completeness int NOT NULL DEFAULT 0,
  suspended_until timestamptz,
  silent_shake boolean NOT NULL DEFAULT true,
  silent_voice boolean NOT NULL DEFAULT false,
  silent_taps boolean NOT NULL DEFAULT true,
  silent_keyboard boolean NOT NULL DEFAULT false,
  silent_trigger_url boolean NOT NULL DEFAULT false,
  trigger_token text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, scholar_id)
);
CREATE INDEX IF NOT EXISTS idx_profiles_institution ON profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_state ON profiles(account_state);

-- ─── EMERGENCY CONTACTS ───
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  relationship text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_profile ON emergency_contacts(profile_id);

-- ─── CAMPUS PLACES ───
CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  is_gateway boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_places_institution ON places(institution_id);

-- ─── CAMPUS EDGES (path graph) ───
CREATE TABLE IF NOT EXISTS campus_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  from_place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  to_place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  waypoints jsonb NOT NULL DEFAULT '[]',
  distance_m numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campus_edges_from ON campus_edges(from_place_id);
CREATE INDEX IF NOT EXISTS idx_campus_edges_to ON campus_edges(to_place_id);

-- ─── SAVED DESTINATIONS (outside campus) ───
CREATE TABLE IF NOT EXISTS saved_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ─── JOURNEY REQUESTS ───
CREATE TABLE IF NOT EXISTS journey_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode travel_mode NOT NULL,
  origin_label text NOT NULL,
  origin_lat numeric(10,7) NOT NULL,
  origin_lng numeric(10,7) NOT NULL,
  dest_label text NOT NULL,
  dest_lat numeric(10,7) NOT NULL,
  dest_lng numeric(10,7) NOT NULL,
  departure_time timestamptz NOT NULL,
  route_geo jsonb NOT NULL DEFAULT '[]',
  is_group boolean NOT NULL DEFAULT false,
  group_max int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jr_institution ON journey_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_jr_user ON journey_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_jr_status ON journey_requests(status);
CREATE INDEX IF NOT EXISTS idx_jr_mode_time ON journey_requests(mode, departure_time);

-- ─── INVITATIONS ───
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journey_requests(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invitations_to ON invitations(to_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_journey ON invitations(journey_id);

-- ─── JOURNEYS (matched pairs/groups) ───
CREATE TABLE IF NOT EXISTS journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES journey_requests(id) ON DELETE CASCADE,
  state journey_state NOT NULL DEFAULT 'matched',
  is_group boolean NOT NULL DEFAULT false,
  departure_time timestamptz NOT NULL,
  route_geo jsonb NOT NULL DEFAULT '[]',
  sync_countdown_started_at timestamptz,
  in_progress_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES profiles(id),
  cancel_reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_journeys_institution ON journeys(institution_id);
CREATE INDEX IF NOT EXISTS idx_journeys_state ON journeys(state);
CREATE INDEX IF NOT EXISTS idx_journeys_request ON journeys(request_id);

-- ─── JOURNEY PARTICIPANTS ───
CREATE TABLE IF NOT EXISTS journey_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_ready boolean NOT NULL DEFAULT false,
  ready_at timestamptz,
  arrived boolean NOT NULL DEFAULT false,
  arrived_at timestamptz,
  no_show boolean NOT NULL DEFAULT false,
  trust_delta int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(journey_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_jp_journey ON journey_participants(journey_id);
CREATE INDEX IF NOT EXISTS idx_jp_user ON journey_participants(user_id);

-- ─── LOCATION PINGS ───
CREATE TABLE IF NOT EXISTS location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid REFERENCES journeys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  accuracy numeric(8,2),
  source text NOT NULL DEFAULT 'journey',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lp_journey ON location_pings(journey_id);
CREATE INDEX IF NOT EXISTS idx_lp_user_time ON location_pings(user_id, created_at);

-- ─── RATINGS (insert-only) ───
CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stars int NOT NULL CHECK (stars >= 1 AND stars <= 5),
  tags text[],
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(journey_id, rater_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

-- ─── BLOCKS ───
CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);

-- ─── REPORTS ───
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  journey_id uuid REFERENCES journeys(id) ON DELETE SET NULL,
  category text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- ─── SOS EVENTS ───
CREATE TABLE IF NOT EXISTS sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status sos_status NOT NULL DEFAULT 'active',
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  tracking_token text UNIQUE NOT NULL,
  journey_id uuid REFERENCES journeys(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES profiles(id),
  dispatched_at timestamptz,
  resolved_at timestamptz,
  resolve_notes text,
  is_test boolean NOT NULL DEFAULT false,
  silent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_events(status);
CREATE INDEX IF NOT EXISTS idx_sos_user ON sos_events(user_id);

-- ─── SOS LOCATION STREAM ───
CREATE TABLE IF NOT EXISTS sos_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL REFERENCES sos_events(id) ON DELETE CASCADE,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sosloc_event ON sos_locations(sos_event_id);

-- ─── WEBHOOK DELIVERY LOG ───
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL REFERENCES sos_events(id) ON DELETE CASCADE,
  url text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  response_code int,
  response_body text,
  next_retry_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wd_status ON webhook_deliveries(status);

-- ─── NOTIFICATIONS ───
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);

-- ─── AUDIT LOG ───
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_institution ON audit_log(institution_id);

-- ─── VERIFICATION DOCUMENTS ───
CREATE TABLE IF NOT EXISTS verification_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id),
  review_notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vdocs_profile ON verification_docs(profile_id);

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'student_staff'::user_role
  );
$$;

-- Helper: is current user admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Helper: is current user security
CREATE OR REPLACE FUNCTION public.is_security()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'security');
$$;

-- ─── INSTITUTIONS: all authenticated can read ───
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inst_select" ON institutions;
CREATE POLICY "inst_select" ON institutions FOR SELECT TO authenticated USING (true);

-- ─── APP_CONFIG: admin read/write, others read ───
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_select" ON app_config;
CREATE POLICY "config_select" ON app_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "config_insert" ON app_config;
CREATE POLICY "config_insert" ON app_config FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "config_update" ON app_config;
CREATE POLICY "config_update" ON app_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "config_delete" ON app_config;
CREATE POLICY "config_delete" ON app_config FOR DELETE TO authenticated USING (public.is_admin());

-- ─── ERP_ROSTER: admin read/write, others read own scholar ───
ALTER TABLE erp_roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_select" ON erp_roster;
CREATE POLICY "erp_select" ON erp_roster FOR SELECT TO authenticated USING (public.is_admin() OR scholar_id IN (SELECT scholar_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "erp_insert" ON erp_roster;
CREATE POLICY "erp_insert" ON erp_roster FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "erp_update" ON erp_roster;
CREATE POLICY "erp_update" ON erp_roster FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "erp_delete" ON erp_roster;
CREATE POLICY "erp_delete" ON erp_roster FOR DELETE TO authenticated USING (public.is_admin());

-- ─── PROFILES: self read/update, admin all, security read ───
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin() OR public.is_security());
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (public.is_admin());

-- ─── EMERGENCY_CONTACTS: self CRUD, admin/security read ───
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ec_select" ON emergency_contacts;
CREATE POLICY "ec_select" ON emergency_contacts FOR SELECT TO authenticated USING (profile_id = auth.uid() OR public.is_admin() OR public.is_security());
DROP POLICY IF EXISTS "ec_insert" ON emergency_contacts;
CREATE POLICY "ec_insert" ON emergency_contacts FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "ec_update" ON emergency_contacts;
CREATE POLICY "ec_update" ON emergency_contacts FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "ec_delete" ON emergency_contacts;
CREATE POLICY "ec_delete" ON emergency_contacts FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- ─── PLACES: all authenticated read, admin write ───
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "places_select" ON places;
CREATE POLICY "places_select" ON places FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "places_insert" ON places;
CREATE POLICY "places_insert" ON places FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "places_update" ON places;
CREATE POLICY "places_update" ON places FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "places_delete" ON places;
CREATE POLICY "places_delete" ON places FOR DELETE TO authenticated USING (public.is_admin());

-- ─── CAMPUS_EDGES: same as places ───
ALTER TABLE campus_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "edges_select" ON campus_edges;
CREATE POLICY "edges_select" ON campus_edges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "edges_insert" ON campus_edges;
CREATE POLICY "edges_insert" ON campus_edges FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "edges_update" ON campus_edges;
CREATE POLICY "edges_update" ON campus_edges FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "edges_delete" ON campus_edges;
CREATE POLICY "edges_delete" ON campus_edges FOR DELETE TO authenticated USING (public.is_admin());

-- ─── SAVED_DESTINATIONS: all authenticated read, admin write ───
ALTER TABLE saved_destinations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sd_select" ON saved_destinations;
CREATE POLICY "sd_select" ON saved_destinations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sd_insert" ON saved_destinations;
CREATE POLICY "sd_insert" ON saved_destinations FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "sd_update" ON saved_destinations;
CREATE POLICY "sd_update" ON saved_destinations FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "sd_delete" ON saved_destinations;
CREATE POLICY "sd_delete" ON saved_destinations FOR DELETE TO authenticated USING (public.is_admin());

-- ─── JOURNEY_REQUESTS: self CRUD, others read for matching ───
ALTER TABLE journey_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jr_select" ON journey_requests;
CREATE POLICY "jr_select" ON journey_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "jr_insert" ON journey_requests;
CREATE POLICY "jr_insert" ON journey_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "jr_update" ON journey_requests;
CREATE POLICY "jr_update" ON journey_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "jr_delete" ON journey_requests;
CREATE POLICY "jr_delete" ON journey_requests FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ─── INVITATIONS: self read/update, insert by involved users ───
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_select" ON invitations;
CREATE POLICY "inv_select" ON invitations FOR SELECT TO authenticated USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "inv_insert" ON invitations;
CREATE POLICY "inv_insert" ON invitations FOR INSERT TO authenticated WITH CHECK (from_user_id = auth.uid());
DROP POLICY IF EXISTS "inv_update" ON invitations;
CREATE POLICY "inv_update" ON invitations FOR UPDATE TO authenticated USING (to_user_id = auth.uid() OR from_user_id = auth.uid()) WITH CHECK (to_user_id = auth.uid() OR from_user_id = auth.uid());

-- ─── JOURNEYS: participants + admin + security read ───
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "j_select" ON journeys;
CREATE POLICY "j_select" ON journeys FOR SELECT TO authenticated USING (
  public.is_admin() OR public.is_security() OR
  EXISTS (SELECT 1 FROM journey_participants jp WHERE jp.journey_id = journeys.id AND jp.user_id = auth.uid())
);
DROP POLICY IF EXISTS "j_insert" ON journeys;
CREATE POLICY "j_insert" ON journeys FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM journey_requests jr WHERE jr.id = request_id AND (jr.user_id = auth.uid()))
);
DROP POLICY IF EXISTS "j_update" ON journeys;
CREATE POLICY "j_update" ON journeys FOR UPDATE TO authenticated USING (
  public.is_admin() OR
  EXISTS (SELECT 1 FROM journey_participants jp WHERE jp.journey_id = journeys.id AND jp.user_id = auth.uid())
) WITH CHECK (true);

-- ─── JOURNEY_PARTICIPANTS: self + journey peers + admin read ───
ALTER TABLE journey_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jp_select" ON journey_participants;
CREATE POLICY "jp_select" ON journey_participants FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_admin() OR public.is_security() OR
  EXISTS (SELECT 1 FROM journey_participants jp2 WHERE jp2.journey_id = journey_participants.journey_id AND jp2.user_id = auth.uid())
);
DROP POLICY IF EXISTS "jp_insert" ON journey_participants;
CREATE POLICY "jp_insert" ON journey_participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "jp_update" ON journey_participants;
CREATE POLICY "jp_update" ON journey_participants FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ─── LOCATION_PINGS: journey participants read, self insert ───
ALTER TABLE location_pings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lp_select" ON location_pings;
CREATE POLICY "lp_select" ON location_pings FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_admin() OR public.is_security() OR
  EXISTS (SELECT 1 FROM journey_participants jp WHERE jp.journey_id = location_pings.journey_id AND jp.user_id = auth.uid())
);
DROP POLICY IF EXISTS "lp_insert" ON location_pings;
CREATE POLICY "lp_insert" ON location_pings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ─── RATINGS: self read (as rater or ratee), insert by rater, NO update/delete ───
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ratings_select" ON ratings;
CREATE POLICY "ratings_select" ON ratings FOR SELECT TO authenticated USING (rater_id = auth.uid() OR ratee_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "ratings_insert" ON ratings;
CREATE POLICY "ratings_insert" ON ratings FOR INSERT TO authenticated WITH CHECK (rater_id = auth.uid());

-- ─── USER_BLOCKS: self CRUD ───
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ub_select" ON user_blocks;
CREATE POLICY "ub_select" ON user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid() OR blocked_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "ub_insert" ON user_blocks;
CREATE POLICY "ub_insert" ON user_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
DROP POLICY IF EXISTS "ub_delete" ON user_blocks;
CREATE POLICY "ub_delete" ON user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- ─── REPORTS: reporter + admin only ───
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_select" ON reports;
CREATE POLICY "reports_select" ON reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "reports_insert" ON reports;
CREATE POLICY "reports_insert" ON reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "reports_update" ON reports;
CREATE POLICY "reports_update" ON reports FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── SOS_EVENTS: self + security + admin ───
ALTER TABLE sos_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sos_select" ON sos_events;
CREATE POLICY "sos_select" ON sos_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin() OR public.is_security());
DROP POLICY IF EXISTS "sos_insert" ON sos_events;
CREATE POLICY "sos_insert" ON sos_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "sos_update" ON sos_events;
CREATE POLICY "sos_update" ON sos_events FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin() OR public.is_security()) WITH CHECK (user_id = auth.uid() OR public.is_admin() OR public.is_security());

-- ─── SOS_LOCATIONS: self + security + admin ───
ALTER TABLE sos_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sosloc_select" ON sos_locations;
CREATE POLICY "sosloc_select" ON sos_locations FOR SELECT TO authenticated USING (
  public.is_admin() OR public.is_security() OR
  EXISTS (SELECT 1 FROM sos_events se WHERE se.id = sos_locations.sos_event_id AND se.user_id = auth.uid())
);
DROP POLICY IF EXISTS "sosloc_insert" ON sos_locations;
CREATE POLICY "sosloc_insert" ON sos_locations FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM sos_events se WHERE se.id = sos_locations.sos_event_id AND se.user_id = auth.uid())
);

-- ─── WEBHOOK_DELIVERIES: admin + security ───
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wd_select" ON webhook_deliveries;
CREATE POLICY "wd_select" ON webhook_deliveries FOR SELECT TO authenticated USING (public.is_admin() OR public.is_security());
DROP POLICY IF EXISTS "wd_update" ON webhook_deliveries;
CREATE POLICY "wd_update" ON webhook_deliveries FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── NOTIFICATIONS: self only ───
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select" ON notifications;
CREATE POLICY "notif_select" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_update" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── AUDIT_LOG: admin only read, self insert ───
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select" ON audit_log;
CREATE POLICY "audit_select" ON audit_log FOR SELECT TO authenticated USING (public.is_admin() OR public.is_security() OR actor_id = auth.uid());
DROP POLICY IF EXISTS "audit_insert" ON audit_log;
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ─── VERIFICATION_DOCS: self + admin ───
ALTER TABLE verification_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vdocs_select" ON verification_docs;
CREATE POLICY "vdocs_select" ON verification_docs FOR SELECT TO authenticated USING (profile_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "vdocs_insert" ON verification_docs;
CREATE POLICY "vdocs_insert" ON verification_docs FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "vdocs_update" ON verification_docs;
CREATE POLICY "vdocs_update" ON verification_docs FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
