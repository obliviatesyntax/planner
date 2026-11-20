// config.js — the lists and numbers that shape the page. Edit these to change it.

// Playground mode: index.html?playground runs the real app with no account and nothing saved
// (see js/playground.js). Linked from the landing page.
const PLAYGROUND = new URLSearchParams(location.search).has('playground');

// The default list. Every person has it, it's always first and can't be deleted.
// New tasks without a day/time or an @list land here, and so do unfinished tasks from past days.
const TRIAGE_LIST = { id: 'triage', name: 'triage' };

// The built-in @overdue list: where unfinished tasks from past days land each morning, so you can
// re-plan them. It only shows (first, before @triage) while it has tasks, and you can't create,
// rename, delete or drop tasks into it. Not stored in the lists table.
const OVERDUE_LIST = { id: 'overdue', name: 'overdue' };

// List names: one word after "@", letters and digits, camelCase welcome ("@upcomingE", "@weekly").
const LIST_NAME = /^[A-Za-z][A-Za-z0-9]{0,29}$/;

// Priorities. Colours live in styles.css (.p1 / .p2 / .p3). A task can also have none (0 / null).
const PRIORITIES = {
  0: 'No priority',
  1: 'P1 · must do',
  2: 'P2 · should do',
  3: 'P3 · nice to have',
};

// The calendar in the Plan section.
const CALENDAR = {
  startHour: 0,          // the grid covers the whole day (scroll to see it all)…
  endHour: 24,
  slotMinutes: 30,       // one grid line every 30 minutes
  slotPx: 22,            // height of one slot in pixels
  snapMinutes: 15,       // dropped/resized blocks snap to 15 minutes
  // …but the visible window runs from 30 min before the earliest task still on the calendar to
  // 30 min after the last one, between minHours (a setting, default 4) and maxHours (8). With no
  // tasks it starts an hour before now (or 8 AM on other days). See viewWindow in planner.js.
  view: { beforeNow: 60, maxHours: 8 },
};

// The Plan section's views.
const PLAN_VIEWS = [
  { id: 'cal1', label: '1 day', days: 1 },
  { id: 'cal2', label: '2 days', days: 2 },
  { id: 'week', label: 'Week',   days: 7 },
  { id: 'list', label: 'List' },
];

// The List view shows this many days back (done tasks) and ahead.
const LIST_VIEW_DAYS = { back: 7, ahead: 21 };

// New labels take the next colour from this list.
const LABEL_COLORS = ['#5f3dc4', '#2b8a3e', '#1971c2', '#c2255c', '#e8590c', '#0c8599', '#5c940d', '#862e9c'];
