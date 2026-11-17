// when.js — reads a day and time out of plain English, for quick add.
//
//   "Setup dentist appointment today 5PM"   → today, 5:00 PM, title "Setup dentist appointment"
//   "Call mom tomorrow"                     → tomorrow's to-do list (no time)
//   "Standup at 9:30am"                     → today, 9:30 AM
//   "Gym friday 6-7pm"                      → this Friday, 6:00–7:00 PM
//   "Review doc on nov 20 at 14:00 for 1h"  → Nov 20, 2:00 PM, 60 minutes
//
// Understands:
//   days:      today, tonight, tomorrow (tmrw, tmr), monday…sunday (mon, tue, wed, thu, fri),
//              "next friday", "nov 20", "20 nov"
//   times:     5pm, 5 PM, 5:30pm, 17:00, noon, ranges like 5-6pm or 5pm to 6:30pm
//   length:    "for 45 min", "for 1h", "for 1.5 hours"
//   connectors "at", "on", "from" in front of these are removed too.
// A time without a day means today. Numbers without am/pm or a colon ("buy 2 apples") are left alone.

const When = (() => {
  const WEEKDAYS = {
    sunday: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6,
  };
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const END = `(?=[\\s,.!?]|$)`;   // a word must end here (so "today's" or "5pmish" don't match)

  // "5", "30", "pm" -> minutes after midnight (null if impossible)
  function toMinutes(h, m, ampm) {
    h = Number(h); m = Number(m || 0);
    if (m > 59) return null;
    if (ampm) {
      if (h < 1 || h > 12) return null;
      ampm = ampm.toLowerCase();
      if (ampm === 'pm' && h !== 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    } else if (h > 23) return null;
    return h * 60 + m;
  }

  function parse(input) {
    let text = ` ${input} `;
    let date = null, startMin = null, duration = null;

    // Replace the first match of `re` with a space if `fn` accepts it (returns something other than false).
    const take = (re, fn) => {
      let done = false;
      text = text.replace(re, (...m) => {
        if (done || fn(...m) === false) return m[0];
        done = true;
        return ' ';
      });
    };

    // ---- times -------------------------------------------------------------
    // ranges: 5-6pm, 5pm-6:30pm, 10am to 12pm
    take(new RegExp(`\\s(?:at\\s+|from\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:-|–|to)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)${END}`, 'i'),
      (_, h1, m1, ap1, h2, m2, ap2) => {
        let s = toMinutes(h1, m1, ap1 || ap2);
        const e = toMinutes(h2, m2, ap2);
        if (s == null || e == null) return false;
        if (!ap1 && s >= e && s - 12 * 60 >= 0) s -= 12 * 60;   // "11-1pm" means 11am to 1pm
        if (e <= s) return false;
        startMin = s; duration = e - s;
      });
    // 5pm, 5:30 pm
    if (startMin == null) take(new RegExp(`\\s(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)${END}`, 'i'),
      (_, h, m, ap) => { const t = toMinutes(h, m, ap); if (t == null) return false; startMin = t; });
    // 17:00, 9:30
    if (startMin == null) take(new RegExp(`\\s(?:at\\s+)?(\\d{1,2}):(\\d{2})${END}`, 'i'),
      (_, h, m) => { const t = toMinutes(h, m); if (t == null) return false; startMin = t; });
    // noon, midday
    if (startMin == null) take(new RegExp(`\\s(?:at\\s+)?(noon|midday)${END}`, 'i'), () => { startMin = 12 * 60; });

    // ---- length --------------------------------------------------------------
    take(new RegExp(`\\sfor\\s+(\\d+(?:\\.\\d+)?)\\s*(h|hrs?|hours?|m|mins?|minutes?)${END}`, 'i'), (_, n, unit) => {
      duration = Math.round(Number(n) * (unit[0].toLowerCase() === 'h' ? 60 : 1));
      if (!duration) return false;
    });

    // ---- days ----------------------------------------------------------------
    const today = todayISO();
    take(new RegExp(`\\s(?:on\\s+)?(today|tonight)${END}`, 'i'), () => { date = today; });
    if (!date) take(new RegExp(`\\s(?:on\\s+)?(tomorrow|tmrw|tmr)${END}`, 'i'), () => { date = addDays(today, 1); });
    if (!date) take(new RegExp(`\\s(?:on\\s+)?(next\\s+|this\\s+)?(${Object.keys(WEEKDAYS).join('|')})${END}`, 'i'), (_, which, day) => {
      let ahead = (WEEKDAYS[day.toLowerCase()] - fromISO(today).getDay() + 7) % 7;
      if (ahead === 0 && which && /next/i.test(which)) ahead = 7;
      date = addDays(today, ahead);
    });
    if (!date) take(new RegExp(`\\s(?:on\\s+)?(?:${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE})${END}`, 'i'),
      (_, mon1, d1, d2, mon2) => {
        const month = MONTHS.indexOf((mon1 || mon2).slice(0, 3).toLowerCase());
        const day = Number(d1 || d2);
        const now = fromISO(today);
        let candidate = new Date(now.getFullYear(), month, day);
        if (candidate.getMonth() !== month) return false;                 // e.g. "feb 31"
        if (toISO(candidate) < today) candidate = new Date(now.getFullYear() + 1, month, day);
        date = toISO(candidate);
      });

    if (startMin != null && !date) date = today;   // "5pm" alone means today
    if (startMin == null) duration = null;          // a length only matters on the calendar

    return { title: text.replace(/\s+/g, ' ').trim(), date, startMin, duration };
  }

  // "Today, 5:00 PM" / "Fri, Nov 20" — for the confirmation message.
  function describe({ date, startMin, duration }) {
    const day = date === todayISO() ? 'Today' : date === addDays(todayISO(), 1) ? 'Tomorrow' : formatDay(date);
    if (startMin == null) return `${day}'s to-do list`;
    return `${day}, ${formatTime(startMin)}${duration ? `–${formatTime(startMin + duration)}` : ''}`;
  }

  return { parse, describe };
})();
