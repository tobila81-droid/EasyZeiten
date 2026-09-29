/*
# Revoke anon execute on handle_new_user trigger

The handle_new_user function is a trigger on auth.users and should not be
directly callable via the REST API. Revoke from anon and authenticated.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
