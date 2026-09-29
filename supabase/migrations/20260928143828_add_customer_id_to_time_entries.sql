/*
# Store customer directly on time entries for freetext projects

When a time entry is created with a freetext project (no project_id), the
customer association was lost because it was only derivable through the
project → customer join. This adds a customer_id column directly on
time_entries so freetext entries still show the correct customer in reports.

1. Schema changes
- New column `time_entries.customer_id` (nullable uuid, references customers).
- When project_id is set, customer_id is derived from the project's customer.
- When project_id is null (freetext), customer_id is set from the parameter.

2. Function changes
- `start_time_entry` now accepts `p_customer_id uuid DEFAULT NULL`.
  When a project_id is given, the customer is looked up from the project.
  When only freetext is given, the customer_id parameter is stored directly.

3. Security
- RLS unchanged. The customer_id is informational; ownership is still
  enforced via user_id.
*/

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.start_time_entry(uuid, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.start_time_entry(
  p_project_id uuid DEFAULT NULL,
  p_description text DEFAULT '',
  p_project_name text DEFAULT '',
  p_customer_id uuid DEFAULT NULL
)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.time_entries;
  v_project_name text;
  v_customer_id uuid;
BEGIN
  IF p_project_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND active = true) THEN
      RAISE EXCEPTION 'Project is not active';
    END IF;
    SELECT name, customer_id INTO v_project_name, v_customer_id FROM public.projects WHERE id = p_project_id;
  ELSE
    v_project_name := left(coalesce(p_project_name, ''), 200);
    v_customer_id := p_customer_id;
    IF v_project_name = '' THEN
      RAISE EXCEPTION 'Either a project or a project name is required';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.time_entries WHERE user_id = auth.uid() AND stopped_at IS NULL) THEN
    RAISE EXCEPTION 'An active time entry already exists';
  END IF;

  INSERT INTO public.time_entries (user_id, project_id, project_name, customer_id, description)
  VALUES (auth.uid(), p_project_id, v_project_name, v_customer_id, left(coalesce(p_description, ''), 500))
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text, uuid) TO authenticated;
