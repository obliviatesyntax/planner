// project.js — a project's own page: #project/<list id>.
//
// A project is one of your lists (not @triage, which is only an inbox). Its page shows:
//   • Notes: free text, shown as Markdown when it looks like Markdown (headings, lists, **bold**,
//     links, code, quotes, tables…), plain text otherwise. Two special things in notes:
//       @projectName   → a link to that project's page
//       any list       → "Add N as tasks" (whole list) and "+ task" (one line), one-way: the task is
//                        created in this project and the line gets a " ✓" so it isn't added twice.
//                        Tasks and notes aren't kept in sync afterwards (tasks can move anywhere).
//   • Tasks: not planned yet (the list itself: drag into it, "+ Add"), planned on a day (with the
//     day and time), and done (the 3 most recent; "Show all" for the rest).
// Quick add on this page puts tasks into this project unless you type another @list.
// The browser's Back button, or "← Plan", returns to the dashboard.

const Project = (() => {
  const view = document.getElementById('project-view');
  const dashboard = ['planner', 'lists'].map(id => document.getElementById(id));
  const RECENT_DONE = 3;
  let editing = false;     // notes in edit mode?
  let showAllDone = false;
  let shownId = null;

  // The project in the address (#project/<id>), if it exists and is a real project.
  function currentId() {
    const m = location.hash.match(/^#project\/(.+)$/);
    const id = m && decodeURIComponent(m[1]);
    return id && id !== TRIAGE_LIST.id && Tasks.list(id) ? id : null;
  }

  window.addEventListener('hashchange', () => { editing = false; showAllDone = false; App.renderAll(); window.scrollTo(0, 0); });

  function render() {
    const id = currentId();
    if (location.hash.startsWith('#project/') && !id) history.replaceState(null, '', location.pathname + location.search);   // deleted / unknown
    view.hidden = !id;
    dashboard.forEach(el => { el.hidden = Boolean(id); });
    if (!id) { shownId = null; return; }
    if (shownId !== id) { editing = false; showAllDone = false; shownId = id; }
    const l = Tasks.list(id);
    const { waiting, planned, done } = Tasks.projectTasks(id);
    const lab = l.label && Tasks.label(l.label);
    const visibleDone = showAllDone ? done : done.slice(0, RECENT_DONE);
    const draft = editing ? view.querySelector('.pj-notes-input')?.value : undefined;   // keep unsaved typing

    view.innerHTML = `
      <div class="pj-head">
        <a href="#" class="pj-back" title="Back to the plan">← Plan</a>
        <h2>@${escapeHtml(l.name)}</h2>
        ${lab ? `<span class="tag" style="--c:${lab.color}">#${escapeHtml(lab.shortcut)}</span>` : ''}
        <span class="muted pj-stats">${waiting.length} not planned · ${planned.length} planned · ${done.length} done</span>
        <button type="button" class="secondary pj-edit" title="Rename, give it a label, or delete it">Edit</button>
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

  function notesViewHtml(l) {
    const text = l.notes || '';
    if (!text.trim()) return '<button type="button" class="pj-notes-empty">No notes yet. Click to write. Markdown works: # headings, - lists, **bold**, [links](…), and @project links.</button>';
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
        if (target && target.id !== TRIAGE_LIST.id) {
          const a = document.createElement('a');
          a.href = `#project/${target.id}`;
          a.className = 'pj-link';
          a.textContent = `@${target.name}`;
          frag.appendChild(a);
        } else frag.appendChild(document.createTextNode(part));
      });
      node.replaceWith(frag);
    });
  }

  // The list lines of the notes, in order (skipping code blocks): { index, text, added }.
  const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*?)\s*$/;
  const ADDED = ' ✓';
  function listLines(text) {
    const out = [];
    let fenced = false;
    text.split('\n').forEach((line, index) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return; }
      const m = !fenced && line.match(LIST_LINE);
      if (m) out.push({ index, text: m[4], added: m[4].endsWith(ADDED.trim()) });
    });
    return out;
  }
  // "**Buy** [tiles](https://…) `now`" → "Buy tiles now"
  const plainTitle = s => s.replace(/\s*✓\s*$/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]+/g, '').trim();

  // Each list item gets "+ task"; each top-level list gets "Add N as tasks".
  function addTaskButtons(box, l) {
    const items = [...box.querySelectorAll('li')];
    const lines = listLines(l.notes || '');
    if (items.length !== lines.length) return;   // couldn't match lines to the drawing: no buttons
    items.forEach((li, i) => {
      li.dataset.line = lines[i].index;
      if (lines[i].added || !plainTitle(lines[i].text)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pj-to-task';
      b.dataset.lines = lines[i].index;
      b.title = 'Add this line as a task in this project';
      b.textContent = '+ task';
      (li.querySelector(':scope > p') || li).appendChild(b);   // (loose lists wrap text in <p>)
    });
    box.querySelectorAll('ul, ol').forEach(list => {
      if (list.parentElement.closest('ul, ol')) return;   // nested lists are covered by their top list
      const open = [...list.querySelectorAll('li')].map(li => lines[items.indexOf(li)]).filter(x => x && !x.added && plainTitle(x.text));
      if (open.length < 2) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pj-to-tasks';
      b.dataset.lines = open.map(x => x.index).join(',');
      b.textContent = `+ Add ${open.length} as tasks`;
      list.after(b);
    });
  }

  // Turn note lines into tasks in this project (one-way), and mark the lines with " ✓".
  function linesToTasks(id, indexes) {
    const l = Tasks.list(id);
    const lines = (l.notes || '').split('\n');
    const before = l.notes;
    const created = [];
    indexes.forEach(i => {
      const m = lines[i] && lines[i].match(LIST_LINE);
      const title = m && plainTitle(m[4]);
      if (!title) return;
      const task = App.addFromText(title, { list: id });
      if (!task) return;
      created.push(task.id);
      lines[i] = lines[i].replace(/\s*$/, '') + ADDED;
    });
    if (!created.length) return;
    Tasks.setListNotes(id, lines.join('\n'));
    App.toast(`Added ${created.length} task${created.length === 1 ? '' : 's'} to @${l.name}`, 'Undo', () => {
      created.forEach(tid => { if (Tasks.get(tid)) Tasks.remove(tid); });
      Tasks.setListNotes(id, before);
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
    if (e.target.closest('.pj-edit')) return Lists.openList(id);
    if (e.target.closest('.pj-notes-edit, .pj-notes-empty')) { editing = true; return render(); }
    if (e.target.closest('.pj-notes-done')) { editing = false; saveNotes(); return render(); }
    if (e.target.closest('[data-more]')) { showAllDone = !showAllDone; return render(); }
    const add = e.target.closest('.pj-to-task, .pj-to-tasks');
    if (add) return linesToTasks(id, add.dataset.lines.split(',').map(Number));
  });
  view.addEventListener('keydown', e => {
    if (e.target.matches('.pj-notes-input') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { editing = false; saveNotes(); render(); }
  });
  view.addEventListener('focusout', e => {   // clicking away saves too (but stays in edit mode)
    if (e.target.matches('.pj-notes-input')) saveNotes();
  });

  return { render, currentId };
})();
