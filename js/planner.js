// planner.js — the top section: what you've committed to. Three views:
//
//   Calendar: 2 days / Week                                     List
//   ┌──────────┬──────────┐ ┌────────────┐      ┌──────────────────────────┐ ┌────────────┐
//   │ Today    │ Tomorrow │ │ Done today │      │ Yesterday  ~~done~~      │ │ Done today │
//   │ to-do    │ to-do    │ │ (drop here │      │ Today      9:00 Standup  │ │            │
//   │ + Add    │ + Add    │ │  = done)   │      │            to-do…        │ │            │
//   ├──────────┼──────────┤ │            │      │ Tomorrow   …             │ │            │
//   │ calendar │ calendar │ │            │      │   (scrolls)              │ │            │
//   └──────────┴──────────┘ └────────────┘      └──────────────────────────┘ └────────────┘
//
// Past days show only what was done that day (crossed out) — no hours. Drop a task on a
// past day (or on "Done today") to mark it done on that day.
//
// The calendar covers the whole day but only shows a window of it: from a little before now,
// as tall as needed to reach the last task coming up today (CALENDAR.view). Scroll for more;
// "▲ 2 earlier" / "▼ 1 later" pills show tasks outside the window. A blue line marks now.
// Click an empty spot on the calendar to add a task at that time.
//
// Calendar (below) holds the time-grid maths, used here and by dnd.js.

const Calendar = (() => {
  const { startHour, endHour, slotMinutes, slotPx, snapMinutes, view } = CALENDAR;
  let resizing = null;

  const pxPerMinute = () => slotPx / slotMinutes;
  const height = () => (endHour - startHour) * 60 * pxPerMinute();

  // Which part of the day to show for these dates: { start, span } in minutes.
  // With today on screen: from an hour before now, tall enough to reach today's last
  // upcoming task. Otherwise: from just before the earliest task on the days shown.
  function viewWindow(dates) {
    const today = todayISO();
    const now = minutesNow();
    const events = dates.flatMap(d => Tasks.calendarList(d).filter(Labels.matches).map(t => ({ ...t, date: d })));
    let anchor, relevant;
    if (dates.includes(today)) {
      anchor = now - view.beforeNow;
      relevant = events.filter(t => t.date === today);
    } else {
      anchor = events.length ? Math.min(...events.map(t => t.startMin)) - 30 : 8 * 60;
      relevant = events;
    }
    const maxStart = endHour * 60 - view.minHours * 60;
    const start = Math.max(startHour * 60, Math.min(maxStart, Math.floor(anchor / 60) * 60));
    const lastEnd = Math.max(0, ...relevant.filter(t => t.startMin + t.duration > start).map(t => t.startMin + t.duration));
    const span = Math.min(endHour * 60 - start, view.maxHours * 60, Math.max(view.minHours * 60, lastEnd + 30 - start));
    return { start, span };
  }

  // Mouse y-position inside a calendar day -> minutes after midnight, snapped.
  function minutesAt(dayEl, clientY, snap = snapMinutes) {
    const y = clientY - dayEl.getBoundingClientRect().top;
    const minutes = startHour * 60 + Math.round(y / pxPerMinute() / snap) * snap;
    return Math.max(startHour * 60, Math.min(endHour * 60 - snap, minutes));
  }

  function topPx(startMin) { return (startMin - startHour * 60) * pxPerMinute(); }

  function blockStyle(startMin, duration) {
    return { top: `${topPx(startMin)}px`, height: `${Math.max(duration * pxPerMinute(), 18)}px` };
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
           style="height:${height()}px; --slot:${slotPx}px">
        ${events.map(t => {
          const { top, height: h } = blockStyle(t.startMin, t.duration);
          const { col, cols: n } = cols[t.id];
          return Cards.html(t, 'calendar', `top:${top};height:${h};left:calc(${col} * 100% / ${n});width:calc(100% / ${n} - 2px)`);
        }).join('')}
        ${isToday && now >= startHour * 60 && now < endHour * 60
          ? `<div class="now-line" style="top:${topPx(now)}px"></div>` : ''}
        <button type="button" class="cal-more up" hidden></button>
        <button type="button" class="cal-more down" hidden></button>
      </div>`;
  }

  function gutterHtml() {
    let html = '';
    for (let h = startHour + 1; h < endHour; h++) {   // the first hour is the top edge: no label needed
      html += `<div class="hour" style="top:${topPx(h * 60)}px">${formatTime(h * 60).replace(':00', '')}</div>`;
    }
    return `<div class="cal-gutter" style="height:${height()}px">${html}</div>`;
  }

  // Click an empty spot: a little box appears at that time; type a name, Enter adds it there.
  document.addEventListener('click', e => {
    const day = e.target.closest('.cal-day');
    if (!day || e.target !== day) return;   // clicks on tasks or the box itself are not "empty"
    day.querySelectorAll('.cal-add-input').forEach(el => el.remove());
    const startMin = minutesAt(day, e.clientY - 8, slotMinutes);
    const input = document.createElement('input');
    input.className = 'cal-add-input';
    input.placeholder = `${formatTime(startMin)}: task name, Enter`;
    input.style.top = `${topPx(startMin)}px`;
    day.appendChild(input);
    input.focus();
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') return input.remove();
      if (ev.key === 'Enter') App.addFromText(input.value, { planDate: day.dataset.date, startMin });
    });
    input.addEventListener('blur', () => input.remove());
  });

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
    const minutes = Math.round((e.clientY - resizing.top) / pxPerMinute() / snapMinutes) * snapMinutes;
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

  // "▲ 2 earlier" / "▼ 1 later" pills for tasks scrolled out of view; click to scroll to them.
  function updateHints(scroller) {
    const top = scroller.scrollTop, bottom = top + scroller.clientHeight;
    scroller.querySelectorAll('.cal-day').forEach(day => {
      const events = [...day.querySelectorAll('.card.event')];
      const above = events.filter(el => el.offsetTop + el.offsetHeight <= top + 4);
      const below = events.filter(el => el.offsetTop >= bottom - 4);
      const up = day.querySelector('.cal-more.up'), down = day.querySelector('.cal-more.down');
      up.hidden = !above.length;
      up.textContent = `▲ ${above.length} earlier`;
      up.style.top = `${top + 4}px`;
      up.dataset.to = above.length ? above[above.length - 1].offsetTop - 8 : '';
      down.hidden = !below.length;
      down.textContent = `▼ ${below.length} later`;
      down.style.top = `${bottom - 26}px`;
      down.dataset.to = below.length ? below[0].offsetTop - 8 : '';
    });
  }

  document.addEventListener('click', e => {
    const pill = e.target.closest('.cal-more');
    if (pill) pill.closest('.cal-scroll').scrollTo({ top: Number(pill.dataset.to), behavior: 'smooth' });
  });

  return {
    minutesAt, blockStyle, topPx, dayHtml, gutterHtml, viewWindow, updateHints, pxPerMinute,
    isResizing: () => !!resizing,
  };
})();

const Planner = (() => {
  const root = document.getElementById('planner');
  let view = 'cal2';           // one of PLAN_VIEWS
  let start = todayISO();      // first day shown (calendar views)
  let userScrolled = false;    // once you scroll yourself, re-renders keep your position

  const isPast = date => date < todayISO();
  const viewInfo = () => PLAN_VIEWS.find(v => v.id === view);

  function dayName(date) {
    const today = todayISO();
    if (date === today) return 'Today';
    if (date === addDays(today, 1)) return 'Tomorrow';
    if (date === addDays(today, -1)) return 'Yesterday';
    return fromISO(date).toLocaleDateString(undefined, { weekday: 'long' });
  }
  const shortDate = date => formatDay(date).replace(/^\w+, /, '');

  // ---- pieces shared by the views --------------------------------------------

  // A past day: only what got done, crossed out. Drop a task here to mark it done that day.
  function doneCellHtml(date, cls = '') {
    const done = Tasks.doneList(date).filter(Labels.matches);
    return `
      <div class="done-cell ${cls}" data-drop="done" data-date="${date}">
        <div class="list">${done.map(t => Cards.html(t, 'done')).join('')}</div>
        ${done.length ? '' : '<p class="empty">Nothing done</p>'}
      </div>`;
  }

  function todoCellHtml(date, cls = '', withTimed = false) {
    const timed = withTimed ? Tasks.calendarList(date).filter(Labels.matches) : [];
    const todo = Tasks.planList(date).filter(Labels.matches);
    return `
      <div class="plan-cell ${cls} ${date === todayISO() ? 'is-today' : ''}" data-drop="plan" data-date="${date}">
        <div class="list">${[...timed, ...todo].map(t => Cards.html(t, 'plan')).join('')}</div>
        <button type="button" class="col-add" data-date="${date}">+ Add</button>
      </div>`;
  }

  function donePanelHtml() {
    const today = todayISO();
    const done = Tasks.doneList(today).filter(Labels.matches);
    return `
      <aside class="done-today" data-drop="done" data-date="${today}">
        <h3>Done today <span class="count">${done.length}</span></h3>
        <div class="list">${done.map(t => Cards.html(t, 'done')).join('')}</div>
        <p class="empty">${done.length ? 'Drag more tasks here to mark them done.' : 'Tick a task, or drag it here, to mark it done.'}</p>
      </aside>`;
  }

  // ---- calendar views (2 days / week) ----------------------------------------

  function calendarHtml(days) {
    const today = todayISO();
    const upcoming = days.filter(d => !isPast(d));
    const win = upcoming.length ? Calendar.viewWindow(upcoming) : null;
    const html = `
      <div class="plan-days" style="--days:${days.length}">
        <div class="plan-grid">
          <div></div>
          ${days.map(d => `
            <div class="day-head ${d === today ? 'is-today' : ''} ${isPast(d) ? 'is-past' : ''}">
              <b>${dayName(d)}</b> <span class="muted">${shortDate(d)}</span>
            </div>`).join('')}
          <div class="row-label">To do</div>
          ${days.map(d => isPast(d) ? doneCellHtml(d, 'tall') : todoCellHtml(d)).join('')}
        </div>
        ${win ? `
          <div class="cal-scroll" style="height:${win.span * Calendar.pxPerMinute()}px">
            <div class="plan-grid cal-grid">
              ${Calendar.gutterHtml()}
              ${days.map(d => isPast(d) ? '<div class="cal-past"></div>' : Calendar.dayHtml(d)).join('')}
            </div>
          </div>` : ''}
      </div>`;
    return { html, win };
  }

  // ---- list view ----------------------------------------------------------------

  function listViewHtml() {
    const today = todayISO();
    const days = [];
    for (let i = -LIST_VIEW_DAYS.back; i <= LIST_VIEW_DAYS.ahead; i++) days.push(addDays(today, i));
    return `
      <div class="plan-listview">
        ${days.map(d => `
          <div class="lv-day ${d === today ? 'is-today' : ''} ${isPast(d) ? 'is-past' : ''}" ${d === today ? 'id="lv-today"' : ''}>
            <div class="lv-head"><b>${dayName(d)}</b><span class="muted">${shortDate(d)}</span></div>
            ${isPast(d) ? doneCellHtml(d) : todoCellHtml(d, '', true)}
          </div>`).join('')}
      </div>`;
  }

  // ---- render -------------------------------------------------------------------

  function render() {
    const info = viewInfo();
    const days = info.days ? Array.from({ length: info.days }, (_, i) => addDays(start, i)) : null;
    const old = root.querySelector('.cal-scroll, .plan-listview');
    const keepScroll = userScrolled && old ? old.scrollTop : null;
    const cal = days ? calendarHtml(days) : null;

    root.innerHTML = `
      <div class="section-head">
        <h2>Plan</h2>
        <div class="day-nav">
          ${days ? '<button type="button" data-nav="-1" title="Earlier">‹</button>' : ''}
          <button type="button" data-nav="0">Today</button>
          ${days ? `<button type="button" data-nav="1" title="Later">›</button>
          <span class="muted">${formatDay(days[0])} – ${formatDay(days[days.length - 1])}</span>` : ''}
        </div>
        <div class="seg">
          ${PLAN_VIEWS.map(v => `<button type="button" data-view="${v.id}" class="${v.id === view ? 'active' : ''}">${v.label}</button>`).join('')}
        </div>
      </div>
      <div class="plan-layout">
        ${cal ? cal.html : listViewHtml()}
        ${donePanelHtml()}
      </div>`;

    // Scroll: keep where you were, or show the calendar window / today in the list.
    const scroller = root.querySelector('.cal-scroll, .plan-listview');
    if (scroller) {
      if (keepScroll !== null) scroller.scrollTop = keepScroll;
      else if (cal) scroller.scrollTop = Calendar.topPx(cal.win.start);
      else scroller.scrollTop = root.querySelector('#lv-today').offsetTop - scroller.offsetTop;
      if (cal) {
        Calendar.updateHints(scroller);
        scroller.addEventListener('scroll', () => Calendar.updateHints(scroller));
      }
      scroller.addEventListener('wheel', () => { userScrolled = true; }, { passive: true });
      scroller.addEventListener('touchmove', () => { userScrolled = true; }, { passive: true });
    }
  }

  root.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const step = Number(nav.dataset.nav);
      start = step === 0 ? firstDay() : addDays(start, step * (view === 'week' ? 7 : 1));
      userScrolled = false;   // re-centre
      return render();
    }
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      view = viewBtn.dataset.view;
      start = firstDay();
      userScrolled = false;
      return render();
    }
  });

  // 2-day view starts today; the week view starts on this week's Monday.
  function firstDay() {
    if (view !== 'week') return todayISO();
    const weekday = (fromISO(todayISO()).getDay() + 6) % 7;   // Monday = 0
    return addDays(todayISO(), -weekday);
  }

  return { render };
})();
