// utils.js — small helpers used everywhere.

// Local date as "YYYY-MM-DD" (not UTC, so "today" matches your clock).
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return toISO(new Date());
}

// "2026-11-15" -> "Sun, Nov 15"
function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Always escape user text before putting it into HTML.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function areaLabel(id) {
  return (AREAS.find(a => a.id === id) || {}).label || id;
}

function bucketLabel(id) {
  return (BUCKETS.find(b => b.id === id) || {}).label || id;
}
