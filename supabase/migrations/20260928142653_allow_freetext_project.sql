/*
# Allow free-text project entries in time tracking

The time tracking form should let employees either select an existing project
from a list OR type a free-text project name when no matching project exists.

1. Schema changes
- `time_entries.project_id` is now nullable (was NOT NULL).
- New column `time_entries.project_name` stores the project name as entered,
  so free-text entries are still displayable even without a linked project row.

2. Function changes
- `start_time_entry` now accepts `p_project_id uuid DEFAULT NULL` and
  `p_project_name text DEFAULT NULL`. When a project_id is given, the project
  name is looked up from the projects table. When only free text is given,
  project_id stays null and project_name is stored directly.
- The "project is active" check only runs when a project_id is provided.

3. Security
- RLS policies on time_entries are unchanged — ownership checks still apply.
- The unique index preventing two running entries per user is unchanged.
*/

ALTER TABLE public.time_entries ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS project_name text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.start_time_entry(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.start_time_entry(
  p_project_id uuid DEFAULT NULL,
  p_description text DEFAULT '',
  p_project_name text DEFAULT ''
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.time_entries;
  v_project_name text;
BEGIN
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND active = true) THEN
      RAISE EXCEPTION 'Project is not active';
    END IF;
    SELECT name INTO v_project_name FROM public.projects WHERE id = p_project_id;
  ELSE
    v_project_name := left(coalesce(p_project_name, ''), 200);
    IF v_project_name = '' THEN
      RAISE EXCEPTION 'Either a project or a project name is required';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.time_entries WHERE user_id = auth.uid() AND stopped_at IS NULL) THEN
    RAISE EXCEPTION 'An active time entry already exists';
  END IF;

  INSERT INTO public.time_entries (user_id, project_id, project_name, description)
  VALUES (auth.uid(), p_project_id, v_project_name, left(coalesce(p_description, ''), 500))
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text) TO authenticated;
