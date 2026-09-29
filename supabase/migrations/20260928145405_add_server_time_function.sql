/*
# Add get_server_time function for client clock synchronization

The browser timer uses Date.now() (client clock) while time entries store
server timestamps from PostgreSQL now(). The round-trip latency and clock
skew between client and server causes the timer to show a few seconds
immediately after starting.

This function returns the server's current time so the client can compute
an offset and display accurate durations.

1. New function
- `get_server_time()` returns timestamptz (server's now())
2. Security
- Callable by authenticated users only
*/

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now();
$$;

REVOKE EXECUTE ON FUNCTION public.get_server_time() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated;
