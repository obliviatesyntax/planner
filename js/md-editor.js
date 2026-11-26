// md-editor.js — a small Markdown editor for project notes: a toolbar over the plain text box,
// and a Write / Preview switch. Loaded only when a project page opens (project.js → loadEditor),
// so the Dashboard never downloads it. Not in index.html's script list on purpose.
//
//   Toolbar   Heading · Bold · Italic · Bullet list · Checklist · Numbered list · Quote · Link · @project
//   Keys      ⌘/Ctrl+B bold · ⌘/Ctrl+I italic · ⌘/Ctrl+K link (instead of search, while editing)
//             Enter in a list line continues the list ("- ", "- [ ] ", "2. "); Enter on an empty
//             item ends it. Tab / Shift+Tab indent and outdent list lines.
// Edits go through the browser's own insert, so ⌘Z undo keeps working.

const MdEditor = (() => {
  const ICONS = {
    heading: '<b>H</b>',
    bold: '<b>B</b>',
    italic: '<i style="font-family:Georgia,serif">I</i>',
    bullets: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    checklist: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4.5 7 1 1 2-2"/><rect x="3" y="14" width="6" height="6" rx="1"/><path d="M13 7h8M13 17h8"/></svg>',
    numbers: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 5h1v4M4 9h2M4 14.5a1 1 0 0 1 2 .3c0 .8-2 1.7-2 2.7h2" stroke-width="1.5"/></svg>',
    quote: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6l-.7-1.2C7.8 15 8.5 13.8 8.6 12H7zm8 0h4v4c0 3-1.5 5-4 6l-.7-1.2c1.5-.8 2.2-2 2.3-3.8H15z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    project: '<b>@</b>',
  };
  const TOOLS = [
    ['heading', 'Heading'], ['bold', 'Bold (⌘B)'], ['italic', 'Italic (⌘I)'], '|',
    ['bullets', 'Bullet list'], ['checklist', 'Checklist'], ['numbers', 'Numbered list'], ['quote', 'Quote'], '|',
    ['link', 'Link (⌘K)'], ['project', 'Link a project (@name)'],
  ];

  // Insert text in place of the selection, the way typing would (so undo works).
  function insert(box, text) {
    box.focus();
    if (!document.execCommand('insertText', false, text)) box.setRangeText(text, box.selectionStart, box.selectionEnd, 'end');
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Wrap the selection: **bold**, *italic*, [text](url).
  function wrap(box, before, after, placeholder) {
    const { selectionStart: s, selectionEnd: e, value } = box;
    const picked = value.slice(s, e) || placeholder;
    insert(box, before + picked + after);
    box.setSelectionRange(s + before.length, s + before.length + picked.length);   // the text stays selected
  }

  // The whole lines touched by the selection.
  function lineRange(box) {
    const { value } = box;
    const start = value.lastIndexOf('\n', box.selectionStart - 1) + 1;
    let end = value.indexOf('\n', box.selectionEnd);
    if (end < 0) end = value.length;
    return { start, end, lines: value.slice(start, end).split('\n') };
  }

  const PREFIX = /^(\s*)(#{1,6}\s|[-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s|>\s?)?/;
  // Toggle a line prefix ("## ", "- ", "- [ ] ", "1. ", "> ") on every selected line.
  function prefixLines(box, kind) {
    const { start, end, lines } = lineRange(box);
    const make = i => ({ heading: '## ', bullets: '- ', checklist: '- [ ] ', numbers: `${i + 1}. `, quote: '> ' })[kind];
    const has = line => {
      const p = (line.match(PREFIX)[2] || '');
      return kind === 'heading' ? /^#/.test(p) : kind === 'checklist' ? /\[/.test(p) : kind === 'numbers' ? /^\d/.test(p)
        : kind === 'quote' ? /^>/.test(p) : /^[-*+]\s$/.test(p);
    };
    const all = lines.every(l => !l.trim() || has(l));
    const out = lines.map((line, i) => {
      if (!line.trim() && lines.length > 1) return line;
      const [, indent, old = ''] = line.match(PREFIX);
      const rest = line.slice(indent.length + old.length);
      return indent + (all ? '' : make(i)) + rest;
    }).join('\n');
    box.setSelectionRange(start, end);
    insert(box, out);
    box.setSelectionRange(start + out.length, start + out.length);
  }

  function run(box, tool) {
    if (tool === 'bold') return wrap(box, '**', '**', 'bold text');
    if (tool === 'italic') return wrap(box, '*', '*', 'italic text');
    if (tool === 'link') {   // [selected text](https://) with the address selected: paste over it
      const { selectionStart: s, selectionEnd: e, value } = box;
      const text = value.slice(s, e) || 'link text';
      insert(box, `[${text}](https://)`);
      const at = s + text.length + 3;
      return box.setSelectionRange(at, at + 'https://'.length);
    }
    if (tool === 'project') return insert(box, '@');   // then type the project's name
    prefixLines(box, tool);
  }

  // Enter continues a list; Enter on an empty item ends it.
  function onEnter(box, e) {
    const { selectionStart: s, selectionEnd: end, value } = box;
    if (s !== end) return;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const line = value.slice(lineStart, s);
    const m = line.match(/^(\s*)([-*+]\s\[[ xX]\]\s|[-*+]\s|(\d+)([.)])\s)/);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[2].trim()) {   // an empty item: end the list
      box.setSelectionRange(lineStart, s);
      return insert(box, '');
    }
    const next = m[3] ? `${Number(m[3]) + 1}${m[4]} ` : m[2].replace(/\[[xX]\]/, '[ ]');
    insert(box, `\n${m[1]}${next}`);
  }

  function onTab(box, e) {
    const { start, end, lines } = lineRange(box);
    if (!lines.some(l => PREFIX.test(l) && (l.match(PREFIX)[2] || '').match(/^([-*+]|\d)/))) return;   // only lists indent
    e.preventDefault();
    const out = lines.map(l => (e.shiftKey ? l.replace(/^ {1,2}/, '') : `  ${l}`)).join('\n');
    box.setSelectionRange(start, end);
    insert(box, out);
  }

  // Put a toolbar and a Write / Preview switch over `box`. render(text) returns the preview HTML.
  function attach(box, { render }) {
    if (box.dataset.mdEditor) return;
    box.dataset.mdEditor = '1';
    const bar = document.createElement('div');
    bar.className = 'md-toolbar';
    bar.innerHTML = `
      <div class="md-tabs" role="tablist">
        <button type="button" class="on" data-md-tab="write" role="tab">Write</button>
        <button type="button" data-md-tab="preview" role="tab">Preview</button>
      </div>
      <div class="md-tools">${TOOLS.map(t => t === '|' ? '<span class="md-sep"></span>'
        : `<button type="button" data-md="${t[0]}" title="${t[1]}" aria-label="${t[1]}">${ICONS[t[0]]}</button>`).join('')}</div>`;
    const preview = document.createElement('div');
    preview.className = 'md-preview pj-notes-view md';
    preview.hidden = true;
    box.before(bar);
    box.after(preview);

    bar.addEventListener('mousedown', e => { if (e.target.closest('[data-md]')) e.preventDefault(); });   // keep the selection
    bar.addEventListener('click', e => {
      const tool = e.target.closest('[data-md]');
      if (tool) return run(box, tool.dataset.md);
      const tab = e.target.closest('[data-md-tab]');
      if (!tab) return;
      const showPreview = tab.dataset.mdTab === 'preview';
      bar.querySelectorAll('[data-md-tab]').forEach(b => b.classList.toggle('on', b === tab));
      bar.classList.toggle('previewing', showPreview);
      box.hidden = showPreview;
      preview.hidden = !showPreview;
      if (showPreview) preview.innerHTML = render(box.value) || '<p class="muted">Nothing to preview yet.</p>';
      else box.focus();
    });
    box.addEventListener('keydown', e => {
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
      const key = e.key.toLowerCase();
      if (mod && ['b', 'i', 'k'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();   // ⌘K here means "link", not search
        return run(box, { b: 'bold', i: 'italic', k: 'link' }[key]);
      }
      if (e.key === 'Enter' && !mod && !e.shiftKey) onEnter(box, e);
      if (e.key === 'Tab') onTab(box, e);
    });
  }

  return { attach };
})();
