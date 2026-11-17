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
  startHour: 6,          // first hour shown
  endHour: 24,           // last hour shown (24 = midnight)
  slotMinutes: 30,       // one grid line every 30 minutes
  snapMinutes: 15,       // dropped/resized blocks snap to 15 minutes
  defaultDuration: 30,   // a task dropped on the calendar starts 30 minutes long
  // Two sizes. Compact (small slots, short box) until you start giving tasks times;
  // roomy once any task in the last two weeks or on the days shown has a time.
  compact: { slotPx: 12, maxHeight: 200 },
  roomy:   { slotPx: 22, maxHeight: 420 },
};

// How many day columns the top section shows: the short view (today + tomorrow) or a full week.
const DAY_VIEWS = { short: 2, week: 7 };

// New labels take the next colour from this list.
const LABEL_COLORS = ['#5f3dc4', '#2b8a3e', '#1971c2', '#c2255c', '#e8590c', '#0c8599', '#5c940d', '#862e9c'];
