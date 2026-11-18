-- 004-description.sql — run ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Adds a description (free-form notes) to tasks, written in the task window (click a task).

alter table public.tasks add column if not exists notes text;
