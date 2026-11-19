# UI/UX: phone vs desktop

How Planner behaves differently on phones and on computers, why, and where each rule lives
in the code. Keep this up to date when you change a breakpoint or add a device-specific rule.

## Breakpoints at a glance

"Phone" and "narrow" are decided by screen width (and, in one place, by touch). There is no
user-agent sniffing: a narrow desktop window behaves like a phone.

| Width / condition | Name used here | What changes | Where |
|---|---|---|---|
| ≤ 600px | small phone | Task window becomes a bottom sheet | `styles.css` (`@media (max-width: 600px)`) |
| ≤ 700px | **phone** | Quick-add bar moves to the bottom; brand, date, name and gear hidden; phone default view; no Week view; calendar "compressed" from 2 days up; phone setting used | `styles.css` (`max-width: 700px`), `js/planner.js` (`phoneQuery`), `js/settings.js` (`deviceKey`) |
| ≤ 900px | narrow | Plan stacks (Done today below the days); 1-day view stacks to-do above the calendar; tighter page padding | `styles.css` (`max-width: 900px`) |
| ≤ 900px **or** touch screen | narrow/touch | Drop bar appears while dragging a task | `js/dnd.js` (`narrow`) |
| touch input (any width) | touch | Swipe gestures on tasks | `js/swipe.js` (`pointerType === 'touch'`) |
| ≤ 960px / ≤ 640px | landing | Landing page reflows (see the end of this doc) | `styles.css` (landing section) |

## The app, side by side

| | Desktop | Phone (≤ 700px) |
|---|---|---|
| **Top bar** | Pinned at the **top**. Left: logo, "Planner", live date & time. Centre: quick add (box with **i** inside, mic, Add). Right: first name (email on hover) and a settings gear. | Pinned at the **bottom** for thumb reach. Only the logo and quick add (box with **i**, mic, Add). No name, date or gear (Settings is in the footer). Respects the iPhone home bar. |
| **Quick-add live preview** | Drops down under the box | Opens **upward**, above the bar |
| **Toasts / Undo** | Bottom centre of the screen | Just above the bottom bar |
| **Settings & Sign out** | Gear (top right) + footer buttons | Footer buttons only |
| **Default plan view** | **2 days** (setting: "On a computer, open in") | **1 day** (setting: "On a phone, open in") |
| **Views offered** | 1 day · 2 days · Week · List | 1 day · 2 days · List (**no Week**: seven columns don't fit) |
| **1-day view** | To-do list on the left, tall calendar on the right | To-do list above the calendar |
| **Done today panel** | Right of the plan, sticky | Below the plan |
| **Calendar blocks** | Relaxed in 1 day and 2 days (short time + P tag); compressed in Week | Relaxed in 1 day; compressed in 2 days (see below) |
| **Task hover buttons (P # 🗑)** | Appear on mouse hover, floating over the text | No hover on touch; a tap opens the task window instead (use swipes or the window) |
| **Opening a task** | Click a task: centred window | Tap a task: **bottom sheet** (≤ 600px) |
| **Task window labels** | Field names shown (Priority, Labels, Day, Time, List) | Priority and Labels rows have no names (self-explanatory); Day/Time/List use small icons; hint text and "Changes save automatically" hidden |
| **Moving tasks** | Drag and drop anywhere; or the task window's Move block | Drag (with the **drop bar**: Today · Tomorrow · @triage · Done), **swipe**, or the task window's Move block |
| **Swipe gestures** | — | Swipe **right** = done (or not done); swipe **left** = next day (planned task) or today (list task); Undo toast |
| **Text boxes** | 14px | 16px, so iPhones don't zoom in when you tap them |
| **Voice input (mic)** | Chrome, Edge, Safari | Same: depends on the browser, not the device; hidden where unsupported (e.g. Firefox) |

## Why it's this way

- **Thumb reach.** On phones the thing you use most (adding a task) sits at the bottom; on
  desktop the top is where eyes start.
- **Space is the constraint on phones.** One day by default, no repeated times on calendar
  blocks when columns are narrow (the grid already shows the hour), no field names where the
  control explains itself, hints hidden.
- **Hover doesn't exist on touch.** Anything only reachable by hovering (P, #, delete) also has
  a touch route: tap to open the task window, or swipe.
- **Native drag and drop is weak on phones.** Browsers don't scroll the page during a touch
  drag (and some barely start one), so phones get the drop bar (targets come to you) and
  swipes. The planned long-term fix is our own pointer-based drag: long-press to pick a task
  up, the page auto-scrolls near the screen edges, and the same code works for mouse and touch.
- **Things that work the same everywhere:** click/tap a list's header to rename or delete it;
  "+ Add" under Done today or a past day logs a task as already done on that day.
- **Same data, different defaults.** Settings that depend on screen size (default view) are
  stored per device type; everything else is shared across devices.

## Relaxed vs compressed calendar blocks (internal concept)

Not a user-facing term. It's about how much a task card can show in the width it has.

**What it applies to:** everything inside the **day columns** of a compressed view: calendar
blocks, the day's to-do cards, and a past day's done cards. **Not** the lists below the plan and
**not** the "Done today" panel, which have room to spare.

**Which views are which**

| View | Desktop | Phone |
|---|---|---|
| 1 day | relaxed | relaxed |
| 2 days | relaxed | **compressed** |
| Week | **compressed** | not offered on phones |
| List | (no blocks: times are written next to each task) | same |

**What a block shows**

```
RELAXED (roomy columns)                     COMPRESSED (narrow columns)

┃☐ Design review  10–11              P2     ┃☐ Design review
┃☐ 1:1 with Sam  10:30–11:15                ┃☐ 1:1 with Sam
┃☐ Standup  12:00–12:30              P1     ┃☐ Standup
^                                           ^
coloured edge (priority)                    thicker coloured edge (4px) carries the priority
```

| | Relaxed | Compressed |
|---|---|---|
| Checkbox + title | ✓ | ✓ |
| Time | Short, no AM/PM, smaller than the title: `10–11`, `10:30–11:15`, `12:00–12:30` (24-hour: `14–15`) | Hidden (the hour grid already shows it) |
| P1 / P2 / P3 tag | Shown at the right | Hidden; appears on hover |
| Priority colour on the left edge | 3px | 4px |
| Labels (#w) | Shown | Shown if they fit |
| Hover buttons (P # 🗑) | Float over the text | **None**: click/tap the card to open it and set priority, labels or delete there |
| Applies to | — | Calendar blocks, to-do cards and past-day done cards in the day columns |

**Why:** in a narrow column every character counts. The time repeats what the grid says, and the
P tag repeats what the edge colour says, so both go. Edge colours are chosen to be told apart at
a glance: **P1 red** (#dc2626), **P2 amber** (#f5b301), **P3 blue** (#2563eb); no priority = grey.
(P2 text on tags uses a darker amber, #b45309, so it stays readable.)

**Code:** decided in `Planner.render()` (`js/planner.js`, `Calendar.setCompressed(...)`); a
card gets the `compressed` class in `Cards.html()` (`js/cards.js`) unless it's in a list or the
Done today panel (`size = 'panel'`); the styles are `.card.compressed` in `styles.css`.

## Calendar sizing (same on both)

- Slot height: 22px per half hour (`CALENDAR.slotPx` in `js/config.js`).
- Visible window: from an hour before now to the end of today's last upcoming task, between
  4 hours (setting, default 4) and 9 hours.
- Blocks are never shorter than one slot; under 30 minutes they use smaller text; 30 minutes
  or less is a single line.

## Landing page (signed out)

| | Desktop | ≤ 960px | ≤ 640px (phone) |
|---|---|---|---|
| Menu links (Why, Features…) | Shown | Hidden | Hidden; only "Get started" in the menu bar |
| Hero | Text left, sign-in card right | Stacked | Stacked; buttons full width, one per row |
| App preview animation | Full (days, Done today, 4 lists) | Same | Done today hidden; 2 lists shown |
| Feature / step cards | 3 columns | 2 columns | 1 column |
| Comparison table | 3 columns | 3 columns | Row title on its own line, then the two answers |

## Checklist when adding something new

1. Does it rely on **hover**? Give it a tap/swipe route too.
2. Does it pop up near the **bottom** of the screen? On phones it must sit above the bottom bar
   (see `.toast`, `.drop-bar`, `.qa-preview` in the `max-width: 700px` block).
3. Does it add a **text box**? Use 16px text on phones.
4. Does it add **labels or hints**? Consider hiding them under 600px if the control is clear.
5. Is the behaviour about **screen size** rather than personal taste? If so, it may need a
   per-device setting like the default view.
