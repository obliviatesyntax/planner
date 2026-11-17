-- schema.sql — run this ONCE in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- One table, one row per task. Same fields as the task model at the top of js/tasks.js,
-- plus user_id so every person only ever sees their own tasks.

create table if not exists public.tasks (
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  id          text        not null,                 -- the app's own task id, e.g. "lq3k9a2x"
  title       text        not null,
  area        text        not null check (area in ('work', 'personal')),
  priority    smallint    not null check (priority in (1, 2, 3)),
  bucket      text        not null,                 -- today / next3 / week / nextweek / month / later
  sort_order  integer     not null default 0,       -- "order" in the app ("order" is a reserved word in SQL)
  created_at  timestamptz not null default now(),
  done_on     date,                                 -- null = not done yet
  primary key (user_id, id)
);

-- Row Level Security: the database itself refuses to show or change anyone else's rows,
-- even though the app's public key is visible in the browser.
alter table public.tasks enable row level security;

drop policy if exists "Users manage their own tasks" on public.tasks;
create policy "Users manage their own tasks" on public.tasks
  for all
  to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
