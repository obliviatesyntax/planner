// voice.js — the 🎤 button in quick add. Uses the browser's built-in speech recognition
// (Chrome, Edge, Safari; the button hides itself where it isn't available, e.g. Firefox).
//
// Click, speak, and the words appear in the quick-add box; check them and press Enter.
// Speech has no symbols, so spoken phrases are turned into the usual shortcuts:
//
//   "… list weekly" / "… in list upcoming E"   → @weekly / @upcomingE
//   "… at weekly"  (only if @weekly exists)     → @weekly
//   "… priority one" / "… P 1"                  → p1
//   "5 p.m."                                    → 5pm        (dates/times then work as typed)
//
// Example: "Renew passport list weekly priority one" → "Renew passport @weekly p1"

const Voice = (() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.getElementById('mic-btn');
  const input = document.getElementById('qa-title');
  if (!Recognition) { button.hidden = true; return {}; }

  let rec = null;

  button.addEventListener('click', () => (rec ? rec.stop() : start()));

  function start() {
    const before = input.value.trim();
    rec = new Recognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;     // show words as you speak
    button.classList.add('listening');
    button.title = 'Listening… click to stop';

    rec.onresult = e => {
      const heard = [...e.results].map(r => r[0].transcript).join(' ');
      const done = e.results[e.results.length - 1].isFinal;
      input.value = [before, done ? toShortcuts(heard) : heard].filter(Boolean).join(' ');
    };
    rec.onerror = e => {
      App.toast(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access is blocked. Allow it in the browser’s address bar, then try again.'
        : e.error === 'no-speech' ? 'Didn’t hear anything. Try again.' : `Voice input stopped (${e.error}).`);
    };
    rec.onend = () => {
      rec = null;
      button.classList.remove('listening');
      button.title = 'Speak a task';
      input.focus();
      if (input.value.trim() && input.value.trim() !== before) App.toast('Check the task, then press Enter to add it.');
    };
    rec.start();
  }

  const NUMBERS = { one: 1, two: 2, three: 3, '1': 1, '2': 2, '3': 3 };

  function toShortcuts(text) {
    let t = ` ${text} `;
    t = t.replace(/(\d)\s*([ap])\.?\s?m\.?(?=\W)/gi, '$1$2m');                       // 5 p.m. -> 5pm
    t = t.replace(/\s(?:with\s+)?priority\s+(one|two|three|[123])(?=\W)/gi, (_, n) => ` p${NUMBERS[n.toLowerCase()]}`);
    t = t.replace(/\sp\s?([123])(?=\W)/gi, ' p$1');                                    // "P 1" -> p1
    t = t.replace(/\s(?:(?:to|in|into|on)\s+)?(?:the\s+)?list\s+((?:[a-z0-9]+\s?){1,3})/gi, (m, words) => ` ${listShortcut(words)} `);
    t = t.replace(/\sat\s+([a-z][a-z0-9]*)(?=\W)/gi, (m, word) => {                     // "at weekly", only for existing lists
      const list = Tasks.findList(word);
      return list ? ` @${list.name}` : m;
    });
    return t.replace(/\s+/g, ' ').trim();
  }

  // "upcoming e" → "@upcomingE" if that list exists (spaces ignored), else the first word as a new list.
  function listShortcut(words) {
    const parts = words.trim().split(/\s+/);
    for (let n = parts.length; n >= 1; n--) {
      const joined = parts.slice(0, n).join('');
      const list = Tasks.findList(joined);
      if (list) return `@${list.name} ${parts.slice(n).join(' ')}`;
    }
    return `@${parts[0]} ${parts.slice(1).join(' ')}`;
  }

  return { toShortcuts };
})();
