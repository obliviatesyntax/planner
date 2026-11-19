// cards.js — how one task looks, and what clicking on it does (anywhere on the page).
//
//   checkbox  → mark done / not done, on every task (or drag a task onto "Done today")
//   P1/P2/P3  → click to cycle priority. It always sits at the far right; with no priority it only
//               shows on hover, as a faint "P", in that same spot, so setting one never moves it.
//   checkbox → a little celebration: pop, green flash, burst, and the card flies to Done (see celebrate)
//   # / tags  → click to pick labels (labels.js → openPicker)
//   🗑         → delete (lists, to-do lists and calendar), with Undo
//   anywhere else on the card → open it (taskview.js): rename, description, priority, labels, delete
//   drag      → see dnd.js

const Cards = (() => {
  // A small trash can (× is kept for closing windows, so it never means "delete").
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

  // where: "list" | "plan" | "calendar" | "done"
  // style: position (calendar blocks); size: "short" / "short tiny" for short calendar blocks,
  // or "panel" for cards in the Done today panel (never compressed).
  // Calendar blocks show a short time ("10–11") — or, when the calendar is cramped
  // (Calendar.isCompressed(): week view on desktop, 2+ days on a phone), no time and no P tag
  // (the coloured edge shows priority; the tag appears on hover). See docs/ui-mobile-vs-desktop.md.
  function html(task, where, style = '', size = '') {
    const timed = task.startMin != null;
    const time = !timed ? ''
      : where === 'calendar' ? (Calendar.isCompressed() ? '' : formatTimeRange(task.startMin, task.startMin + task.duration))
      : formatTime(task.startMin);
    const p = task.priority || 0;   // 0 = no priority set
    // In a compressed view everything inside the day columns (calendar blocks, to-do cards, a past
    // day's done cards) drops the P tag (shown on hover) and has no hover buttons; click to open.
    // Not the lists below, and not the "Done today" panel.
    const compressed = Calendar.isCompressed() && where !== 'list' && size !== 'panel';
    const canDelete = where !== 'done';   // lists, to-do lists and calendar blocks
    const hasLabels = Tasks.allLabels().length > 0;   // no labels exist yet: no "#" button
    return `
      <div class="card p${p} ${where === 'calendar' ? `event ${size}` : ''} ${compressed ? 'compressed' : ''} ${where === 'done' ? 'done' : ''} ${where === 'done' && justDone.has(task.id) && !flying.has(task.id) ? 'just-done' : ''}" draggable="true"
           data-task="${task.id}" ${style ? `style="${style}"` : ''}>
        <input type="checkbox" class="check" ${where === 'done' ? 'checked title="Mark as not done"' : 'title="Mark done"'}>
        <div class="body">
          ${time && where !== 'calendar' ? `<span class="time">${time}</span>` : ''}
          <span class="title">${escapeHtml(task.title)}</span>
          ${where === 'calendar' && time ? `<span class="time">${time}</span>` : ''}
          ${Labels.tagsHtml(task)}
          ${task.notes && task.notes.trim() ? '<span class="has-notes" title="Has a description">≡</span>' : ''}
        </div>
        <!-- Priority is always the last thing, at the far right, and never moves (with no priority
             it's a faint "P" that only shows on hover). The hover buttons (# 🗑) float over the
             text just left of it, on a see-through background, so nothing reflows. -->
        <button type="button" class="prio ${p ? '' : 'prio-empty'}" title="${p ? `${PRIORITIES[p]} (click to change)` : 'Set a priority'}">P${p || ''}</button>
        ${canDelete || hasLabels ? `<div class="card-actions">
          ${hasLabels ? '<button type="button" class="lbl-btn" title="Labels">#</button>' : ''}
          ${canDelete ? `<button type="button" class="del" title="Delete">${TRASH_ICON}</button>` : ''}
        </div>` : ''}
        ${where === 'calendar' ? '<div class="resize" title="Drag to change length"></div>' : ''}
      </div>`;
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('.card[data-task]');
    if (!card) return;
    const id = card.dataset.task;

    if (e.target.matches('.check')) {
      if (Tasks.get(id).doneOn) return Tasks.toggleDone(id);   // unticking: just undo
      e.target.checked = true;
      return celebrate(card, id);
    }
    if (e.target.matches('.prio')) return Tasks.cyclePriority(id);
    if (e.target.matches('.lbl-btn, .tag')) return Labels.openPicker(id, e.target);
    if (e.target.closest('.del')) {
      const removed = Tasks.remove(id);
      return App.toast(`Deleted “${removed.title}”`, 'Undo', () => Tasks.restore(removed));
    }
    if (e.target.closest('button, input, .resize') || Date.now() < quietUntil) return;
    TaskView.open(id);   // a plain click on the card
  });

  // Right after a swipe or a resize, the browser also sends a "click": ignore it.
  let quietUntil = 0;
  function ignoreNextClick() { quietUntil = Date.now() + 400; }

  // ---- marking a task done: make it feel good ----------------------------------------
  //   1. the checkbox pops and the card flashes green, title struck through
  //   2. a small burst of green dots from the checkbox
  //   3. the card flies into its done list ("Done today"), which glows as it lands and the
  //      count ticks up
  // With "reduce motion" switched on in the system, it skips straight to the glow.

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const justDone = new Set();   // tasks to glow in the done list on the next draw
  const flying = new Set();     // …except while their flying copy is still on its way

  // Other ways of marking done (swipe, drag to Done) call this so the done list glows too.
  function markJustDone(id) {
    justDone.add(id);
    setTimeout(() => justDone.delete(id), 1600);
  }
  const isJustDone = id => justDone.has(id);

  function burst(from) {
    const r = from.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 10; i++) {
      const dot = document.createElement('span');
      dot.className = 'burst-dot';
      dot.style.left = `${cx - 3}px`;
      dot.style.top = `${cy - 3}px`;
      document.body.appendChild(dot);
      const angle = (i / 10) * Math.PI * 2, dist = 18 + Math.random() * 14;
      dot.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(.4)`, opacity: 0 },
      ], { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => dot.remove());
    }
  }

  async function celebrate(card, id) {
    const title = Tasks.get(id).title;
    const undo = () => Tasks.toggleDone(id);
    if (reduceMotion()) {
      markJustDone(id);
      Tasks.toggleDone(id);
      return App.toast(`Done: “${title}”`, 'Undo', undo);
    }
    card.classList.add('completing');
    burst(card.querySelector('.check'));
    await sleep(430);

    // Fly a copy of the card to where it now sits in the done list.
    const from = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('done-ghost');
    ghost.removeAttribute('data-task');
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(ghost);

    markJustDone(id);
    flying.add(id);
    Tasks.toggleDone(id);   // redraws the page: the card leaves its list, appears in the done list
    flying.delete(id);

    const target = document.querySelector(`.done-today .card[data-task="${id}"], .done-cell .card[data-task="${id}"]`);
    const to = target && target.getBoundingClientRect();
    const onScreen = to && to.bottom > 0 && to.top < window.innerHeight;
    if (onScreen) {
      target.style.opacity = '0';
      const dx = to.left - from.left, dy = to.top - from.top, scale = to.width / from.width;
      await ghost.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: .9 },
      ], { duration: 560, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
      target.style.opacity = '';
      target.classList.add('just-done');
    } else {
      await ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px) scale(.96)' }],
        { duration: 300, easing: 'ease-out', fill: 'forwards' }).finished;
    }
    ghost.remove();
    App.toast(`Done: “${title}”`, 'Undo', undo);
  }

  return { html, ignoreNextClick, markJustDone, isJustDone };
})();
