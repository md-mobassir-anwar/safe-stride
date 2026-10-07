/*
# SafeStride Seed Data

Seeds: institution, config, places, edges, saved destinations, demo profiles, ERP roster, emergency contacts.
Uses gen_random_uuid() for demo profile IDs and matches by scholar_id in the demo login switcher.
*/

-- ─── INSTITUTION ───
INSERT INTO institutions (id, name, code, timezone)
VALUES ('11111111-1111-1111-1111-111111111111', 'MANIT Bhopal', 'MANIT', 'Asia/Kolkata')
ON CONFLICT (code) DO NOTHING;

-- ─── DEFAULT CONFIG ───
DO $$
DECLARE
  inst uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO app_config (institution_id, key, value, description) VALUES
  (inst, 'timing_tolerance_minutes', '10', 'Max departure time difference for a match (3-10)'),
  (inst, 'timing_full_score_minutes', '3', 'Departure diff at which timing score is 1.0'),
  (inst, 'corridor_buffer_meters', '40', 'Buffer distance for corridor overlap calculation'),
  (inst, 'corridor_min_overlap_pct', '60', 'Minimum corridor overlap percentage required'),
  (inst, 'score_weight_timing', '0.40', 'Weight of timing in final score'),
  (inst, 'score_weight_overlap', '0.40', 'Weight of corridor overlap in final score'),
  (inst, 'score_weight_trust', '0.20', 'Weight of trust in final score'),
  (inst, 'max_results', '5', 'Maximum number of match results to return'),
  (inst, 'trust_initial', '50', 'Starting trust points'),
  (inst, 'trust_completed', '15', 'Trust points awarded for a completed journey'),
  (inst, 'trust_noshow', '-30', 'Trust points deducted for a no-show'),
  (inst, 'noshow_grace_minutes', '10', 'Grace period after departure before no-show'),
  (inst, 'noshow_suspend_hours', '24', 'Suspension duration after a no-show'),
  (inst, 'index_penalty_per_noshow', '10', 'Safety index penalty per no-show in last 90 days'),
  (inst, 'index_noshow_window_days', '90', 'Window for counting no-shows for safety index'),
  (inst, 'badge_silver_index', '60', 'Safety index threshold for silver badge'),
  (inst, 'badge_silver_walks', '3', 'Completed walks threshold for silver badge'),
  (inst, 'badge_gold_index', '80', 'Safety index threshold for gold badge'),
  (inst, 'badge_gold_walks', '8', 'Completed walks threshold for gold badge'),
  (inst, 'outside_open_hour', '6', 'Hour outside-campus mode opens (06:00)'),
  (inst, 'outside_close_hour', '19', 'Hour outside-campus mode closes (19:00)'),
  (inst, 'location_retention_days', '30', 'Days to retain location trail data'),
  (inst, 'sos_tracking_expiry_hours', '2', 'Hours after resolution to expire tracking link'),
  (inst, 'sos_stream_interval_seconds', '4', 'Interval for SOS live location streaming'),
  (inst, 'journey_ping_interval_seconds', '5', 'Interval for journey live location pings'),
  (inst, 'deviation_threshold_meters', '100', 'Route deviation threshold for safety check'),
  (inst, 'deviation_response_seconds', '30', 'Response window for deviation prompt'),
  (inst, 'sync_countdown_seconds', '10', 'Synchronized Step-out-together countdown'),
  (inst, 'webhook_url', '"https://example.com/webhook"', 'Command Center webhook URL (HMAC signed)'),
  (inst, 'webhook_secret', '"safestride-hmac-secret-change-me"', 'HMAC-SHA256 signing secret for webhook'),
  (inst, 'group_walk_max', '5', 'Maximum participants in a group walk'),
  (inst, 'group_walk_min', '2', 'Minimum participants in a group walk'),
  (inst, 'erp_mode', '"roster"', 'ERP adapter mode: roster or api'),
  (inst, 'sms_mode', '"fallback"', 'SMS adapter mode: twilio or fallback'),
  (inst, 'push_mode', '"fallback"', 'Push adapter mode: web_push or fallback')
  ON CONFLICT (institution_id, key) DO NOTHING;
END $$;

-- ─── CAMPUS PLACES ───
DO $$
DECLARE
  inst uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO places (institution_id, name, category, lat, lng, is_gateway, sort_order) VALUES
  (inst, 'Kalpana Chawla Hostel', 'hostel', 23.2155, 77.4035, false, 1),
  (inst, 'Girls Hostel 7', 'hostel', 23.2168, 77.4052, false, 2),
  (inst, 'Girls Hostel 10', 'hostel', 23.2148, 77.4068, false, 3),
  (inst, 'Hostel 11', 'hostel', 23.2175, 77.4085, false, 4),
  (inst, 'Central Library', 'academic', 23.2160, 77.4070, false, 5),
  (inst, 'Rolta Lab', 'academic', 23.2158, 77.4078, false, 6),
  (inst, 'SAC', 'recreation', 23.2165, 77.4060, false, 7),
  (inst, 'Main Gate', 'gateway', 23.2145, 77.4090, true, 8)
  ON CONFLICT DO NOTHING;
END $$;

-- ─── CAMPUS EDGES ───
DO $$
DECLARE
  inst uuid := '11111111-1111-1111-1111-111111111111';
  v_kc uuid; v_g7 uuid; v_g10 uuid; v_h11 uuid; v_lib uuid; v_rolta uuid; v_sac uuid; v_gate uuid;
BEGIN
  SELECT id INTO v_kc FROM places WHERE institution_id=inst AND name='Kalpana Chawla Hostel';
  SELECT id INTO v_g7 FROM places WHERE institution_id=inst AND name='Girls Hostel 7';
  SELECT id INTO v_g10 FROM places WHERE institution_id=inst AND name='Girls Hostel 10';
  SELECT id INTO v_h11 FROM places WHERE institution_id=inst AND name='Hostel 11';
  SELECT id INTO v_lib FROM places WHERE institution_id=inst AND name='Central Library';
  SELECT id INTO v_rolta FROM places WHERE institution_id=inst AND name='Rolta Lab';
  SELECT id INTO v_sac FROM places WHERE institution_id=inst AND name='SAC';
  SELECT id INTO v_gate FROM places WHERE institution_id=inst AND name='Main Gate';

  INSERT INTO campus_edges (institution_id, from_place_id, to_place_id, waypoints, distance_m) VALUES
  (inst, v_kc, v_sac, '[{"lat":23.2158,"lng":77.4045},{"lat":23.2160,"lng":77.4050}]'::jsonb, 180),
  (inst, v_sac, v_g7, '[{"lat":23.2166,"lng":77.4055}]'::jsonb, 120),
  (inst, v_sac, v_lib, '[{"lat":23.2162,"lng":77.4065}]'::jsonb, 150),
  (inst, v_g7, v_lib, '[]'::jsonb, 200),
  (inst, v_lib, v_rolta, '[]'::jsonb, 90),
  (inst, v_lib, v_g10, '[{"lat":23.2155,"lng":77.4069}]'::jsonb, 160),
  (inst, v_lib, v_h11, '[{"lat":23.2167,"lng":77.4077}]'::jsonb, 220),
  (inst, v_g10, v_gate, '[{"lat":23.2146,"lng":77.4079}]'::jsonb, 250),
  (inst, v_rolta, v_h11, '[]'::jsonb, 130),
  (inst, v_h11, v_gate, '[{"lat":23.2160,"lng":77.4088}]'::jsonb, 280),
  (inst, v_kc, v_g10, '[{"lat":23.2150,"lng":77.4050}]'::jsonb, 300)
  ON CONFLICT DO NOTHING;
END $$;

-- ─── SAVED DESTINATIONS ───
DO $$
DECLARE
  inst uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO saved_destinations (institution_id, name, lat, lng) VALUES
  (inst, 'AIIMS Bhopal', 23.2445, 77.4370),
  (inst, 'NIFT Bhopal', 23.2315, 77.4035),
  (inst, 'AMPRI Bhopal', 23.2235, 77.4255),
  (inst, 'BU Bhopal (Barkatullah)', 23.1985, 77.4565)
  ON CONFLICT DO NOTHING;
END $$;

-- ─── DEMO PROFILES, ROSTER, CONTACTS ───
DO $$
DECLARE
  inst uuid := '11111111-1111-1111-1111-111111111111';
  i int;
  v_id uuid;
  v_scholar text;
  v_name text;
  v_dept text;
  v_year text;
  v_trust int;
  v_walks int;
  v_rating numeric;
  v_index numeric;
  v_badge badge_level;
  v_hostel text;
  v_phone text;
  depts text[] := ARRAY['CSE','ECE','ME','CE','EE','IT','PIE','Architecture'];
  years text[] := ARRAY['1st','2nd','3rd','4th','5th'];
  hostels text[] := ARRAY['Kalpana Chawla Hostel','Girls Hostel 7','Girls Hostel 10','Hostel 11'];
  names text[] := ARRAY['Ananya','Priya','Sneha','Kavya','Riya','Isha','Pooja','Neha','Aarti','Shreya',
    'Divya','Anjali','Meera','Tanvi','Sakshi','Roshni','Deepa','Nisha','Megha','Kriti',
    'Aditi','Bhavna','Charvi','Disha','Ekta','Falguni','Gauri','Harshita','Ila','Jhanvi',
    'Komal','Lavanya','Madhuri','Nandini','Ojaswi','Pallavi','Qabila','Ruchika','Sara','Tara',
    'Urmila','Vaishali','Wriddhi','Yami','Zara','Aisha','Bani','Chitra','Damini','Eesha',
    'Falak','Gia','Hita','Ira','Jaya','Kiara','Lata','Mira','Nadiya','Oshin'];
  surnames text[] := ARRAY['S.','M.','R.','K.','G.','P.','N.','A.','V.','T.','B.','C.','D.','J.','L.','Sharma','Singh','Verma','Gupta','Yadav'];
BEGIN
  -- Admin
  v_id := 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO profiles (id, institution_id, scholar_id, full_name, email, role, account_state, department, year, is_demo, trust_points, badge)
  VALUES (v_id, inst, 'ADMIN001', 'SafeStride Admin', 'admin@manit.ac.in', 'admin', 'active', 'Administration', 'Staff', true, 100, 'gold')
  ON CONFLICT (id) DO NOTHING;

  -- Security operator
  v_id := 'aaaaaaaa-0000-0000-0000-000000000002';
  INSERT INTO profiles (id, institution_id, scholar_id, full_name, email, role, account_state, department, year, is_demo, trust_points, badge)
  VALUES (v_id, inst, 'SEC001', 'Security Control', 'security@manit.ac.in', 'security', 'active', 'Security', 'Staff', true, 80, 'silver')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO erp_roster (institution_id, scholar_id, name, gender, email, department, year, role) VALUES
  (inst, 'ADMIN001', 'SafeStride Admin', 'female', 'admin@manit.ac.in', 'Administration', 'Staff', 'admin'),
  (inst, 'SEC001', 'Security Control', 'female', 'security@manit.ac.in', 'Security', 'Staff', 'security')
  ON CONFLICT (institution_id, scholar_id) DO NOTHING;

  FOR i IN 1..60 LOOP
    v_scholar := 'DEMO' || lpad(i::text, 4, '0');
    v_name := names[i] || ' ' || surnames[((i-1) % array_length(surnames,1)) + 1];
    v_dept := depts[((i-1) % array_length(depts,1)) + 1];
    v_year := years[((i-1) % array_length(years,1)) + 1];
    v_hostel := hostels[((i-1) % array_length(hostels,1)) + 1];
    v_phone := '+91' || lpad((9000000000 + i*137)::text, 10, '0');

    v_trust := 30 + (i % 70);
    v_walks := (i % 15);
    v_rating := 3.5 + ((i % 15) / 10.0);
    v_index := LEAST(100, GREATEST(0, (v_walks::numeric / GREATEST(v_walks + 1, 1)) * v_rating * 20 - (i % 3) * 10));

    IF v_index >= 80 AND v_walks >= 8 THEN
      v_badge := 'gold';
    ELSIF v_index >= 60 AND v_walks >= 3 THEN
      v_badge := 'silver';
    ELSE
      v_badge := 'bronze';
    END IF;

    IF i = 1 THEN
      v_name := 'Ananya S.'; v_dept := 'CSE'; v_year := '3rd';
      v_rating := 4.9; v_walks := 12; v_trust := 95; v_index := 92; v_badge := 'gold';
    ELSIF i = 2 THEN
      v_name := 'Priya M.'; v_dept := 'ECE'; v_year := '4th';
      v_rating := 4.8; v_walks := 10; v_trust := 90; v_index := 85; v_badge := 'gold';
    END IF;

    v_id := gen_random_uuid();

    INSERT INTO profiles (
      id, institution_id, scholar_id, full_name, email, role, account_state,
      department, year, hostel, badge, trust_points, safety_index,
      completed_walks, total_requests, avg_rating, no_show_count, is_demo,
      phone, profile_completeness, photo_url, id_card_url
    ) VALUES (
      v_id, inst, v_scholar, v_name,
      'demo' || i || '@manit.ac.in',
      'student_staff', 'active',
      v_dept, v_year, v_hostel, v_badge, v_trust,
      v_index, v_walks, v_walks + (i % 5), v_rating, (i % 3), true,
      v_phone, 100,
      'https://api.dicebear.com/7.x/initials/svg?seed=' || replace(v_name, ' ', '%20'),
      'demo_id_' || i || '.jpg'
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO erp_roster (institution_id, scholar_id, name, gender, email, department, year, role)
    VALUES (inst, v_scholar, v_name, 'female', 'demo' || i || '@manit.ac.in', v_dept, v_year, 'student')
    ON CONFLICT (institution_id, scholar_id) DO NOTHING;

    INSERT INTO emergency_contacts (profile_id, name, phone, relationship)
    VALUES (v_id, 'Parent (Demo ' || i || ')', v_phone, 'parent')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
