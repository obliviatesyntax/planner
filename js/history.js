// history.js — the full Done log (its own page, at #done): what you finished each day,
// plus a 5-week strip and your streak.

const History = (() => {
  const root = document.getElementById('history-view');
  const DAYS_IN_STRIP = 35;

  function render() {
    const days = Tasks.doneByDay();
    const countByDay = {};
    days.forEach(d => { countByDay[d.day] = d.tasks.length; });

    const strip = [];
    for (let i = DAYS_IN_STRIP - 1; i >= 0; i--) {
      const iso = addDays(todayISO(), -i);
      strip.push({ iso, n: countByDay[iso] || 0 });
    }

    root.innerHTML = `
      <div class="history">
        <a href="#" class="back-link">← Back to planner</a>
        <h2>Done log</h2>
        <div class="history-summary">
          <div>
            <div class="big">${streak(countByDay)}</div>
            <div class="muted">day streak</div>
          </div>
          <div>
            <div class="big">${strip.slice(-7).reduce((s, d) => s + d.n, 0)}</div>
            <div class="muted">done in last 7 days</div>
          </div>
          <div class="heat" title="Last 5 weeks">
            ${strip.map(d => `<div class="heat-cell l${level(d.n)} ${d.iso === todayISO() ? 'is-today' : ''}" title="${formatDay(d.iso)}: ${d.n} done"></div>`).join('')}
          </div>
        </div>

        ${days.length ? days.map(dayHtml).join('') : '<p class="empty">Nothing done yet. Tick off a planned task and it shows up here.</p>'}
      </div>`;
  }

  function dayHtml({ day, tasks }) {
    return `<div class="day">
      <h3>${day === todayISO() ? 'Today · ' : ''}${formatDay(day)} <span class="count">${tasks.length} done</span></h3>
      <ul>
        ${tasks.map(t => `
          <li class="p${t.priority}">
            <span class="dot"></span>
            <span class="t">${escapeHtml(t.title)}</span>
            ${Labels.tagsHtml(t)}
            <button type="button" class="undo" data-id="${t.id}" title="Mark as not done">undo</button>
          </li>`).join('')}
      </ul>
    </div>`;
  }

  // 0 / 1 / 2-3 / 4-5 / 6+ tasks -> shade 0..4
  function level(n) {
    if (n === 0) return 0;
    if (n === 1) return 1;
    if (n <= 3) return 2;
    if (n <= 5) return 3;
    return 4;
  }

  // Consecutive days with at least one task done, ending today (or yesterday if today is still empty).
  function streak(countByDay) {
    let day = todayISO();
    if (!countByDay[day]) day = addDays(day, -1);
    let n = 0;
    while (countByDay[day]) { n++; day = addDays(day, -1); }
    return n;
  }

  root.addEventListener('click', e => {
    if (e.target.matches('.undo')) Tasks.toggleDone(e.target.dataset.id);
  });

  return { render };
})();
