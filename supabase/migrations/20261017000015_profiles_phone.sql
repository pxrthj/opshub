-- Mobile number of a person (E.164, e.g. +919876543210). Lets them sign in with a one-time code sent to their phone.
-- The login itself (auth.users.phone) is kept in step by the admin-ops edge function.
alter table public.profiles add column phone text;
create unique index profiles_phone_idx on public.profiles (phone) where phone is not null;
