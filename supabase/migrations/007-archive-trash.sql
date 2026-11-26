-- 007: archived projects, a 30-day trash for deleted tasks, and @triage as a normal project.
-- Run once in Supabase → SQL editor. Safe to run twice.

-- A project can be archived: hidden from the Dashboard, kept with all its tasks (Settings → Archive & trash).
alter table public.lists add column if not exists archived boolean not null default false;

-- Deleting a task moves it to the trash (deleted_at set) for 30 days, then the app removes it for good.
alter table public.tasks add column if not exists deleted_at timestamptz;

-- Every task belongs to a list now: '' used to mean "no project"; that's @triage.
update public.tasks set list_id = 'triage' where list_id = '';
