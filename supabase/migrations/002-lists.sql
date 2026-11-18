-- 002-lists.sql — run ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Replaces the fixed triage buckets (Today / This week / This month / Eventually) with
-- your own lists (@triage, @weekly, …). Keeps all your tasks: everything that was in a
-- bucket moves to @triage. (A fresh install doesn't need this: schema.sql already has it.)

create table if not exists public.lists (
  user_id     uuid    not null default auth.uid() references auth.users on delete cascade,
  id          text    not null,               -- "triage" for the built-in list
  name        text    not null,               -- "weekly"  → shown as @weekly
  sort_order  integer not null default 0,
  primary key (user_id, id)
);

alter table public.lists enable row level security;
drop policy if exists "Users manage their own lists" on public.lists;
create policy "Users manage their own lists" on public.lists
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- tasks.bucket becomes tasks.list_id; old buckets all become @triage.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tasks' and column_name = 'bucket') then
    alter table public.tasks rename column bucket to list_id;
  end if;
end $$;

update public.tasks set list_id = 'triage' where list_id in ('today', 'week', 'month', 'eventually');
alter table public.tasks alter column list_id set default 'triage';
