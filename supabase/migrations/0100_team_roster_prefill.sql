with roster_seed as (
  select *
  from (
    values
      (
        'oc002@ctyhp.com',
        'joc'::public.user_role,
        array['Mon','Tue','Wed','Thu','Fri']::text[],
        'none'::public.qualification_tier,
        'none'::public.qualification_tier,
        'none'::public.qualification_tier,
        null::text,
        'os003@ctyhp.com',
        true
      ),
      (
        'os003@ctyhp.com',
        'joc'::public.user_role,
        array['Mon','Tue','Wed','Sat','Sun']::text[],
        'none'::public.qualification_tier,
        'none'::public.qualification_tier,
        'none'::public.qualification_tier,
        null::text,
        'oc002@ctyhp.com',
        true
      ),
      (
        'hoaan@ctyhp.com',
        'client_advisor'::public.user_role,
        array['Tue','Fri','Sat']::text[],
        'primary'::public.qualification_tier,
        'primary'::public.qualification_tier,
        'primary'::public.qualification_tier,
        'oc002@ctyhp.com',
        null::text,
        true
      ),
      (
        'tuongvan@ctyhp.com',
        'client_advisor'::public.user_role,
        array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[],
        'backup'::public.qualification_tier,
        'backup'::public.qualification_tier,
        'backup'::public.qualification_tier,
        'oc002@ctyhp.com',
        null::text,
        true
      ),
      (
        'lyn@ctyhp.com',
        'client_advisor'::public.user_role,
        array['Mon','Tue','Wed','Thu','Fri']::text[],
        'primary'::public.qualification_tier,
        'backup'::public.qualification_tier,
        'primary'::public.qualification_tier,
        'oc002@ctyhp.com',
        null::text,
        true
      ),
      (
        'val@ctyhp.com',
        'client_advisor'::public.user_role,
        array['Mon','Wed','Thu','Sat','Sun']::text[],
        'primary'::public.qualification_tier,
        'backup'::public.qualification_tier,
        'primary'::public.qualification_tier,
        'os003@ctyhp.com',
        null::text,
        true
      ),
      (
        'phungminh@ctyhp.com',
        'client_advisor'::public.user_role,
        array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[],
        'backup'::public.qualification_tier,
        'backup'::public.qualification_tier,
        'backup'::public.qualification_tier,
        'oc002@ctyhp.com',
        null::text,
        true
      )
  ) as seed(
    email,
    role,
    working_days,
    skill_lab_diamond,
    skill_natural_diamond,
    skill_general_appointment,
    default_joc_email,
    coverage_partner_email,
    coverage_enabled
  )
),
matched_roster as (
  select
    u.id as user_id,
    s.role,
    s.working_days,
    s.skill_lab_diamond,
    s.skill_natural_diamond,
    s.skill_general_appointment,
    default_joc.id as default_joc_user_id,
    coverage_partner.id as coverage_partner_user_id,
    s.coverage_enabled
  from roster_seed s
  join public.users u
    on lower(u.email) = lower(s.email)
   and u.active = true
  left join public.users default_joc
    on lower(default_joc.email) = lower(s.default_joc_email)
   and default_joc.active = true
  left join public.users coverage_partner
    on lower(coverage_partner.email) = lower(s.coverage_partner_email)
   and coverage_partner.active = true
)
insert into public.user_roles (user_id, role)
select user_id, role
from matched_roster
on conflict (user_id, role) do nothing;
with roster_seed as (
  select *
  from (
    values
      ('oc002@ctyhp.com', array['Mon','Tue','Wed','Thu','Fri']::text[], 'none'::public.qualification_tier, 'none'::public.qualification_tier, 'none'::public.qualification_tier, null::text, 'os003@ctyhp.com', true),
      ('os003@ctyhp.com', array['Mon','Tue','Wed','Sat','Sun']::text[], 'none'::public.qualification_tier, 'none'::public.qualification_tier, 'none'::public.qualification_tier, null::text, 'oc002@ctyhp.com', true),
      ('hoaan@ctyhp.com', array['Tue','Fri','Sat']::text[], 'primary'::public.qualification_tier, 'primary'::public.qualification_tier, 'primary'::public.qualification_tier, 'oc002@ctyhp.com', null::text, true),
      ('tuongvan@ctyhp.com', array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[], 'backup'::public.qualification_tier, 'backup'::public.qualification_tier, 'backup'::public.qualification_tier, 'oc002@ctyhp.com', null::text, true),
      ('lyn@ctyhp.com', array['Mon','Tue','Wed','Thu','Fri']::text[], 'primary'::public.qualification_tier, 'backup'::public.qualification_tier, 'primary'::public.qualification_tier, 'oc002@ctyhp.com', null::text, true),
      ('val@ctyhp.com', array['Mon','Wed','Thu','Sat','Sun']::text[], 'primary'::public.qualification_tier, 'backup'::public.qualification_tier, 'primary'::public.qualification_tier, 'os003@ctyhp.com', null::text, true),
      ('phungminh@ctyhp.com', array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']::text[], 'backup'::public.qualification_tier, 'backup'::public.qualification_tier, 'backup'::public.qualification_tier, 'oc002@ctyhp.com', null::text, true)
  ) as seed(
    email,
    working_days,
    skill_lab_diamond,
    skill_natural_diamond,
    skill_general_appointment,
    default_joc_email,
    coverage_partner_email,
    coverage_enabled
  )
),
matched_roster as (
  select
    u.id as user_id,
    s.working_days,
    s.skill_lab_diamond,
    s.skill_natural_diamond,
    s.skill_general_appointment,
    default_joc.id as default_joc_user_id,
    coverage_partner.id as coverage_partner_user_id,
    s.coverage_enabled
  from roster_seed s
  join public.users u
    on lower(u.email) = lower(s.email)
   and u.active = true
  left join public.users default_joc
    on lower(default_joc.email) = lower(s.default_joc_email)
   and default_joc.active = true
  left join public.users coverage_partner
    on lower(coverage_partner.email) = lower(s.coverage_partner_email)
   and coverage_partner.active = true
)
insert into public.roster_schedule (
  user_id,
  working_days,
  skill_lab_diamond,
  skill_natural_diamond,
  skill_general_appointment,
  default_joc_user_id,
  coverage_partner_user_id,
  coverage_enabled
)
select
  user_id,
  working_days,
  skill_lab_diamond,
  skill_natural_diamond,
  skill_general_appointment,
  default_joc_user_id,
  coverage_partner_user_id,
  coverage_enabled
from matched_roster
on conflict (user_id) do update
set working_days = excluded.working_days,
    skill_lab_diamond = excluded.skill_lab_diamond,
    skill_natural_diamond = excluded.skill_natural_diamond,
    skill_general_appointment = excluded.skill_general_appointment,
    default_joc_user_id = excluded.default_joc_user_id,
    coverage_partner_user_id = excluded.coverage_partner_user_id,
    coverage_enabled = excluded.coverage_enabled;
