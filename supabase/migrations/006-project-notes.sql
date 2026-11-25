-- 006: projects. Lists are projects now: they get notes (Markdown or plain text).
-- Tasks keep their project while planned; list_id = '' means "no project".
-- Run once in Supabase → SQL editor. Safe to run twice.

alter table public.lists add column if not exists notes text;
