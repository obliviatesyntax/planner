// config.js — the lists and numbers that shape the page. Edit these to change it.

// The default list. Every person has it, it's always first and can't be deleted.
// New tasks without a day/time or an @list land here, and so do unfinished tasks from past days.
const TRIAGE_LIST = { id: 'triage', name: 'triage' };

// List names: one word after "@", letters and digits, camelCase welcome ("@upcomingE", "@weekly").
const LIST_NAME = /^[A-Za-z][A-Za-z0-9]{0,29}$/;

// Priorities. Colours live in styles.css (.p1 / .p2 / .p3).
const PRIORITIES = {
  1: 'P1 · must do',
  2: 'P2 · should do',
  3: 'P3 · nice to have',
};

// The calendar in the Plan section.
const CALENDAR = {
  startHour: 0,          // the grid covers the whole day (scroll to see it all)…
  endHour: 24,
  slotMinutes: 30,       // one grid line every 30 minutes
  slotPx: 24,            // height of one slot in pixels
  snapMinutes: 15,       // dropped/resized blocks snap to 15 minutes
  defaultDuration: 30,   // a task dropped on the calendar starts 30 minutes long
  // …but the visible window starts a little before now and is only as tall as needed:
  // enough to reach the last task coming up today, between minHours and maxHours.
  view: { beforeNow: 60, minHours: 4, maxHours: 9 },
};

// The Plan section's three views.
const PLAN_VIEWS = [
  { id: 'cal2', label: 'Calendar: 2 days', days: 2 },
  { id: 'week', label: 'Calendar: Week',   days: 7 },
  { id: 'list', label: 'List' },
];

// The List view shows this many days back (done tasks) and ahead.
const LIST_VIEW_DAYS = { back: 7, ahead: 21 };

// New labels take the next colour from this list.
const LABEL_COLORS = ['#5f3dc4', '#2b8a3e', '#1971c2', '#c2255c', '#e8590c', '#0c8599', '#5c940d', '#862e9c'];
