-- 007: archived projects, and a 30-day trash for deleted tasks.
-- Run once in Supabase → SQL editor. Safe to run twice. Changes no existing rows.

-- A project can be archived (projects are never deleted): it and its unfinished tasks leave the
-- Dashboard and the plan; everything is kept (Settings → Archive & trash).
alter table public.lists add column if not exists archived boolean not null default false;

-- Deleting a task moves it to the trash (deleted_at set) for 30 days, then the app removes it for good.
alter table public.tasks add column if not exists deleted_at timestamptz;
