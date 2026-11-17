// planner.js — the top section: what you've committed to.
//
//   ‹ Today ›  [3 days | Week]
//   ┌──────────┬──────────┬──────────┐ ┌────────────┐
//   │ Today    │ Tomorrow │ Thu      │ │ Done today │
//   │ plan list│ plan list│ plan list│ │            │
//   ├──────────┼──────────┼──────────┤ │            │
//   │ calendar │ calendar │ calendar │ │            │
//   └──────────┴──────────┴──────────┘ └────────────┘
//
// Calendar (below) holds the time-grid maths, used here and by dnd.js.

const Calendar = (() => {
  const { startHour, endHour, slotMinutes, slotPx, snapMinutes } = CALENDAR;
  const pxPerMinute = slotPx / slotMinutes;
  const height = (endHour - startHour) * 60 * pxPerMinute;
  let resizing = null;

  // Mouse y-position inside a calendar day -> minutes after midnight, snapped.
  function minutesAt(dayEl, clientY) {
    const y = clientY - dayEl.getBoundingClientRect().top;
    const minutes = startHour * 60 + Math.round(y / pxPerMinute / snapMinutes) * snapMinutes;
    return Math.max(startHour * 60, Math.min(endHour * 60 - snapMinutes, minutes));
  }

  function blockStyle(startMin, duration) {
    return {
      top: `${(startMin - startHour * 60) * pxPerMinute}px`,
      height: `${Math.max(duration * pxPerMinute, 18)}px`,
    };
  }

  // Blocks that overlap in time sit side by side: returns { id: { col, cols } }.
  function columns(events) {
    const result = {};
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const colEnds = [];
      cluster.forEach(t => {
        let col = colEnds.findIndex(end => end <= t.startMin);
        if (col < 0) { col = colEnds.length; colEnds.push(0); }
        colEnds[col] = t.startMin + t.duration;
        result[t.id] = { col };
      });
      cluster.forEach(t => { result[t.id].cols = colEnds.length; });
      cluster = [];
    };
    events.forEach(t => {
      if (cluster.length && t.startMin >= clusterEnd) flush();
      cluster.push(t);
      clusterEnd = Math.max(clusterEnd, t.startMin + t.duration);
    });
    flush();
    return result;
  }

  function dayHtml(date) {
    const events = Tasks.calendarList(date).filter(Labels.matches);
    const cols = columns(events);
    const isToday = date === todayISO();
    const now = minutesNow();
    return `
      <div class="cal-day ${isToday ? 'is-today' : ''}" data-drop="calendar" data-date="${date}"
           style="height:${height}px; --slot:${slotPx}px">
        ${events.map(t => {
          const { top, height: h } = blockStyle(t.startMin, t.duration);
          const { col, cols: n } = cols[t.id];
          return Cards.html(t, 'calendar', `top:${top};height:${h};left:calc(${col} * 100% / ${n});width:calc(100% / ${n} - 2px)`);
        }).join('')}
        ${isToday && now >= startHour * 60 && now < endHour * 60
          ? `<div class="now-line" style="top:${(now - startHour * 60) * pxPerMinute}px"></div>` : ''}
      </div>`;
  }

  function gutterHtml() {
    let html = '';
    for (let h = startHour; h < endHour; h++) {
      html += `<div class="hour" style="top:${(h - startHour) * 60 * pxPerMinute}px">${formatTime(h * 60).replace(':00', '')}</div>`;
    }
    return `<div class="cal-gutter" style="height:${height}px">${html}</div>`;
  }

  // Drag the bottom edge of a block to change its length.
  document.addEventListener('pointerdown', e => {
    if (!e.target.matches('.event .resize')) return;
    e.preventDefault();
    const card = e.target.closest('.card');
    card.draggable = false;
    resizing = { card, id: card.dataset.task, top: card.getBoundingClientRect().top, duration: null };
  });
  document.addEventListener('pointermove', e => {
    if (!resizing) return;
    const task = Tasks.get(resizing.id);
    const minutes = Math.round((e.clientY - resizing.top) / pxPerMinute / snapMinutes) * snapMinutes;
    const duration = Math.max(snapMinutes, Math.min(endHour * 60 - task.startMin, minutes));
    resizing.duration = duration;
    resizing.card.style.height = blockStyle(task.startMin, duration).height;
    resizing.card.querySelector('.time').textContent = `${formatTime(task.startMin)}–${formatTime(task.startMin + duration)}`;
  });
  document.addEventListener('pointerup', () => {
    if (!resizing) return;
    const { id, duration } = resizing;
    resizing = null;
    if (duration) Tasks.update(id, { duration }); else App.renderAll();
  });

  return { minutesAt, blockStyle, dayHtml, gutterHtml, isResizing: () => !!resizing };
})();

const Planner = (() => {
  const root = document.getElementById('planner');
  let mode = 'short';          // 'short' (today + next days) or 'week'
  let start = todayISO();      // first day shown
  let scrolledToNow = false;

  function days() {
    return Array.from({ length: DAY_VIEWS[mode] }, (_, i) => addDays(start, i));
  }

  function dayName(date) {
    const today = todayISO();
    if (date === today) return 'Today';
    if (date === addDays(today, 1)) return 'Tomorrow';
    return fromISO(date).toLocaleDateString(undefined, { weekday: 'long' });
  }

  function render() {
    const list = days();
    const today = todayISO();
    const done = Tasks.doneList(today).filter(Labels.matches);
    const scroller = root.querySelector('.cal-scroll');
    const scrollTop = scroller ? scroller.scrollTop : null;

    root.innerHTML = `
      <div class="section-head">
        <h2>Plan</h2>
        <div class="day-nav">
          <button type="button" data-nav="-1" title="Earlier">‹</button>
          <button type="button" data-nav="0">Today</button>
          <button type="button" data-nav="1" title="Later">›</button>
          <span class="muted">${formatDay(list[0])} – ${formatDay(list[list.length - 1])}</span>
        </div>
        <div class="seg">
          <button type="button" data-mode="short" class="${mode === 'short' ? 'active' : ''}">${DAY_VIEWS.short} days</button>
          <button type="button" data-mode="week" class="${mode === 'week' ? 'active' : ''}">Week</button>
        </div>
      </div>

      <div class="plan-layout">
        <div class="plan-days" style="--days:${list.length}">
          <div class="plan-grid">
            <div></div>
            ${list.map(d => `
              <div class="day-head ${d === today ? 'is-today' : ''} ${d < today ? 'is-past' : ''}">
                <b>${dayName(d)}</b> <span class="muted">${formatDay(d).replace(/^\w+, /, '')}</span>
              </div>`).join('')}
            <div class="row-label">To do</div>
            ${list.map(d => `
              <div class="list plan-list ${d === today ? 'is-today' : ''}" data-drop="plan" data-date="${d}">${
                Tasks.planList(d).filter(Labels.matches).map(t => Cards.html(t, 'plan')).join('')
              }</div>`).join('')}
          </div>
          <div class="cal-scroll">
            <div class="plan-grid cal-grid">
              ${Calendar.gutterHtml()}
              ${list.map(Calendar.dayHtml).join('')}
            </div>
          </div>
        </div>

        <aside class="done-today">
          <h3>Done today <span class="count">${done.length}</span></h3>
          ${done.length
            ? `<ul>${done.map(t => `
                <li class="p${t.priority}">
                  <span class="dot"></span><span class="t">${escapeHtml(t.title)}</span>${Labels.tagsHtml(t)}
                  <button type="button" class="undo" data-id="${t.id}" title="Mark as not done">undo</button>
                </li>`).join('')}</ul>`
            : '<p class="empty">Tick off a planned task and it lands here.</p>'}
          <a href="#done" class="log-link">Full done log →</a>
        </aside>
      </div>`;

    // Keep the calendar's scroll position across re-renders; the first time, scroll to now.
    const newScroller = root.querySelector('.cal-scroll');
    if (scrollTop !== null) newScroller.scrollTop = scrollTop;
    else if (!scrolledToNow) {
      newScroller.scrollTop = Math.max(0, (minutesNow() - 60 - CALENDAR.startHour * 60) * CALENDAR.slotPx / CALENDAR.slotMinutes);
      scrolledToNow = true;
    }
  }

  root.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const step = Number(nav.dataset.nav);
      start = step === 0 ? firstDay() : addDays(start, step * (mode === 'week' ? 7 : 1));
      return render();
    }
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      mode = modeBtn.dataset.mode;
      start = firstDay();
      return render();
    }
    if (e.target.matches('.undo')) Tasks.toggleDone(e.target.dataset.id);
  });

  // Short view starts today; the week view starts on this week's Monday.
  function firstDay() {
    if (mode === 'short') return todayISO();
    const weekday = (fromISO(todayISO()).getDay() + 6) % 7;   // Monday = 0
    return addDays(todayISO(), -weekday);
  }

  return { render };
})();
