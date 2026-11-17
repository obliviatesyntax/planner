# Planner

A daily task board: columns are *when* (Today → Later), rows are *Work / Personal*,
colours are priority (P1 red, P2 orange, P3 blue). Tick tasks off to fill the Done log.

## Run it

Tasks are saved in Supabase (Postgres), one private list per signed-in person.

- **Signing in:** email + password, or "Email me a sign-in code" (6-digit code, or click the link in
  the same email). **Create account** emails a code first to confirm the address, then saves the
  password. It also gives a password to code-only accounts, and resets a forgotten one.
- **Online:** open the deployed site.
- **Locally:** just double-click `index.html` and sign in with the emailed code (the link in the
  email can't open a file on disk, so use the code). `python3 -m http.server 8080` also works.

One-time setup: create a Supabase project, run `supabase/schema.sql` in its SQL Editor,
put the project URL and publishable key in `js/supabase-config.js`, and add your site's
address(es) under Authentication → URL Configuration, and make the Magic Link email template
contain both `{{ .Token }}` (the code) and `{{ .ConfirmationURL }}` (the link).

## Using it

- **Quick add** (top bar, or press `N`): type and hit Enter. Shortcuts inside the text:
  `!1 !2 !3` priority · `#w #p` work/personal · `@today @next3 @week @nextweek @month @later`.
  Example: `Book dentist !1 #p @week`
- **+ Add** in any cell adds straight into that cell (stays open so you can add several).
- **Drag** a card to any cell (also moves between Work/Personal), or onto a column header.
- **Click P1/P2/P3** on a card to cycle priority · **double-click** title to rename · hover for **×** delete (with Undo).
- Done tasks stay struck-through on the board for the day, then move to the **Done log**.

## Code map (read in this order)

| File | What it does |
|---|---|
| `js/config.js` | Columns, lanes, priority labels. Change the board's shape here. |
| `js/utils.js` | Date and text helpers. |
| `js/supabase-config.js` | Which Supabase project to use (URL + public key). |
| `js/auth.js` | Sign in (password or emailed code), create account (email check, then password), sign out. |
| `js/store.js` | **Where data is saved:** loads from and saves changes to the Supabase `tasks` table. |
| `supabase/schema.sql` | The database table and the rule that keeps each person's tasks private. |
| `js/tasks.js` | The task list + every action (add, move, toggleDone…). Data model documented at top. |
| `js/board.js` | Draws the board; clicks, inline edit, drag & drop. |
| `js/history.js` | Done log, streak, 5-week strip. |
| `js/app.js` | Quick add bar, view switching, header progress, backup, toast. |
| `styles.css` | All styling; colours are variables at the top. |

Plain JavaScript loaded with `<script>` tags — no framework, no build step.
