/*
# Revoke anon execute on SECURITY DEFINER functions

The Supabase linter flagged that SECURITY DEFINER functions could be called
by the anon role. While REVOKE FROM PUBLIC was already applied, Supabase
projects may have direct grants to anon. This migration explicitly revokes
EXECUTE from anon on all privileged functions so only authenticated users
can call them.

1. Security changes
- REVOKE EXECUTE on all SECURITY DEFINER functions from anon.
- Admin functions (admin_set_user_status, admin_set_user_role) are only
  callable by authenticated users; the function body checks is_admin().
- Time tracking functions (start/pause/resume/stop) are only callable by
  authenticated users; the function body checks auth.uid() ownership.
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_time_entry(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pause_time_entry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resume_time_entry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.stop_time_entry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_status(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
