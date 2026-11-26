# Planner

A daily planner on one page:

- **Top: Plan.** Four views: **1 day** (to-do and a tall calendar side by side), **2 days**
  (default), **Week**, and **List** (days scrolling down, with times shown). Each day has a **to-do list** and a **calendar**. Tick a task, or
  drag it onto **Done today**, to complete it. Past days show only what was done (crossed out), so
  going back on the calendar *is* the done log. Unfinished tasks from past days show under **Overdue** (above Done today, only while there are
  some; not a list: they keep their day and time until you re-plan them). A setting can roll them into the next day instead.
- **Bottom: Lists = projects.** **@triage** (always first; the inbox, not a project) plus your projects, like
  **@weekly** or **@kitchenReno**. New tasks without a day land in @triage. A task **keeps its project while
  it's planned** on a day (a triage task doesn't: the inbox isn't a project); it changes project only when
  dragged into another list, set in the task window's Project row, or typed as "… tomorrow @project".
  Each list shows its waiting tasks plus "N planned". Click a list's name for the **project page**
  (`#project/<name>`, `js/project.js`): its notes (Markdown when it looks like Markdown, with @project
  links; bullet lines that are tasks show where they are, e.g. "Planned tomorrow 6 PM"; others can be
  added as tasks, one-way, and the notes text is never changed), tasks not planned / planned / done
  (latest 3, "Show all"), and a header that edits in place (rename, a colour that tints its list and tasks,
  delete). The ▾ by the name, or G / ⌘K, switches projects.
- **Settings** (header): default view, where unfinished tasks go at day end (@triage or the next
  day), week start, 12/24-hour time, minimum calendar height, new task length and priority.
  Saved on the account (Supabase user metadata), so they follow you across devices.
- **Project colours:** white by default; pick one of 9 colours on a project's page and its list and
  all its tasks' cards are tinted with it. (Labels were removed in Nov 2026.)

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
    "priority one" for `p1`; the text appears in the box, press Enter.
  - Neither: it goes to **@triage**. Also: `p1 p2 p3` priority (none by default).
  - Parts of the day go with the day: `dentist tomorrow morning at 10AM` ("Morning yoga" stays as typed).
- **+ Add** under a day or list adds straight there; **click an empty calendar spot** to add at that
  time. The calendar shows from an hour before now (blue line) to today's last upcoming task;
  scroll for more, or click the "▲ earlier / ▼ later" pills.
- **Drag** tasks between lists, days, times, "Done today" and past days (= done on that day).
  On phones, a bar with Today · Tomorrow · @triage · Done slides up while dragging; or swipe a task
  right (done) or left (next day / today).
  Drag a calendar block's bottom edge to change its length.
- **Click a task** to open it: move it (Today / Tomorrow / a date, an optional time and length, or a list),
  rename it, write a description, set priority, delete it.
  Hover a task for quick buttons: **P** / **#** / **×**, or click its P1/P2/P3 tag to change priority.

## Use Planner from Claude, ChatGPT or Gemini (MCP)

`supabase/functions/mcp/` is an MCP server: AI apps can read and change your Planner through
it. It lives at `https://eiwoavnrsdnffiztwziq.supabase.co/functions/v1/mcp`.

- **For users:** "Connect AI apps" in the app's footer (and "How to connect" on the landing page)
  opens step-by-step instructions for each app (`#connect-dialog` in `index.html`, `js/connect.js`).
- **Status:** tested with Claude. ChatGPT and Gemini follow the same standard, but haven't been
  tried yet. Gemini only allows custom apps in the US (18+, personal Google account, English).
- **Tools.** Reading: `get_plan`, `get_lists`, `search_tasks`, `get_task`. Changing: `add_task`,
  `update_task`, `move_task`, `complete_task`, `uncomplete_task`, `delete_task`, `create_list`,
  `rename_list`, `set_list_color`, `archive_list`. Each tool is
  marked as reading, changing or deleting, and AI apps use that to ask the user before changes.
  Built for few calls: `get_plan` returns the date and time, the plan and every list in one go;
  dates can be words ("next friday"); `add_task` takes several tasks, and move/complete/delete take
  several ids (or `from_list`), so the user confirms once per request, not once per task.
- **Rules:** the same as `js/tasks.js`. Keep the two in step; `planner.ts` lists which functions match.
- **Sign-in:**
  - Supabase Auth is the OAuth server (dashboard → Authentication → OAuth Server: on, dynamic
    client registration on, Authorization Path `/planner/index.html`).
  - The AI app registers itself and sends the user to `index.html?authorization_id=…`, where
    `js/consent.js` shows "Allow … to use your Planner?".
  - The resulting token reads and writes the database as that user, so row-level security keeps
    everyone to their own tasks. No admin key is used.
- **Time zone:** the app saves the user's time zone on their account, so "today" is right.
- **Known gap:** a Planner tab that's already open doesn't see changes made from an AI app until
  it's reloaded. Reload before editing in the app.
- **Test it:** `deno test supabase/functions/mcp`
- **Deploy it:** `supabase functions deploy mcp --project-ref eiwoavnrsdnffiztwziq --no-verify-jwt --use-api`

## Docs

Design and internal docs live in a separate private repo: `git@github.com:obliviatesyntax/planner-docs.git`.

## Code map (read in this order)

| File | What it does |
|---|---|
| `js/config.js` | @triage, priorities, calendar sizes, plan views, project colours. Change the page's shape here. |
| `js/utils.js` | Date, time and text helpers. |
| `js/when.js` | Reads days and times from plain English for quick add ("today 5pm"). |
| `js/landing.js` | The signed-out landing page: buttons that open the sign-in card, the typing demo. (Page text is in `index.html`.) |
| `js/playground.js` | The interactive preview ("playground mode" in the code), `index.html?playground` (linked from the landing page): the same page and code, with no account and no database. Swaps in a pretend sign-in and an in-memory store seeded with the landing demo's tasks; nothing is saved. Elements with `pg-only` show only in this mode, `pg-hide` ones hide. |
| `supabase/functions/mcp/` | The MCP server for Claude, ChatGPT and Gemini: `planner.ts` (tools, rules and protocol), `index.ts` (start-up), `planner_test.ts`. Its rules match `js/tasks.js`. |
| `js/project.js` | A project's page (`#project/<name>`): notes (Markdown via marked + DOMPurify, @project links, list lines → tasks), and its tasks not planned / planned / done. |
| `js/consent.js`, `js/connect.js` | "Allow … to use your Planner?" (the sign-in step for AI apps), and the "Connect AI apps" instructions window. |
| `js/help.js` | The **i** button next to quick add: "Adding tasks" help (examples live in `index.html`). |
| `js/voice.js` | Mic button: speech to text (browser built-in), spoken "list weekly" → `@weekly` etc. |
| `js/supabase-config.js` | Which Supabase project to use (URL + public key), code-or-link switch. |
| `js/auth.js` | Sign-in screen: Sign in / Create account tabs, Google/Apple/Facebook (shown when enabled in Supabase), password, emailed link, forgot password. |
| `js/store.js` | **Where data is saved:** loads from and saves changes to the Supabase tables. |
| `js/tasks.js` | Tasks, lists and every action (add, move, done…). Data model documented at top. |
| `js/taskview.js` | The task window (click a task): move it (day / time / list), rename, description, priority, delete. |
| `js/cards.js` | How a task looks; checkbox, priority, delete, rename. |
| `js/planner.js` | Top section: calendar and list views, past days' done tasks, Done today. |
| `js/lists.js` | Bottom section: @triage and your lists; create, reorder, delete. |
| `js/settings.js` | Per-person settings and the Settings window. Add new settings here. |
| `js/swipe.js` | Touch screens: swipe right = done, swipe left = next day (or today, for list tasks). |
| `js/dnd.js` | Drag and drop: tasks between lists, days, times and done; reordering lists. |
| `js/app.js` | Quick add, page switching, header, backup, toast, start-up. |
| `styles.css` | All styling; colours are variables at the top. |
| `supabase/schema.sql` | Full database setup for a fresh install (wipes data). |
| `supabase/migrations/` | Upgrades for an existing database, run in order (keep your data): 002 lists, 003 optional priority, 004 description, 005 list labels, 006 project notes, 007 archive & trash, 008 project colours. |
| `supabase/functions/delete-account/` | Settings → Delete my account: deletes the signed-in user (and, by cascade, their data). |
| `js/md-editor.js` | The notes toolbar + Write/Preview; loaded only when a project page opens (not in index.html). |
| `manifest.webmanifest`, `sw.js`, `icons/` | The installable app: manifest (with a share target), service worker (network first, offline fallback), icons. |
| `about.html`, `privacy.html` | About and Privacy pages (placeholder contact: hello@planner.example). |

Plain JavaScript loaded with `<script>` tags — no framework, nothing to build while you work.
When you push to `main`, a GitHub Action (`.github/workflows/pages.yml`) publishes the site with
the `js/` files joined into one (`tools/build.py`), so it loads with one request instead of 24.
