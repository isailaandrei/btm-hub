ALTER TABLE profiles ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}';

-- Atomic merge function to avoid read-modify-write race conditions.
-- Deep-merges a JSONB patch into existing preferences in a single UPDATE.
CREATE OR REPLACE FUNCTION merge_preferences(p_profile_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  UPDATE profiles
  SET preferences = preferences || p_patch
  WHERE id = p_profile_id
  RETURNING preferences;
$$;
