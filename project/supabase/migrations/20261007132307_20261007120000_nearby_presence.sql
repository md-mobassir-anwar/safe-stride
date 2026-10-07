/*
# Add opt-in nearby presence

1. New Tables
- `nearby_presence`
- `user_id` (uuid, primary key and profile owner)
- `institution_id` (uuid, campus tenant)
- `lat` and `lng` (current shared position)
- `accuracy_m` (GPS accuracy reported by the device)
- `sharing_enabled` (explicit user-controlled sharing switch)
- `last_seen_at` (freshness timestamp)
- `updated_at` (row update timestamp)

2. Security
- Enable RLS on `nearby_presence`.
- Authenticated users may read only fresh, enabled presence rows from their institution.
- Each user may insert, update, and delete only their own presence row.
- Exact coordinates are never available to anonymous users.

3. Realtime
- Add `nearby_presence` to the Supabase Realtime publication so the map updates without polling.

4. Important Notes
- Sharing is opt-in and disabled by deleting or disabling the user's row.
- The frontend also removes stale markers, but freshness is enforced in the database policy.
*/

CREATE TABLE IF NOT EXISTS public.nearby_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  lat numeric(10,7) NOT NULL CHECK (lat >= -90 AND lat <= 90),
  lng numeric(10,7) NOT NULL CHECK (lng >= -180 AND lng <= 180),
  accuracy_m numeric(8,2) CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  sharing_enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nearby_presence_institution_fresh
  ON public.nearby_presence (institution_id, last_seen_at)
  WHERE sharing_enabled = true;

ALTER TABLE public.nearby_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence_select_same_institution" ON public.nearby_presence;
CREATE POLICY "presence_select_same_institution"
ON public.nearby_presence FOR SELECT
TO authenticated
USING (
  sharing_enabled = true
  AND last_seen_at > now() - interval '10 minutes'
  AND EXISTS (
    SELECT 1 FROM public.profiles viewer
    WHERE viewer.id = auth.uid()
      AND viewer.institution_id = nearby_presence.institution_id
      AND viewer.account_state = 'active'
  )
);

DROP POLICY IF EXISTS "presence_insert_own" ON public.nearby_presence;
CREATE POLICY "presence_insert_own"
ON public.nearby_presence FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid() AND p.account_state = 'active')
);

DROP POLICY IF EXISTS "presence_update_own" ON public.nearby_presence;
CREATE POLICY "presence_update_own"
ON public.nearby_presence FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid() AND p.account_state = 'active')
);

DROP POLICY IF EXISTS "presence_delete_own" ON public.nearby_presence;
CREATE POLICY "presence_delete_own"
ON public.nearby_presence FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nearby_presence;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;