-- Grant whoisviv@gmail.com the admin role.
-- Idempotent: only inserts if the user record exists and the role isn't already present.
-- Applied on the next `supabase db push` or production deploy.

insert into public.user_roles (user_id, role)
select id, 'admin'::public.user_role
from public.users
where email = 'whoisviv@gmail.com'
on conflict (user_id, role) do nothing;
