-- schema.sql — run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- ⚠ This is the FULL schema for a fresh install: it deletes existing tables (and every task)
-- and creates them again. To upgrade an existing database without losing tasks, run the
-- files in supabase/migrations/ instead.
--
-- Three tables, all private per person (Row Level Security at the bottom):
--   lists  — the lists in the bottom section (@triage, @weekly, …)
--   labels — the filter chips at the top ("Work #w", "Personal #p", …)
--   tasks  — every task, wherever it lives (a list, a day's to-do, a calendar slot, done)

drop table if exists public.tasks;
drop table if exists public.lists;
drop table if exists public.labels;

create table public.lists (
  user_id     uuid    not null default auth.uid() references auth.users on delete cascade,
  id          text    not null,                    -- "triage" for the built-in list
  name        text    not null,                    -- "weekly"  → shown as @weekly
  sort_order  integer not null default 0,
  primary key (user_id, id)
);

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
  list_id      text        not null default 'triage', -- the list it sits in while not planned
  plan_date    date,                               -- null = in its list; set = committed to that day
  start_min    integer,                            -- minutes after midnight on the calendar; null = in the day's plan list
  duration_min integer     not null default 30,    -- length of the calendar block
  sort_order   integer     not null default 0,     -- position inside its list
  created_at   timestamptz not null default now(),
  done_on      date,                               -- null = not done yet
  primary key (user_id, id)
);

-- Row Level Security: the database itself refuses to show or change anyone else's rows,
-- even though the app's public key is visible in the browser.
alter table public.lists  enable row level security;
alter table public.labels enable row level security;
alter table public.tasks  enable row level security;

create policy "Users manage their own lists" on public.lists
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users manage their own labels" on public.labels
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users manage their own tasks" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
