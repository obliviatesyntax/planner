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
    'Buy cedar planks @birdhouse',
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

  // ---- animation helpers -----------------------------------------------------------

  // A pretend cursor on a "stage" element: move it around, and carry a card from A to B.
  function animator(stage, cursor) {
    let cur = { x: 40, y: 40 };
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
    return { at, moveCursor, carry };
  }

  const card = (text, extra = '') => `<div class="m-card p0 ${extra}"><i></i>${text}</div>`;

  // ---- the app preview at the top ------------------------------------------------
  // Types "Call mom at 9PM" (the live preview popup shows where it'll go), adds it to today's
  // calendar, then drags "Renew passport" from @triage onto tomorrow's to-do list.

  const pv = document.getElementById('pv');
  const pvInput = document.getElementById('pv-input');
  const pvPopup = document.getElementById('pv-popup');
  const pvTodo = document.getElementById('pv-todo');
  const pvCal = document.getElementById('pv-cal');
  const pvTriage = document.getElementById('pv-triage');
  const pvTomorrow = document.getElementById('pv-tomorrow');
  const PV_TEXT = 'Call mom at 9PM';

  function pvReset() {
    pvInput.textContent = '';
    pvPopup.hidden = true;
    pvTodo.innerHTML = '<div class="m-card p1"><i></i>Finish launch doc <s class="m-tag" style="--c:#5f3dc4">#w</s><u>P1</u></div>'
      + '<div class="m-card p2"><i></i>Reply to Sam <u>P2</u></div>';
    pvCal.querySelectorAll('.lp-new').forEach(el => el.remove());
    pvTriage.innerHTML = '<b>@triage</b>' + card('Renew passport') + card('Call the bank');
    pvTomorrow.innerHTML = '<div class="m-card p3"><i></i>Plan weekend trip <u>P3</u></div>';
  }
  function pvShowPopup(text) {
    pvPopup.innerHTML = `${describe(text)}<span class="lp-pv-hint">Enter to add</span>`;
    pvPopup.hidden = false;
  }
  const pvEvent = '<div class="m-event p0 lp-pop lp-new" style="top:78%;height:16%"><i></i>Call mom<small>9:00–9:30 PM</small></div>';

  let pvRunning = false;
  async function pvLoop() {
    if (!pv || pvRunning) return;
    pvRunning = true;
    const a = animator(pv, document.getElementById('pv-cursor'));
    while (!page.hidden) {
      pvReset();
      if (reduceMotion) {   // a still picture: the text typed, its preview showing
        pvInput.textContent = PV_TEXT;
        pvShowPopup(PV_TEXT);
        return;
      }
      await sleep(1000);
      // 1. Type, with the live preview updating as words arrive
      await a.moveCursor((({ x, y }) => ({ x: x + 40, y: y + 10 }))(a.at(pvInput)), 500);
      for (let n = 1; n <= PV_TEXT.length; n++) {
        pvInput.textContent = PV_TEXT.slice(0, n);
        if (n >= 4) pvShowPopup(PV_TEXT.slice(0, n));
        await sleep(n === 8 ? 450 : 70);   // a little pause after "Call mom"
      }
      await sleep(1300);
      // 2. Press Enter: it lands on today's calendar at 9 PM
      document.getElementById('pv-add').classList.add('pressed');
      await sleep(160);
      document.getElementById('pv-add').classList.remove('pressed');
      pvInput.textContent = '';
      pvPopup.hidden = true;
      pvCal.insertAdjacentHTML('beforeend', pvEvent);
      await sleep(1200);
      // 3. Drag "Renew passport" from @triage onto tomorrow's to-do list
      pvTomorrow.insertAdjacentHTML('beforeend', card('Renew passport', 'lp-landing'));
      const landing = pvTomorrow.lastElementChild;
      await a.carry(pvTriage.querySelector('.m-card'), landing, () => landing.classList.remove('lp-landing'));
      await sleep(3000);
    }
    pvRunning = false;
  }

  // ---- the drag-and-drop demo ----------------------------------------------------
  // A pretend cursor drags a project task onto today, another onto 6 PM, then ticks one off.

  const stage = document.getElementById('lp-dnd');
  const listBox = document.getElementById('dnd-list');
  const todoBox = document.getElementById('dnd-todo');
  const calBox = document.getElementById('dnd-cal');
  const slot = document.getElementById('dnd-slot');

  function resetBoard() {
    listBox.innerHTML = card('Buy cedar planks') + card('Cut the roof panels') + card('Paint it blue');
    todoBox.innerHTML = card('Reply to Sam');
    calBox.querySelectorAll('.m-event').forEach(el => el.remove());
  }

  let dndRunning = false;
  async function dndLoop() {
    if (!stage || dndRunning) return;
    dndRunning = true;
    const { at, moveCursor, carry } = animator(stage, document.getElementById('dnd-cursor'));
    while (!page.hidden) {
      resetBoard();
      if (reduceMotion) {   // just show the end result
        listBox.innerHTML = card('Paint it blue');
        todoBox.innerHTML = card('Reply to Sam') + card('Buy cedar planks', 'done');
        calBox.insertAdjacentHTML('beforeend', '<div class="m-event p0" style="top:33.3%;height:33.3%"><i></i>Cut the roof panels<small>6:00–7:00 PM</small></div>');
        return;
      }
      await sleep(900);
      // 1. "Buy cedar planks" → today's to-do list (a placeholder shows where it lands)
      todoBox.insertAdjacentHTML('beforeend', card('Buy cedar planks', 'lp-landing'));
      const landing = todoBox.lastElementChild;
      await carry(listBox.children[0], landing, () => landing.classList.remove('lp-landing'));
      await sleep(500);
      // 2. "Cut the roof panels" → 6 PM on the calendar
      await carry(listBox.children[0], slot, () => calBox.insertAdjacentHTML('beforeend',
        '<div class="m-event p0 lp-pop" style="top:33.3%;height:33.3%"><i></i>Cut the roof panels<small>6:00–7:00 PM</small></div>'));
      await sleep(600);
      // 3. Tick "Buy cedar planks" off
      const box = at(landing.querySelector('i'));
      await moveCursor({ x: box.x + 4, y: box.y + 4 });
      landing.classList.add('done');
      landing.querySelector('i').classList.add('on');
      await sleep(2600);
    }
    dndRunning = false;
  }

  function start() { play(); pvLoop(); dndLoop(); }
  if (!page.hidden) start();
  return { play: start };
})();
