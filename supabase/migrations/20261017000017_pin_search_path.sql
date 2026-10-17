-- Supabase's security linter flags these helpers because their search_path is not fixed. Pin it so a caller's
-- search_path can never change which tables or functions they resolve.
alter function public._fail(text, integer) set search_path = public;
alter function public._newid(text) set search_path = public;
alter function public._prefix(text) set search_path = public;
alter function public._next_num(text[], integer) set search_path = public;
alter function public._inv_check(jsonb) set search_path = public;
alter function public._manager_action(requests, text) set search_path = public;
alter function public.role_rank(text) set search_path = public;
