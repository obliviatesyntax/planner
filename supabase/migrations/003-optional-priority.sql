-- 003-optional-priority.sql — run ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Lets a task have no priority (null) — new tasks now start without one unless you type p1/p2/p3.
-- Existing tasks keep their priority.

alter table public.tasks alter column priority drop not null;
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority is null or priority in (1, 2, 3));
