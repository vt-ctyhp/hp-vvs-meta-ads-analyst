create type public.qualification_tier as enum ('none', 'backup', 'primary');
alter table public.roster_schedule
  alter column skill_lab_diamond drop default,
  alter column skill_natural_diamond drop default,
  alter column skill_general_appointment drop default;
alter table public.roster_schedule
  alter column skill_lab_diamond type public.qualification_tier
    using case
      when skill_lab_diamond then 'primary'::public.qualification_tier
      else 'none'::public.qualification_tier
    end,
  alter column skill_natural_diamond type public.qualification_tier
    using case lower(skill_natural_diamond)
      when 'primary' then 'primary'::public.qualification_tier
      when 'backup' then 'backup'::public.qualification_tier
      when 'secondary' then 'backup'::public.qualification_tier
      else 'none'::public.qualification_tier
    end,
  alter column skill_general_appointment type public.qualification_tier
    using case
      when skill_general_appointment then 'primary'::public.qualification_tier
      else 'none'::public.qualification_tier
    end;
alter table public.roster_schedule
  alter column skill_lab_diamond set default 'none',
  alter column skill_natural_diamond set default 'none',
  alter column skill_general_appointment set default 'primary';
create unique index if not exists uq_schedule_changes_user_date
  on public.schedule_changes(user_id, change_date);
