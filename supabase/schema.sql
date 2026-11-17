-- schema.sql — run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- ⚠ Version 2 STARTS FRESH: it deletes the old `tasks` table (and every task in it) and
-- creates the new tables. Safe to run again later only if you want to wipe everything.
--
-- Two tables, both private per person (Row Level Security at the bottom):
--   labels — the filter chips at the top ("Work #w", "Personal #p", …)
--   tasks  — every task, wherever it lives (triage, a day's plan, a calendar slot, done)

drop table if exists public.tasks;
drop table if exists public.labels;

create table public.labels (
  user_id     uuid    not null default auth.uid() references auth.users on delete cascade,
  id          text    not null,
  name        text    not null,                    -- "Personal"
  shortcut    text    not null,                    -- "p"  → type #p in quick add
  color       text    not null,                    -- "#2b8a3e"
  sort_order  integer not null default 0,
  primary key (user_id, id)
);

create table public.tasks (
  user_id      uuid        not null default auth.uid() references auth.users on delete cascade,
  id           text        not null,               -- the app's own task id, e.g. "lq3k9a2x"
  title        text        not null,
  priority     smallint    not null check (priority in (1, 2, 3)),
  labels       text[]      not null default '{}',  -- label ids
  bucket       text        not null default 'today', -- triage bucket: today / week / month / eventually
  plan_date    date,                               -- null = still in triage; set = committed to that day
  start_min    integer,                            -- minutes after midnight on the calendar; null = in the day's plan list
  duration_min integer     not null default 30,    -- length of the calendar block
  sort_order   integer     not null default 0,     -- position inside its list
  created_at   timestamptz not null default now(),
  done_on      date,                               -- null = not done yet
  primary key (user_id, id)
);

-- Row Level Security: the database itself refuses to show or change anyone else's rows,
-- even though the app's public key is visible in the browser.
alter table public.labels enable row level security;
alter table public.tasks  enable row level security;

create policy "Users manage their own labels" on public.labels
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users manage their own tasks" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
