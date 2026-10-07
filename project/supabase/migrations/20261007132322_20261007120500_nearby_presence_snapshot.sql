/*
# Add secure nearby presence snapshot

1. New Function
- `get_nearby_presence` returns only the minimum data needed by the nearby map:
  user ID, display name, badge, coordinates, accuracy, and last-seen time.

2. Security
- The caller's institution and active status are derived from `auth.uid()`.
- Only opted-in, fresh presence rows are returned.
- The function runs with a fixed search path and is not callable by anonymous users.
- Private profile fields such as email, phone, scholar ID, and hostel are never returned.

3. Important Notes
- The function is intentionally read-only and has no user-supplied institution or user filter.
- Nearby presence remains opt-in and expires automatically after ten minutes without an update.
*/

CREATE OR REPLACE FUNCTION public.get_nearby_presence()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  badge public.badge_level,
  lat numeric,
  lng numeric,
  accuracy_m numeric,
  last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT np.user_id, p.full_name, p.badge, np.lat, np.lng, np.accuracy_m, np.last_seen_at
  FROM public.nearby_presence np
  JOIN public.profiles p ON p.id = np.user_id
  WHERE np.institution_id = (
    SELECT viewer.institution_id
    FROM public.profiles viewer
    WHERE viewer.id = auth.uid() AND viewer.account_state = 'active'
  )
  AND np.sharing_enabled = true
  AND np.last_seen_at > now() - interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.get_nearby_presence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nearby_presence() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_presence() TO authenticated;