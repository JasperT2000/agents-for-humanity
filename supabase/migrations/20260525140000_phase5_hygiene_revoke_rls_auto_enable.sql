-- Phase 5 hygiene: address Supabase security advisors.
--
-- rls_auto_enable() is a Supabase-managed event trigger; it's fired by the DB,
-- not invoked from the API. Anon / authenticated should not be able to call it
-- via /rest/v1/rpc — revoke execute. Service role + postgres keep execute
-- (harmless since event triggers run in DB-driven contexts).

revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
revoke execute on function public.rls_auto_enable() from public;
