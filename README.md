# Planner

A daily planner on one page:

- **Top: Plan.** Today and tomorrow (or a full week): each day has a **to-do list** and a
  **calendar** with time slots. Tick tasks off here; they move to **Done today** on the right.
  Unfinished tasks from past days roll into today's list automatically.
- **Bottom: Triage.** Every new task lands here first, in **Today / This week / This month /
  Eventually**. Drag it up to a day or a time when you commit to it.
- **Labels** (top chips): create your own (e.g. *Work #w*, *Personal #p*). Click chips to show only
  those labels' tasks; **All** shows everything.
- **Done log** (its own page): everything you've finished, by day, with a streak.

## Run it

Tasks are saved in Supabase (Postgres), one private list per signed-in person.

- **Signing in:** email + password, or email sign-in (no password). **Create account** emails you
  first to confirm the address, then saves the password. It also gives a password to accounts made
  by email sign-in, and resets a forgotten one.
- **Code or link?** `EMAIL_HAS_CODE` in `js/supabase-config.js`. `false` (now): the email has a link
  only (Supabase's built-in sender). `true`: after setting up custom SMTP and adding `{{ .Token }}` to
  the Magic Link template, the email also has a 6-digit code to type in, which works from a local file.
- **Online:** open the deployed site.
- **Locally:** just double-click `index.html` and sign in with the emailed code (the link in the
  email can't open a file on disk, so use the code). `python3 -m http.server 8080` also works.

One-time setup: create a Supabase project, run `supabase/schema.sql` in its SQL Editor,
put the project URL and publishable key in `js/supabase-config.js`, and add your site's
address(es) under Authentication → URL Configuration, and make the Magic Link email template
contain both `{{ .Token }}` (the code) and `{{ .ConfirmationURL }}` (the link).

## Using it

- **Quick add** (or press `N`): type and hit Enter.
  - With a day/time in plain English it goes on the **plan**: `Setup dentist appointment today 5PM`,
    `Call mom tomorrow`, `Gym fri 6-7pm`, `Review doc nov 20 at 14:00 for 1h` (see `js/when.js`).
  - Otherwise, or with `@today @week @month @eventually`, it goes to **triage**.
  - Also: `!1 !2 !3` priority · `#` + a label's shortcut (several allowed).
- **Drag** any task between triage buckets, a day's to-do list and the calendar. Drag a calendar
  block's bottom edge to change its length.
- **+ Add** under a day's to-do list adds straight to that day; **click an empty calendar spot** to
  add a task at that time. The calendar shows from an hour before now (blue line) down to today's
  last upcoming task (3–8 hours); scroll for more, or click the "▲ earlier / ▼ later" pills.
- Today's calendar tasks that ended over 2 hours ago without being ticked off move to today's to-do list.
- **Labels on existing tasks:** hover a task and click **#** (or click one of its tags) to tick labels
  on/off or create a new one. Typing `#p` or `!1` while renaming a task works too.
- **Click P1/P2/P3** to cycle priority · **double-click** a title to rename · **×** deletes (triage and to-do lists).

## Code map (read in this order)

| File | What it does |
|---|---|
| `js/config.js` | Triage buckets, priorities, calendar hours, label colours. Change the page's shape here. |
| `js/utils.js` | Date, time and text helpers. |
| `js/when.js` | Reads days and times from plain English for quick add ("today 5pm"). |
| `js/supabase-config.js` | Which Supabase project to use (URL + public key), code-or-link switch. |
| `js/auth.js` | Sign in (password or emailed link/code), create account, sign out. |
| `js/store.js` | **Where data is saved:** loads from and saves changes to the Supabase tables. |
| `js/tasks.js` | Tasks + labels and every action (add, move, done…). Data model documented at top. |
| `js/labels.js` | Label chips: filter, create, delete. |
| `js/cards.js` | How a task looks; checkbox, priority, delete, rename. |
| `js/planner.js` | Top section: day columns, to-do lists, calendar, Done today. |
| `js/dnd.js` | Drag and drop between triage, lists and calendar. |
| `js/triage.js` | Bottom section: the four triage buckets. |
| `js/history.js` | Done log page (`#done`): by day, streak, 5-week strip. |
| `js/app.js` | Quick add, page switching, header, backup, toast, start-up. |
| `styles.css` | All styling; colours are variables at the top. |
| `supabase/schema.sql` | The database tables and the rules that keep each person's data private. |

Plain JavaScript loaded with `<script>` tags — no framework, no build step.
