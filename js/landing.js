// landing.js — the signed-out landing page: "Get started" / "Sign in" buttons jump to the
// sign-in card, the product preview gets real dates, and the "Type it like you'd say it"
// demo types example tasks and shows how quick add reads them (using the real when.js).

const Landing = (() => {
  const page = document.getElementById('signin');

  // "Get started" → Create account tab; "Sign in" → Sign in tab. Both scroll to the card.
  page.addEventListener('click', e => {
    const btn = e.target.closest('[data-auth]');
    if (!btn) return;
    document.querySelector(`#auth-tabs [data-tab="${btn.dataset.auth}"]`).click();
    document.getElementById('auth').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = document.querySelector(btn.dataset.auth === 'signup' ? '#signup-name' : '#signin-email');
    setTimeout(() => input.focus({ preventScroll: true }), 350);
  });

  // Little touches: real dates in the preview, this year in the footer, a shadow under the
  // menu bar once you scroll.
  document.querySelectorAll('[data-lp-date]').forEach(el => {
    el.textContent = formatDay(addDays(todayISO(), Number(el.dataset.lpDate))).replace(/^\w+, /, '');
  });
  document.getElementById('lp-year').textContent = new Date().getFullYear();
  const nav = page.querySelector('.lp-nav');
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 8), { passive: true });

  // ---- the typing demo ---------------------------------------------------------

  // Simple, everyday examples first; one "power user" line at the end.
  const EXAMPLES = [
    'Dentist appointment tomorrow at 5 PM',
    'Call mom tonight',
    'Renew passport',
    'Gym Friday 6-7pm',
    'Book flights @travel',
    'Finish the report today at 2pm p1 #work',
  ];
  const LABEL_COLORS_DEMO = { personal: '#2b8a3e', work: '#5f3dc4', health: '#c2255c' };
  const typed = document.getElementById('lp-typed');
  const result = document.getElementById('lp-result');

  // What quick add would do with this text, as little chips.
  function describe(text) {
    const chips = [];
    const list = (text.match(/(?:^|\s)@(\w+)/) || [])[1];
    const prio = (text.match(/(?:^|\s)p([123])(?=\s|$)/i) || [])[1];
    const labels = [...text.matchAll(/(?:^|\s)#(\w+)/g)].map(m => m[1]);
    const clean = text.replace(/(?:^|\s)(?:@\w+|#\w+|p[123](?=\s|$))/gi, ' ');
    const when = list ? { title: clean.trim(), date: null } : When.parse(clean);
    chips.push(`<span class="lp-chip lp-chip-title">${escapeHtml(when.title)}</span>`);
    if (list) chips.push(`<span class="lp-chip">☰ @${escapeHtml(list)} list</span>`);
    else if (when.date) chips.push(`<span class="lp-chip">📅 ${escapeHtml(When.describe(when))}</span>`);
    else chips.push('<span class="lp-chip">☰ Your list, for later</span>');
    if (prio) chips.push(`<span class="lp-chip lp-chip-p${prio}">P${prio}</span>`);
    labels.forEach(l => chips.push(`<span class="lp-chip lp-chip-label" style="--c:${LABEL_COLORS_DEMO[l] || '#1971c2'}">#${escapeHtml(l)}</span>`));
    return chips.join('');
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let playing = false;
  async function play() {
    if (playing) return;
    playing = true;
    for (let i = 0; ; i = (i + 1) % EXAMPLES.length) {
      if (page.hidden) return;                    // signed in: stop
      const text = EXAMPLES[i];
      result.classList.remove('show');
      if (reduceMotion) typed.textContent = text;
      else for (let n = 1; n <= text.length; n++) { typed.textContent = text.slice(0, n); await sleep(45); }
      result.innerHTML = describe(text);
      result.classList.add('show');
      await sleep(2600);
    }
  }
  // ---- the drag-and-drop demo ----------------------------------------------------
  // A pretend cursor drags "Renew passport" onto today, "Gym" onto 6 PM, then ticks a task off.

  const stage = document.getElementById('lp-dnd');
  const cursor = document.getElementById('dnd-cursor');
  const listBox = document.getElementById('dnd-list');
  const todoBox = document.getElementById('dnd-todo');
  const calBox = document.getElementById('dnd-cal');
  const slot = document.getElementById('dnd-slot');
  let cur = { x: 40, y: 40 };

  const card = (text, extra = '') => `<div class="m-card p0 ${extra}"><i></i>${text}</div>`;
  function resetBoard() {
    listBox.innerHTML = card('Renew passport') + card('Gym') + card('Book flights');
    todoBox.innerHTML = card('Reply to Sam');
    calBox.querySelectorAll('.m-event').forEach(el => el.remove());
  }
  // Position of an element inside the stage.
  function at(el) {
    const r = el.getBoundingClientRect(), s0 = stage.getBoundingClientRect();
    return { x: r.left - s0.left, y: r.top - s0.top, w: r.width, h: r.height };
  }
  function moveCursor(to, ms = 650) {
    const from = cur;
    cur = to;
    return cursor.animate([{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }],
      { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
  }
  // Pick up `el`, carry it (with the cursor) to `target`, then call drop().
  async function carry(el, target, drop) {
    const from = at(el);
    await moveCursor({ x: from.x + 28, y: from.y + from.h / 2 });
    const ghost = el.cloneNode(true);
    ghost.classList.add('lp-ghost');
    Object.assign(ghost.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px` });
    stage.appendChild(ghost);
    el.style.visibility = 'hidden';
    await sleep(150);
    const to = at(target);
    const dx = to.x - from.x, dy = to.y - from.y;
    const ms = 900;
    await Promise.all([
      ghost.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${dx / 2}px, ${dy / 2}px) rotate(-2deg)` }, { transform: `translate(${dx}px, ${dy}px) rotate(0)` }],
        { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished,
      moveCursor({ x: to.x + 28, y: to.y + from.h / 2 }, ms),
    ]);
    ghost.remove();
    el.remove();
    drop();
  }

  let dndRunning = false;
  async function dndLoop() {
    if (!stage || dndRunning) return;
    dndRunning = true;
    while (!page.hidden) {
      resetBoard();
      if (reduceMotion) {   // just show the end result
        listBox.innerHTML = card('Book flights');
        todoBox.innerHTML = card('Reply to Sam') + card('Renew passport', 'done');
        calBox.insertAdjacentHTML('beforeend', '<div class="m-event p0" style="top:33.3%;height:33.3%"><i></i>Gym<small>6:00–7:00 PM</small></div>');
        return;
      }
      await sleep(900);
      // 1. "Renew passport" → today's to-do list (a placeholder shows where it lands)
      todoBox.insertAdjacentHTML('beforeend', card('Renew passport', 'lp-landing'));
      const landing = todoBox.lastElementChild;
      await carry(listBox.children[0], landing, () => landing.classList.remove('lp-landing'));
      await sleep(500);
      // 2. "Gym" → 6 PM on the calendar
      await carry(listBox.children[0], slot, () => calBox.insertAdjacentHTML('beforeend',
        '<div class="m-event p0 lp-pop" style="top:33.3%;height:33.3%"><i></i>Gym<small>6:00–7:00 PM</small></div>'));
      await sleep(600);
      // 3. Tick "Renew passport" off
      const box = at(landing.querySelector('i'));
      await moveCursor({ x: box.x + 4, y: box.y + 4 });
      landing.classList.add('done');
      landing.querySelector('i').classList.add('on');
      await sleep(2600);
    }
    dndRunning = false;
  }

  function start() { play(); dndLoop(); }
  if (!page.hidden) start();
  return { play: start };
})();
