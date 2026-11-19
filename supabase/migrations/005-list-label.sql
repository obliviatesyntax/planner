-- 005-list-label.sql — run ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Lets each list have one label (e.g. @kitchenReno → #p). A task moved from the list onto a day
-- or a time gets that label.

alter table public.lists add column if not exists label_id text;
