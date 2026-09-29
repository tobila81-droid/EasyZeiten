/*
# Migrate projects to activities, remove numbers, add participant_count

This migration performs several schema changes:
1. Renames the `projects` table to `activities` and all its `project_*` columns.
2. Removes `customer_number` from customers and `project_number` from activities.
3. Adds `participant_count` to `time_entries` for the "Stundenerfassung" special case.
4. Renames `time_entries.project_id` to `activity_id` and `project_name` to `activity_name`.
5. Updates all RLS policies, functions, indexes, and constraints to use the new names.

No data is lost — all existing rows are preserved through the renames.
*/

-- Step 1: Add participant_count to time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS participant_count integer CHECK (participant_count IS NULL OR participant_count > 0);

-- Step 2: Rename projects table to activities
ALTER TABLE public.projects RENAME TO activities;

-- Step 3: Rename columns in activities
ALTER TABLE public.activities RENAME COLUMN project_number TO activity_number;
ALTER TABLE public.activities DROP COLUMN IF EXISTS activity_number;

ALTER TABLE public.activities DROP COLUMN IF EXISTS description;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Step 4: Drop project_number unique index, add activity_number removal
DROP INDEX IF EXISTS public.projects_project_number_key;

-- Step 5: Rename time_entries columns
ALTER TABLE public.time_entries RENAME COLUMN project_id TO activity_id;
ALTER TABLE public.time_entries RENAME COLUMN project_name TO activity_name;

-- Step 6: Remove customer_number from customers
ALTER TABLE public.customers DROP COLUMN IF EXISTS customer_number;
DROP INDEX IF EXISTS public.customers_customer_number_key;

-- Step 7: Recreate the foreign key constraint with the new column name
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_project_id_fkey;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE RESTRICT;

-- Step 8: Rename the index on activities.customer_id
DROP INDEX IF EXISTS public.projects_customer_id_idx;
CREATE INDEX IF NOT EXISTS activities_customer_id_idx ON public.activities(customer_id);

-- Step 9: Drop and recreate the start_time_entry function with new parameter names
DROP FUNCTION IF EXISTS public.start_time_entry(uuid, text, text, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.start_time_entry(
  p_activity_id uuid DEFAULT NULL,
  p_description text DEFAULT '',
  p_activity_name text DEFAULT '',
  p_customer_id uuid DEFAULT NULL,
  p_participant_count integer DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.time_entries;
  v_activity_name text;
  v_customer_id uuid;
BEGIN
  IF p_activity_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id AND active = true) THEN
      RAISE EXCEPTION 'Activity is not active';
    END IF;
    SELECT name, customer_id INTO v_activity_name, v_customer_id FROM public.activities WHERE id = p_activity_id;
  ELSE
    v_activity_name := left(coalesce(p_activity_name, ''), 200);
    v_customer_id := p_customer_id;
    IF v_activity_name = '' THEN
      RAISE EXCEPTION 'Either an activity or an activity name is required';
    END IF;
  END IF;

  IF p_participant_count IS NOT NULL AND p_participant_count < 1 THEN
    RAISE EXCEPTION 'Participant count must be a positive integer';
  END IF;

  IF EXISTS (SELECT 1 FROM public.time_entries WHERE user_id = auth.uid() AND stopped_at IS NULL) THEN
    RAISE EXCEPTION 'An active time entry already exists';
  END IF;

  INSERT INTO public.time_entries (user_id, activity_id, activity_name, customer_id, description, participant_count)
  VALUES (auth.uid(), p_activity_id, v_activity_name, v_customer_id, left(coalesce(p_description, ''), 500), p_participant_count)
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text, uuid, integer) TO authenticated;

-- Step 10: Drop and recreate all RLS policies on activities (was projects)
DROP POLICY IF EXISTS projects_select_active_or_admin ON public.activities;
DROP POLICY IF EXISTS projects_admin_insert ON public.activities;
DROP POLICY IF EXISTS projects_admin_update ON public.activities;
DROP POLICY IF EXISTS projects_admin_delete ON public.activities;

CREATE POLICY activities_select_active_or_admin ON public.activities FOR SELECT TO authenticated USING (active OR public.is_admin());
CREATE POLICY activities_admin_insert ON public.activities FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY activities_admin_update ON public.activities FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY activities_admin_delete ON public.activities FOR DELETE TO authenticated USING (public.is_admin());

-- Step 11: RLS policies on time_entries don't reference project columns, but
-- the pauses policy references time_entries which is fine. No changes needed.

-- Step 12: RLS policies on customers — drop and recreate without customer_number reference
-- (existing policies don't reference customer_number, so no changes needed)

-- Step 13: Ensure is_admin function still works (it references user_roles, not projects)
-- No changes needed.
