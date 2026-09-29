/*
# Update stop_time_entry to accept optional participant_count

The TN count for "Stundenerfassung" should be entered when stopping,
not when starting. This migration replaces stop_time_entry with a version
that accepts an optional p_participant_count parameter.
*/

DROP FUNCTION IF EXISTS public.stop_time_entry(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.stop_time_entry(
  p_entry_id uuid,
  p_participant_count integer DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.time_entries;
BEGIN
  IF p_participant_count IS NOT NULL AND p_participant_count < 1 THEN
    RAISE EXCEPTION 'Participant count must be a positive integer';
  END IF;

  UPDATE public.time_entry_pauses p SET ended_at = now()
  WHERE p.time_entry_id = p_entry_id AND p.ended_at IS NULL
    AND EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = p_entry_id AND t.user_id = auth.uid() AND t.stopped_at IS NULL);

  UPDATE public.time_entries t
    SET stopped_at = now(), updated_at = now(),
        participant_count = COALESCE(p_participant_count, t.participant_count)
  WHERE t.id = p_entry_id AND t.user_id = auth.uid() AND t.stopped_at IS NULL
  RETURNING t.* INTO result;

  IF result.id IS NULL THEN RAISE EXCEPTION 'Time entry is not active'; END IF;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stop_time_entry(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.stop_time_entry(uuid, integer) TO authenticated;
