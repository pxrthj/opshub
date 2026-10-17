-- The sample offices were renamed for Electrolyte Solutions (Distribution → Field Service, Service Centre → PCB
-- Repair Lab), so their sample logins follow: dist.* → field.*, service.* → lab.*. Same accounts, same passwords.
-- The app also accepts the old addresses at sign-in (see /api/auth/login in src/api/routes/supabase.ts).
with renames(old_email, new_email) as (values
  ('dist.admin@plexus.demo', 'field.admin@plexus.demo'),
  ('dist.manager@plexus.demo', 'field.manager@plexus.demo'),
  ('dist.member@plexus.demo', 'field.member@plexus.demo'),
  ('service.admin@plexus.demo', 'lab.admin@plexus.demo'),
  ('service.manager@plexus.demo', 'lab.manager@plexus.demo'),
  ('service.member@plexus.demo', 'lab.member@plexus.demo')
), users as (
  update auth.users u set email = r.new_email, updated_at = now() from renames r where u.email = r.old_email returning u.id, u.email
), idents as (
  update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(users.email)), updated_at = now()
  from users where i.user_id = users.id and i.provider = 'email' returning i.user_id
)
update public.profiles p set email = users.email from users where p.id = users.id;
