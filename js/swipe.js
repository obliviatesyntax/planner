// swipe.js — touch screens only: swipe a task sideways.
//
//   swipe right → done (or not done, on a done task)
//   swipe left  → "later": a planned task moves to the next day's to-do list;
//                 a task in a list gets planned for today
//
// Each swipe shows a toast with Undo. Vertical movement is left to the browser (page scroll),
// thanks to `touch-action: pan-y` on cards in styles.css.

const Swipe = (() => {
  const THRESHOLD = 80;   // pixels to the side before a swipe counts
  let s = null;           // the swipe in progress

  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const card = e.target.closest('.card[data-task]');
    if (!card || e.target.closest('button, input, .resize, [contenteditable="true"]')) return;
    s = { card, id: card.dataset.task, x: e.clientX, y: e.clientY, dx: 0, active: false };
  });

  document.addEventListener('pointermove', e => {
    if (!s || e.pointerType !== 'touch') return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // scrolling, not swiping
      if (Math.abs(dx) < 12) return;
      s.active = true;
      s.card.classList.add('swiping');
    }
    s.dx = dx;
    s.card.style.transform = `translateX(${dx}px)`;
    const task = Tasks.get(s.id);
    s.card.dataset.swipe = dx > 0
      ? (task.doneOn ? '↺ Not done' : '✓ Done')
      : (task.doneOn ? '' : task.planDate ? 'Next day →' : 'Today →');
    s.card.classList.toggle('swipe-right', dx > 0);
    s.card.classList.toggle('swipe-left', dx < 0);
    s.card.classList.toggle('swipe-ready', Math.abs(dx) > THRESHOLD);
  });

  function finish() {
    if (!s) return;
    const { card, id, dx, active } = s;
    s = null;
    if (!active) return;
    Cards.ignoreNextClick();
    card.classList.remove('swiping', 'swipe-right', 'swipe-left', 'swipe-ready');
    card.style.transform = '';
    if (dx > THRESHOLD) markDone(id);
    else if (dx < -THRESHOLD) later(id);
  }
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);

  function markDone(id) {
    const task = Tasks.get(id);
    const wasDone = !!task.doneOn;
    Tasks.toggleDone(id);
    App.toast(wasDone ? `Not done: “${task.title}”` : `Done: “${task.title}”`, 'Undo', () => Tasks.toggleDone(id));
  }

  function later(id) {
    const task = Tasks.get(id);
    if (task.doneOn) return;
    const before = { planDate: task.planDate, startMin: task.startMin, list: task.list };
    const today = todayISO();
    const to = task.planDate ? addDays(task.planDate > today ? task.planDate : today, 1) : today;
    Tasks.moveToPlan(id, to);
    App.toast(`“${task.title}” → ${to === today ? 'today' : formatDay(to)}`, 'Undo', () => Tasks.update(id, before));
  }

  return {};
})();
