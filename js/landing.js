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

  const EXAMPLES = [
    'Dentist tomorrow 5pm p1 #personal',
    'Renew passport @weekly',
    'Gym fri 6-7pm #health',
    'Review launch doc today 2pm for 1h p1 #work',
    'Call mom tomorrow',
    'Learn to make ramen @someday p3',
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
    else chips.push('<span class="lp-chip">☰ @triage</span>');
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
  if (!page.hidden) play();
  return { play };
})();
