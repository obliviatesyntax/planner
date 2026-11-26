// project.js — a project's own page: #project/<name>, e.g. #project/kitchenReno.
//
// A project is one of your lists (not @triage, which is only an inbox). Its page shows:
//   • Notes: free text, shown as Markdown when it looks like Markdown (headings, lists, **bold**,
//     links, code, quotes, tables…), plain text otherwise. Two special things in notes:
//       @projectName   → a link to that project's page
//       list items     → can become tasks in this project, one-way. Right after you write new list
//                        items (click Done), the notes offer "Add N as tasks" once; any line also has
//                        a "+ task" on hover. A line whose title matches one of this project's tasks
//                        shows where that task is instead ("Planned tomorrow 6 PM", "Done"…), so it isn't added twice. The notes text is
//                        never changed by any of this; tasks and notes aren't kept in sync.
//   • Tasks: not planned yet (the list itself: drag into it, "+ Add"), planned on a day (with the
//     day and time), and done (the 3 most recent; "Show all" for the rest).
// The header is editable in place: click the name to rename, pick a label chip, 🗑 deletes (asks first, then Undo).
// Quick add on this page puts tasks into this project unless you type another @list.
// The browser's Back button, or "← Dashboard", returns to the Dashboard (the main page). The ▾ next
// to the name switches to another project (see jump.js).

const Project = (() => {
  const view = document.getElementById('project-view');
  const dashboard = ['planner', 'lists'].map(id => document.getElementById(id));
  const RECENT_DONE = 3;
  let editing = false;     // notes in edit mode?
  let showAllDone = false;
  let shownId = null;
  let shownName = null;   // its name when last drawn (to follow a rename)
  let editStart = '';      // the notes when editing began, to spot newly written list items
  let offer = null;        // line numbers of new list items to offer as tasks (once), or null

  // A project's address is its name: #project/kitchenReno. Names are one word of letters and
  // digits and unique (any case), so the name alone finds it. Typed in another case
  // (#project/KITCHENRENO) it still opens, and the address is corrected to the real spelling.
  // Renamed while open (here, on another device, or by an AI app): the address follows the new name.
  // An old link to a renamed or deleted project goes to the Dashboard.
  function href(l) { return `#project/${l.name}`; }

  // The project in the address, if it exists and is a real project (not @triage).
  function currentId() {
    const m = location.hash.match(/^#project\/(.+)$/);
    if (!m) return null;
    const name = decodeURIComponent(m[1]);
    const l = Tasks.findList(name);
    if (l) return l.id;
    // Not found, but it's the name of the page on screen: that project was just renamed.
    const shown = shownId && Tasks.list(shownId);
    return shown && shownName && name.toLowerCase() === shownName.toLowerCase() ? shownId : null;
  }

  window.addEventListener('hashchange', () => { editing = false; showAllDone = false; App.renderAll(); window.scrollTo(0, 0); });

  function render() {
    const id = currentId();
    if (location.hash.startsWith('#project/') && !id) history.replaceState(null, '', location.pathname + location.search);   // deleted / unknown
    view.hidden = !id;
    dashboard.forEach(el => { el.hidden = Boolean(id); });
    if (!id) { shownId = shownName = null; return; }
    if (location.hash !== href(Tasks.list(id))) history.replaceState(null, '', location.pathname + location.search + href(Tasks.list(id)));   // real spelling / new name
    shownName = Tasks.list(id).name;
    if (shownId !== id) { editing = false; showAllDone = false; offer = null; shownId = id; }
    const l = Tasks.list(id);
    const builtIn = id === TRIAGE_LIST.id;   // @triage: can't be renamed or deleted
    const { waiting, planned, done } = Tasks.projectTasks(id);
    const labels = Tasks.allLabels();
    const visibleDone = showAllDone ? done : done.slice(0, RECENT_DONE);
    const draft = editing ? view.querySelector('.pj-notes-input')?.value : undefined;   // keep unsaved typing

    view.innerHTML = `
      <div class="pj-head">
        <a href="#" class="pj-back" title="Back to the Dashboard">← Dashboard</a>
        <h2 class="pj-title"><span>@</span>${builtIn ? `<span class="pj-name pj-name-fixed" title="@triage is built in: where new tasks land">${escapeHtml(l.name)}</span>` : `<input class="pj-name" value="${escapeHtml(l.name)}" size="${Math.max(4, l.name.length)}" maxlength="30" spellcheck="false" aria-label="Project name" title="Click to rename">`}<button type="button" class="pj-switch" title="Go to another project or the Dashboard" aria-label="Switch project" aria-haspopup="menu">▾</button></h2>
        ${labels.length ? `<div class="pj-labels" title="This project's label: all its tasks count as it">${labels.map(lab => `
          <button type="button" class="pj-label ${l.label === lab.id ? 'on' : ''}" data-label="${lab.id}" style="--c:${lab.color}">#${escapeHtml(lab.shortcut)}</button>`).join('')}</div>` : ''}
        <span class="muted pj-stats">${waiting.length} not planned · ${planned.length} planned · ${done.length} done</span>
        ${builtIn ? '' : `<button type="button" class="pj-delete" title="Delete this project (and its tasks not planned yet). Asks first."><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`}
      </div>
      <div class="pj-grid">
        <section class="pj-tasks">
          <div class="pj-box">
            <h3>Not planned <span class="count">${waiting.length}</span></h3>
            <div class="list-col pj-list" data-drop="list" data-list="${id}">
              <div class="list">${waiting.map(t => Cards.html(t, 'list')).join('')}</div>
              <button type="button" class="col-add" data-list="${id}">+ Add</button>
            </div>
          </div>
          <div class="pj-box">
            <h3>Planned <span class="count">${planned.length}</span></h3>
            ${planned.length ? `<div class="list">${planned.map(t => Cards.html(t, 'project')).join('')}</div>`
              : '<p class="pj-empty">Nothing planned yet. Drag a task onto a day, or type one with a day ("… tomorrow").</p>'}
          </div>
          <div class="pj-box">
            <h3>Done <span class="count">${done.length}</span></h3>
            ${done.length ? doneHtml(visibleDone) : '<p class="pj-empty">Nothing done yet.</p>'}
            ${done.length > RECENT_DONE ? `<button type="button" class="link-btn pj-more" data-more>${showAllDone ? 'Show only the latest' : `Show all ${done.length} done`}</button>` : ''}
          </div>
        </section>
        <section class="pj-box pj-notes">
          <h3>Notes ${editing ? '' : '<button type="button" class="link-btn pj-notes-edit">Edit</button>'}</h3>
          ${!editing && offer && offer.length ? `
            <div class="pj-offer">
              <span>You added ${offer.length} list item${offer.length === 1 ? '' : 's'}. Add ${offer.length === 1 ? 'it' : 'them'} to @${escapeHtml(l.name)} as ${offer.length === 1 ? 'a task' : 'tasks'}?</span>
              <button type="button" class="primary pj-offer-yes">Add ${offer.length === 1 ? 'as a task' : `${offer.length} as tasks`}</button>
              <button type="button" class="link-btn pj-offer-no">Not now</button>
            </div>` : ''}
          ${editing ? notesEditorHtml(l) : notesViewHtml(l)}
        </section>
      </div>`;
    if (editing) {
      const box = view.querySelector('.pj-notes-input');
      if (draft !== undefined) box.value = draft;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    } else decorateNotes(l);
  }

  // Done tasks, newest first, under a small date heading per day.
  function doneHtml(items) {
    let last = null, html = '';
    items.forEach(t => {
      if (t.doneOn !== last) { html += `<div class="pj-day">${formatDay(t.doneOn)}</div>`; last = t.doneOn; }
      html += Cards.html(t, 'done');
    });
    return `<div class="list">${html}</div>`;
  }

  // ---- notes ------------------------------------------------------------------------------

  // Looks like Markdown? (a heading, a list, a quote, a code fence, **bold**, `code` or a [link](…))
  const MARKDOWN = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```)|\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/;
  const isMarkdown = text => MARKDOWN.test(text);
  const canRender = () => typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined';

  // The Markdown tools (marked + DOMPurify, ~19 KB) aren't needed on the Dashboard, so they load
  // only when needed: when notes with Markdown are first shown (meanwhile they show as plain
  // text, then redraw), or quietly once the app is idle, so a project usually opens ready.
  const LIBS = ['https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
                'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js'];
  let libsLoading = null;
  function loadMarkdown() {
    libsLoading = libsLoading || Promise.all(LIBS.map(src => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    }))).then(() => { if (currentId()) render(); }, err => console.error('Markdown tools did not load', err));
    return libsLoading;
  }
  window.addEventListener('load', () => (window.requestIdleCallback || setTimeout)(() => loadMarkdown(), { timeout: 3000 }));

  function notesViewHtml(l) {
    const text = l.notes || '';
    if (!text.trim()) return '<button type="button" class="pj-notes-empty">No notes yet. Click to write. Markdown works: # headings, - lists, **bold**, [links](…), and @project links.</button>';
    if (isMarkdown(text) && !canRender()) loadMarkdown();   // plain text until it's here
    const html = isMarkdown(text) && canRender()
      ? DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }))
      : `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    return `<div class="pj-notes-view ${isMarkdown(text) ? 'md' : 'plain'}">${html}</div>`;
  }

  function notesEditorHtml(l) {
    return `
      <textarea class="pj-notes-input" spellcheck="true" placeholder="Write anything. Markdown works (# headings, - lists, **bold**, [links](https://…)); type @project to link a project.">${escapeHtml(l.notes || '')}</textarea>
      <div class="pj-notes-actions"><span class="muted">Saved when you click Done (or press ⌘/Ctrl + Enter).</span><button type="button" class="primary pj-notes-done">Done</button></div>`;
  }

  // After drawing the notes: @project links, links open in a new tab, and list → task buttons.
  function decorateNotes(l) {
    const box = view.querySelector('.pj-notes-view');
    if (!box) return;
    box.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
    linkProjects(box);
    if (box.classList.contains('md')) addTaskButtons(box, l);
  }

  // "@kitchenReno" → a link to that project (only for projects that exist; not in code or links).
  function linkProjects(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest('a, code, pre') || !/@[A-Za-z]/.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parts = node.nodeValue.split(/(@[A-Za-z][A-Za-z0-9]{0,29})/);
      if (parts.length < 2) return;
      const frag = document.createDocumentFragment();
      parts.forEach(part => {
        const target = part.startsWith('@') && Tasks.findList(part.slice(1));
        if (target) {
          const a = document.createElement('a');
          a.href = href(target);
          a.className = 'pj-link';
          a.textContent = `@${target.name}`;
          frag.appendChild(a);
        } else frag.appendChild(document.createTextNode(part));
      });
      node.replaceWith(frag);
    });
  }

  // The list lines of the notes, in order (skipping code blocks): { index, text, added }.
  // Nothing is written into the notes to remember which lines became tasks: a line counts as
  // "added" while this project has a task with the same title (not planned, planned or done).
  // So deleting that task, renaming it, or moving it to another project brings "+ task" back.
  const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*?)\s*$/;
  function listLines(text, id) {
    const titles = id ? projectTitles(id) : new Map();
    const out = [];
    let fenced = false;
    text.split('\n').forEach((line, index) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return; }
      const m = !fenced && line.match(LIST_LINE);
      const task = m && titles.get(sameTitle(taskTitle(m[4])));
      if (m) out.push({ index, text: m[4], added: Boolean(task), task });
    });
    return out;
  }
  // "**Buy** [tiles](https://…) `now`" → "Buy tiles now"
  const plainTitle = s => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]+/g, '').trim();
  // The title a line gets as a task (quick-add shortcuts like p1 or #label come out, as when adding).
  const taskTitle = s => App.parseQuickAdd(plainTitle(s)).title;
  const sameTitle = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  // This project's tasks by title. With several of the same title, the one shown is the next
  // planned, else one not planned yet, else the latest done.
  function projectTitles(id) {
    const { waiting, planned, done } = Tasks.projectTasks(id);   // planned: soonest first; done: latest first
    const byTitle = new Map();
    [...planned, ...waiting, ...done].forEach(t => { if (!byTitle.has(sameTitle(t.title))) byTitle.set(sameTitle(t.title), t); });
    return byTitle;
  }

  // The tag on a notes line that is a task: where that task is now.
  //   Captured as task · Planned today · Planned tomorrow 6 PM · Planned Thu, Nov 27 · Overdue · Done
  function statusOf(t) {
    if (t.doneOn) return { text: 'Done', kind: 'done', title: `Done ${formatDay(t.doneOn)}` };
    if (!t.planDate) return { text: 'Captured as task', kind: 'waiting', title: 'In this project, not planned yet' };
    const time = t.startMin != null ? ` ${formatTime(t.startMin).replace(':00', '')}` : '';   // 6 PM, 6:30 PM
    if (t.planDate < todayISO()) return { text: 'Overdue', kind: 'overdue', title: `Was planned for ${formatDay(t.planDate)}${time}` };
    const day = t.planDate === todayISO() ? 'today' : t.planDate === addDays(todayISO(), 1) ? 'tomorrow' : formatDay(t.planDate);
    return { text: `Planned ${day}${time}`, kind: 'planned', title: 'On your plan' };
  }

  // Each list item gets a "+ task" (shown on hover); a line that already is one of this
  // project's tasks shows "added as task" instead.
  function addTaskButtons(box, l) {
    const items = [...box.querySelectorAll('li')];
    const lines = listLines(l.notes || '', l.id);
    if (items.length !== lines.length) return;   // couldn't match lines to the drawing: no buttons
    items.forEach((li, i) => {
      const holder = li.querySelector(':scope > p') || li;   // (loose lists wrap text in <p>)
      if (lines[i].task) {   // a button: click to open the task
        const s = statusOf(lines[i].task);
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = `pj-added pj-added-${s.kind}`;
        tag.dataset.task = lines[i].task.id;
        tag.title = `${s.title}. Click to open the task.`;
        tag.textContent = s.text;
        holder.insertBefore(tag, holder.querySelector(':scope > ul, :scope > ol'));
        return;
      }
      if (!taskTitle(lines[i].text)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pj-to-task';
      b.dataset.lines = lines[i].index;
      b.title = 'Add this line as a task in this project';
      b.textContent = '+ task';
      holder.insertBefore(b, holder.querySelector(':scope > ul, :scope > ol'));
    });
  }

  // List items in `now` that weren't in `before` (by their text) and aren't tasks yet: offered once.
  function newListItems(before, now, id) {
    const old = new Set(listLines(before).map(x => sameTitle(taskTitle(x.text))));
    return listLines(now, id).filter(x => !x.added && taskTitle(x.text) && !old.has(sameTitle(taskTitle(x.text)))).map(x => x.index);
  }

  // Turn note lines into tasks in this project (one-way). The notes themselves aren't changed.
  function linesToTasks(id, indexes) {
    const l = Tasks.list(id);
    const lines = (l.notes || '').split('\n');
    const created = [];
    const seen = projectTitles(id);
    indexes.forEach(i => {
      const m = lines[i] && lines[i].match(LIST_LINE);
      const title = m && plainTitle(m[4]);
      if (!title || seen.has(sameTitle(taskTitle(m[4])))) return;   // (a repeated line: once)
      const task = App.addFromText(title, { list: id });
      if (!task) return;
      created.push(task.id);
      seen.add(sameTitle(task.title));
    });
    if (!created.length) return;
    App.toast(`Added ${created.length} task${created.length === 1 ? '' : 's'} to @${l.name}`, 'Undo', () => {
      created.forEach(tid => { if (Tasks.get(tid)) Tasks.remove(tid); });
    });
  }

  function saveNotes() {
    const box = view.querySelector('.pj-notes-input');
    const id = currentId();
    if (box && id && box.value !== (Tasks.list(id).notes || '')) Tasks.setListNotes(id, box.value);
  }

  // ---- clicks -----------------------------------------------------------------------------

  view.addEventListener('click', e => {
    const id = currentId();
    if (!id) return;
    if (e.target.closest('.pj-back')) { e.preventDefault(); location.hash = ''; return; }
    if (e.target.closest('.pj-delete')) return deleteProject(id);
    const chip = e.target.closest('.pj-label');
    if (chip) return Tasks.setListLabel(id, Tasks.list(id).label === chip.dataset.label ? null : chip.dataset.label);
    if (e.target.closest('.pj-notes-edit, .pj-notes-empty')) { editing = true; offer = null; editStart = Tasks.list(id).notes || ''; return render(); }
    if (e.target.closest('.pj-notes-done')) return finishEditing(id);
    if (e.target.closest('.pj-offer-yes')) { const lines = offer; offer = null; return linesToTasks(id, lines); }
    if (e.target.closest('.pj-offer-no')) { offer = null; return render(); }
    if (e.target.closest('[data-more]')) { showAllDone = !showAllDone; return render(); }
    const tag = e.target.closest('.pj-added[data-task]');
    if (tag) return TaskView.open(tag.dataset.task);
    const add = e.target.closest('.pj-to-task');
    if (add) return linesToTasks(id, add.dataset.lines.split(',').map(Number));
  });
  view.addEventListener('keydown', e => {
    if (e.target.matches('.pj-notes-input') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finishEditing(currentId());
    if (e.target.matches('.pj-name') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.target.matches('.pj-name') && e.key === 'Escape') { e.target.value = Tasks.list(currentId()).name; e.target.blur(); }
  });
  view.addEventListener('input', e => { if (e.target.matches('.pj-name')) e.target.size = Math.max(4, e.target.value.length); });
  view.addEventListener('change', e => {   // rename (Enter or clicking away)
    if (!e.target.matches('.pj-name')) return;
    const id = currentId();
    const name = e.target.value.trim().replace(/^@/, '');
    if (!id || name === Tasks.list(id).name) return;
    const result = Tasks.renameList(id, name);
    if (typeof result === 'string') { App.toast(result); e.target.value = Tasks.list(id).name; }
  });

  function finishEditing(id) {
    saveNotes();
    editing = false;
    const added = newListItems(editStart, Tasks.list(id).notes || '', id);
    offer = added.length ? added : null;
    render();
  }

  // Delete the project and its tasks not planned yet (planned / done ones stay, with no project).
  // Asks first (a project can hold a lot), then still offers Undo.
  function deleteProject(id) {
    const name = Tasks.list(id).name;
    const { waiting, planned, done } = Tasks.projectTasks(id);
    const n = waiting.length, kept = planned.length + done.length;
    const question = `Delete @${name}${n ? ` and its ${n} task${n === 1 ? '' : 's'} not planned yet` : ''}?`
      + (kept ? `\n\nIts ${kept} planned or done task${kept === 1 ? '' : 's'} will stay, moved to @triage.` : '');
    if (!confirm(question)) return;
    const removed = Tasks.removeList(id);
    location.hash = '';
    App.toast(`Deleted @${name}`, 'Undo', () => Tasks.restoreList(removed));
  }
  view.addEventListener('focusout', e => {   // clicking away saves too (but stays in edit mode)
    if (e.target.matches('.pj-notes-input')) saveNotes();
  });

  return { render, currentId, href };
})();
