/*
# Easy Payroll initial time tracking application

1. New Tables
- `profiles`: authenticated users' display name, email snapshot, and active status.
- `user_roles`: server-managed ADMIN or EMPLOYEE role per user.
- `customers`: customer master data.
- `projects`: customer-owned project master data.
- `time_entries`: immutable ownership-scoped work sessions with server timestamps.
- `time_entry_pauses`: pauses belonging to time entries.

2. Relationships and integrity
- Projects belong to exactly one customer.
- Time entries belong to one user and project.
- A partial unique index prevents more than one running time entry per employee.
- A trigger creates a profile and assigns the first registered user as ADMIN.

3. Security
- RLS is enabled on every application table.
- Authenticated users read active customers/projects and manage only their own time entries.
- Administrators manage profiles, roles, customers, projects, and all time entries.
- Role changes, activation changes, and time transitions are performed through SECURITY DEFINER functions that check auth.uid().

4. Important notes
- All time transitions use PostgreSQL `now()` and are not based on a browser timer.
- The frontend only displays stored timestamps and computed durations.
- The first account is promoted by database state, never by email address.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  customer_number text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  name text NOT NULL,
  project_number text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  description text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stopped_at IS NULL OR stopped_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.time_entry_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_customer_number_key ON public.customers(customer_number);
CREATE UNIQUE INDEX IF NOT EXISTS projects_project_number_key ON public.projects(project_number);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_time_entry_per_user ON public.time_entries(user_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_customer_id_idx ON public.projects(customer_id);
CREATE INDEX IF NOT EXISTS time_entries_user_started_idx ON public.time_entries(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS time_entry_pauses_entry_idx ON public.time_entry_pauses(time_entry_id);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role text;
BEGIN
  assigned_role := CASE WHEN NOT EXISTS (SELECT 1 FROM public.user_roles) THEN 'ADMIN' ELSE 'EMPLOYEE' END;
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data ->> 'display_name', ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.start_time_entry(p_project_id uuid, p_description text DEFAULT '')
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.time_entries;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND active = true) THEN
    RAISE EXCEPTION 'Project is not active';
  END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries WHERE user_id = auth.uid() AND stopped_at IS NULL) THEN
    RAISE EXCEPTION 'An active time entry already exists';
  END IF;
  INSERT INTO public.time_entries (user_id, project_id, description)
  VALUES (auth.uid(), p_project_id, left(coalesce(p_description, ''), 500))
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_time_entry(p_entry_id uuid)
RETURNS public.time_entry_pauses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.time_entry_pauses;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.time_entries WHERE id = p_entry_id AND user_id = auth.uid() AND stopped_at IS NULL) THEN
    RAISE EXCEPTION 'Time entry is not active';
  END IF;
  IF EXISTS (SELECT 1 FROM public.time_entry_pauses WHERE time_entry_id = p_entry_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'A pause is already open';
  END IF;
  INSERT INTO public.time_entry_pauses (time_entry_id) VALUES (p_entry_id) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_time_entry(p_entry_id uuid)
RETURNS public.time_entry_pauses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.time_entry_pauses;
BEGIN
  UPDATE public.time_entry_pauses p
  SET ended_at = now()
  WHERE p.time_entry_id = p_entry_id
    AND p.ended_at IS NULL
    AND EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = p_entry_id AND t.user_id = auth.uid() AND t.stopped_at IS NULL)
  RETURNING p.* INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'No open pause exists'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_time_entry(p_entry_id uuid)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.time_entries;
BEGIN
  UPDATE public.time_entry_pauses p SET ended_at = now()
  WHERE p.time_entry_id = p_entry_id AND p.ended_at IS NULL
    AND EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = p_entry_id AND t.user_id = auth.uid() AND t.stopped_at IS NULL);
  UPDATE public.time_entries t SET stopped_at = now(), updated_at = now()
  WHERE t.id = p_entry_id AND t.user_id = auth.uid() AND t.stopped_at IS NULL
  RETURNING t.* INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Time entry is not active'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_user_id = auth.uid() AND p_active = false THEN RAISE EXCEPTION 'Cannot deactivate yourself'; END IF;
  UPDATE public.profiles SET active = p_active, updated_at = now() WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_role NOT IN ('ADMIN', 'EMPLOYEE') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  INSERT INTO public.user_roles (user_id, role, updated_at) VALUES (p_user_id, p_role, now())
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS roles_select_self_or_admin ON public.user_roles;
CREATE POLICY roles_select_self_or_admin ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS customers_select_active_or_admin ON public.customers;
CREATE POLICY customers_select_active_or_admin ON public.customers FOR SELECT TO authenticated USING (active OR public.is_admin());
DROP POLICY IF EXISTS customers_admin_insert ON public.customers;
CREATE POLICY customers_admin_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS customers_admin_update ON public.customers;
CREATE POLICY customers_admin_update ON public.customers FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS customers_admin_delete ON public.customers;
CREATE POLICY customers_admin_delete ON public.customers FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS projects_select_active_or_admin ON public.projects;
CREATE POLICY projects_select_active_or_admin ON public.projects FOR SELECT TO authenticated USING (active OR public.is_admin());
DROP POLICY IF EXISTS projects_admin_insert ON public.projects;
CREATE POLICY projects_admin_insert ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS projects_admin_update ON public.projects;
CREATE POLICY projects_admin_update ON public.projects FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS projects_admin_delete ON public.projects;
CREATE POLICY projects_admin_delete ON public.projects FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS entries_select_own_or_admin ON public.time_entries;
CREATE POLICY entries_select_own_or_admin ON public.time_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS entries_insert_own ON public.time_entries;
CREATE POLICY entries_insert_own ON public.time_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS entries_update_own ON public.time_entries;
CREATE POLICY entries_update_own ON public.time_entries FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS entries_delete_own_or_admin ON public.time_entries;
CREATE POLICY entries_delete_own_or_admin ON public.time_entries FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS pauses_select_entry_owner_or_admin ON public.time_entry_pauses;
CREATE POLICY pauses_select_entry_owner_or_admin ON public.time_entry_pauses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND (t.user_id = auth.uid() OR public.is_admin())));
DROP POLICY IF EXISTS pauses_insert_entry_owner ON public.time_entry_pauses;
CREATE POLICY pauses_insert_entry_owner ON public.time_entry_pauses FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS pauses_update_entry_owner ON public.time_entry_pauses;
CREATE POLICY pauses_update_entry_owner ON public.time_entry_pauses FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND (t.user_id = auth.uid() OR public.is_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND (t.user_id = auth.uid() OR public.is_admin())));
DROP POLICY IF EXISTS pauses_delete_entry_owner_or_admin ON public.time_entry_pauses;
CREATE POLICY pauses_delete_entry_owner_or_admin ON public.time_entry_pauses FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND (t.user_id = auth.uid() OR public.is_admin())));

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_time_entry(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_time_entry(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pause_time_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_time_entry(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.resume_time_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resume_time_entry(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.stop_time_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stop_time_entry(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
