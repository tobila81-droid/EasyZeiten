/*
# Revoke anon execute on new SECURITY DEFINER functions
*/
REVOKE EXECUTE ON FUNCTION public.get_server_time() FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_time_entry(uuid, text, text, uuid, integer) FROM anon;
