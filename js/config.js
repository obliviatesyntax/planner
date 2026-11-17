// config.js — the lists that define the board. Edit these to change columns, lanes or priorities.

// Columns (time horizons), left to right. `aliases` are extra words accepted after "@" in quick add.
const BUCKETS = [
  { id: 'today',    label: 'Today',         aliases: ['t', 'tod'] },
  { id: 'next3',    label: 'Next few days', aliases: ['next', 'soon', '3'] },
  { id: 'week',     label: 'This week',     aliases: ['wk', 'thisweek'] },
  { id: 'nextweek', label: 'Next week',     aliases: ['nw'] },
  { id: 'month',    label: 'This month',    aliases: ['m', 'mo'] },
  { id: 'later',    label: 'Later',         aliases: ['l', 'someday', 'longterm'] },
];

// Rows (swimlanes).
const AREAS = [
  { id: 'work',     label: 'Work' },
  { id: 'personal', label: 'Personal' },
];

// Priorities. Colours live in styles.css (.p1 / .p2 / .p3).
const PRIORITIES = {
  1: 'P1 · must do',
  2: 'P2 · should do',
  3: 'P3 · nice to have',
};
