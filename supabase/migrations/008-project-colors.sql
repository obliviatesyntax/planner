-- 008: project colours instead of labels.
-- Run once in Supabase → SQL editor. Safe to run twice. Changes no existing rows.

-- A project's colour (a hex like '#14b8a6', or null = white, the default). It tints the project's
-- list and every card of its tasks.
alter table public.lists add column if not exists color text;

-- Labels were removed from Planner (Nov 2026). The app no longer reads or writes
-- public.labels, tasks.labels or lists.label_id; they're left in place so nothing is lost.
-- Once you're sure you won't want them back, you can remove them with:
--   drop table if exists public.labels;
--   alter table public.tasks drop column if exists labels;
--   alter table public.lists drop column if exists label_id;
