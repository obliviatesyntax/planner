// config.js — the lists and numbers that shape the page. Edit these to change it.

// Triage buckets (bottom section), left to right. `aliases` are extra words accepted after "@"
// in quick add, e.g. "Renew passport @month".
const TRIAGE = [
  { id: 'today',      label: 'Today',      aliases: ['t', 'tod'] },
  { id: 'week',       label: 'This week',  aliases: ['w', 'wk', 'thisweek'] },
  { id: 'month',      label: 'This month', aliases: ['m', 'mo'] },
  { id: 'eventually', label: 'Eventually', aliases: ['e', 'later', 'someday', 'l'] },
];

// Priorities. Colours live in styles.css (.p1 / .p2 / .p3).
const PRIORITIES = {
  1: 'P1 · must do',
  2: 'P2 · should do',
  3: 'P3 · nice to have',
};

// The calendar in the top section.
const CALENDAR = {
  startHour: 0,          // the grid covers the whole day (scroll to see it all)…
  endHour: 24,
  slotMinutes: 30,       // one grid line every 30 minutes
  slotPx: 20,            // height of one slot in pixels
  snapMinutes: 15,       // dropped/resized blocks snap to 15 minutes
  defaultDuration: 30,   // a task dropped on the calendar starts 30 minutes long
  // …but the visible window starts a little before now and is only as tall as needed:
  // enough to reach the last task coming up today, between minHours and maxHours.
  view: { beforeNow: 60, minHours: 3, maxHours: 8 },
  // Today's calendar tasks that ended more than this long ago (and aren't done) move to
  // today's to-do list.
  overdueAfter: 120,
};

// How many day columns the top section shows: the short view (today + tomorrow) or a full week.
const DAY_VIEWS = { short: 2, week: 7 };

// New labels take the next colour from this list.
const LABEL_COLORS = ['#5f3dc4', '#2b8a3e', '#1971c2', '#c2255c', '#e8590c', '#0c8599', '#5c940d', '#862e9c'];
