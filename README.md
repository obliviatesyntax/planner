# Planner

A daily planner on one page:

- **Top: Plan.** Four views: **1 day** (to-do and a tall calendar side by side), **2 days**
  (default), **Week**, and **List** (days scrolling down, with times shown). Each day has a **to-do list** and a **calendar**. Tick a task, or
  drag it onto **Done today**, to complete it. Past days show only what was done (crossed out), so
  going back on the calendar *is* the done log. Unfinished tasks from past days go to **@overdue** (a built-in list shown first, only while it has
  tasks; re-plan them and it disappears). A setting can roll them into the next day instead.
- **Bottom: Lists.** **@triage** (always first) plus your own lists, like **@weekly** or **@upcomingE**.
  New tasks without a day land in @triage. Drag a list's header to reorder; click it to rename it, give it
  a label (e.g. @kitchenReno → #p: tasks moved from it onto a day get #p), or delete it (with its tasks, Undo).
- **Settings** (header): default view, where unfinished tasks go at day end (@triage or the next
  day), week start, 12/24-hour time, minimum calendar height, new task length and priority.
  Saved on the account (Supabase user metadata), so they follow you across devices.
- **Labels** (top chips): create your own (e.g. *Work #w*, *Personal #p*). Click chips to show only
  those labels' tasks; **All** shows everything.

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

- **Quick add** (or press `N`): type and hit Enter. The **i** button (or `?`) shows every way to add.
  - A day/time in plain English puts it on the **plan**: `Setup dentist appointment today 5PM`,
    `Call mom tomorrow`, `Gym fri 6-7pm`, `Review doc nov 20 at 14:00 for 1h` (see `js/when.js`).
  - `@listName` puts it in that list, creating the list if needed: `Renew passport @weekly`.
    (One word; camelCase is fine. An @list wins over a day/time.)
  - **Mic button:** speak instead of typing (Chrome, Edge, Safari). Say "list weekly" for `@weekly`,
    "label personal" for `#p`, "priority one" for `p1`; the text appears in the box, press Enter.
  - Neither: it goes to **@triage**. Also: `p1 p2 p3` priority (none by default) · `#` + a label's shortcut.
  - Parts of the day go with the day: `dentist tomorrow morning at 10AM` ("Morning yoga" stays as typed).
- **+ Add** under a day or list adds straight there; **click an empty calendar spot** to add at that
  time. The calendar shows from an hour before now (blue line) to today's last upcoming task;
  scroll for more, or click the "▲ earlier / ▼ later" pills.
- **Drag** tasks between lists, days, times, "Done today" and past days (= done on that day).
  On phones, a bar with Today · Tomorrow · @triage · Done slides up while dragging; or swipe a task
  right (done) or left (next day / today).
  Drag a calendar block's bottom edge to change its length.
- **Click a task** to open it: move it (Today / Tomorrow / a date, an optional time and length, or a list),
  rename it, write a description, set priority and labels, delete it.
  Hover a task for quick buttons: **P** / **#** / **×**, or click its P1/P2/P3 tag to change priority.

## Docs

- [`docs/ui-mobile-vs-desktop.md`](docs/ui-mobile-vs-desktop.md): how the app and landing page differ on phones and
  computers, the breakpoints, and a checklist for new features.

## Code map (read in this order)

| File | What it does |
|---|---|
| `js/config.js` | @triage, priorities, calendar sizes, plan views, label colours. Change the page's shape here. |
| `js/utils.js` | Date, time and text helpers. |
| `js/when.js` | Reads days and times from plain English for quick add ("today 5pm"). |
| `js/landing.js` | The signed-out landing page: buttons that open the sign-in card, the typing demo. (Page text is in `index.html`.) |
| `js/help.js` | The **i** button next to quick add: "Adding tasks" help (examples live in `index.html`). |
| `js/voice.js` | Mic button: speech to text (browser built-in), spoken "list weekly" → `@weekly` etc. |
| `js/supabase-config.js` | Which Supabase project to use (URL + public key), code-or-link switch. |
| `js/auth.js` | Sign-in screen: Sign in / Create account tabs, Google/Apple/Facebook (shown when enabled in Supabase), password, emailed link, forgot password. |
| `js/store.js` | **Where data is saved:** loads from and saves changes to the Supabase tables. |
| `js/tasks.js` | Tasks, lists, labels and every action (add, move, done…). Data model documented at top. |
| `js/labels.js` | Label chips: filter, create, delete. |
| `js/taskview.js` | The task window (click a task): move it (day / time / list), rename, description, priority, labels, delete. |
| `js/cards.js` | How a task looks; checkbox, priority, delete, rename. |
| `js/planner.js` | Top section: calendar and list views, past days' done tasks, Done today. |
| `js/lists.js` | Bottom section: @triage and your lists; create, reorder, delete. |
| `js/settings.js` | Per-person settings and the Settings window. Add new settings here. |
| `js/swipe.js` | Touch screens: swipe right = done, swipe left = next day (or today, for list tasks). |
| `js/dnd.js` | Drag and drop: tasks between lists, days, times and done; reordering lists. |
| `js/app.js` | Quick add, page switching, header, backup, toast, start-up. |
| `styles.css` | All styling; colours are variables at the top. |
| `supabase/schema.sql` | Full database setup for a fresh install (wipes data). |
| `supabase/migrations/` | Upgrades for an existing database, run in order (keep your data): 002 lists, 003 optional priority, 004 description, 005 list labels. |

Plain JavaScript loaded with `<script>` tags — no framework, no build step.
