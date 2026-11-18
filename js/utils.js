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

function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "2026-11-17" + 2 -> "2026-11-19"
function addDays(iso, n) {
  const date = fromISO(iso);
  date.setDate(date.getDate() + n);
  return toISO(date);
}

// "2026-11-15" -> "Sun, Nov 15"
function formatDay(iso) {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// 570 (minutes after midnight) -> "9:30 AM", or "09:30" with the 24-hour setting
function formatTime(minutes) {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  const hour12 = typeof Settings === 'undefined' || Settings.get('clock') !== '24';
  return date.toLocaleTimeString(undefined, { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 });
}

// Short time range for calendar blocks, without AM/PM (the calendar grid already shows it):
//   600–660 -> "10–11"     630–675 -> "10:30–11:15"     600–630 -> "10:00–10:30"
// (24-hour setting: "14–15", "14:30–15:15".)
function formatTimeRange(start, end) {
  const hour12 = typeof Settings === 'undefined' || Settings.get('clock') !== '24';
  const onTheHour = start % 60 === 0 && end % 60 === 0;
  const part = min => {
    let h = Math.floor(min / 60) % 24;
    if (hour12) h = h % 12 || 12;
    return onTheHour ? `${h}` : `${h}:${String(min % 60).padStart(2, '0')}`;
  };
  return `${part(start)}–${part(end)}`;
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// Always escape user text before putting it into HTML.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
