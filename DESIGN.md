# Revenue Register — Design System

Dark by default, with a light-mode toggle. The look follows the OGSERC brand: deep emerald from the logo lettering, and the gold of the lightning bolt.

**What makes it distinct:** the Registry app is mint-green on neutral black. This app is **gold on emerald**. Gold marks money, and emerald marks the brand and "confirmed". Staff should recognise which app they are in from across the room.

**Where the boldness goes:** in one place, the signature revenue card on the Dashboard. Everything else stays quiet and disciplined: thin borders, calm surfaces, and gradients only where they mean something.

---

## 1. Colour tokens

Define these as CSS variables on `:root` for light mode and on `.dark` for dark mode. Tailwind reads them through `theme.extend.colors`. Do not hard-code hex values in components.

### Dark mode (default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#06110C` | Page background (green-black, not neutral) |
| `--surface` | `#0B1913` | Sidebar, cards |
| `--surface-raised` | `#10221A` | Inputs, table header, popovers |
| `--border` | `#1B3226` | Hairline borders, 1px |
| `--text` | `#E7F2EC` | Primary text |
| `--text-muted` | `#8EA99A` | Secondary text, helper text |
| `--emerald-900` | `#185B39` | Brand deep (from logo) |
| `--emerald-600` | `#1EA066` | Brand (from logo) |
| `--emerald-400` | `#3FD08A` | Bright brand, "Confirmed", focus ring |
| `--gold-400` | `#FFE27A` | Gold highlight |
| `--gold-500` | `#FDCD0A` | Lightning gold (from logo), money accent |
| `--gold-700` | `#E29A06` | Deep gold |
| `--amber` | `#F5B83D` | Pending Confirmation |
| `--rose` | `#F0616D` | Overdue, errors, Reversed actions |
| `--sky` | `#5AB0F0` | Info, Non-IGR in charts |
| `--slate` | `#6B7C74` | Reversed and cancelled rows |

### Light mode

| Token | Hex |
|---|---|
| `--bg` | `#F4F8F5` |
| `--surface` | `#FFFFFF` |
| `--surface-raised` | `#EEF4F0` |
| `--border` | `#D5E3DA` |
| `--text` | `#0B1F15` |
| `--text-muted` | `#4F6A5B` |

The brand and status colours stay the same in light mode. The one change: gold text in light mode uses `--gold-700`, so it keeps enough contrast.

### Gradients (only these four)

| Name | Value | Where |
|---|---|---|
| `--grad-brand` | `linear-gradient(135deg, #185B39 0%, #1EA066 55%, #3FD08A 100%)` | Primary buttons, the active sidebar item, the progress bar fill |
| `--grad-gold-text` | `linear-gradient(180deg, #FFE27A 0%, #FDCD0A 45%, #E29A06 100%)` | The ₦ figure on the signature revenue card only (`background-clip: text`) |
| `--grad-signature` | `radial-gradient(120% 140% at 0% 0%, rgba(30,160,102,.35) 0%, transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(253,205,10,.18) 0%, transparent 60%), var(--surface)` | Background of the signature revenue card and the sign-in card glow |
| `--grad-page-glow` | `radial-gradient(60% 50% at 0% 0%, rgba(30,160,102,.10), transparent 70%)` | Fixed behind the whole app, very faint |

**Text on brand gradients:** primary buttons use dark text `#03140B`. That reads well on the bright end of the gradient. Do not put white text on it.

---

## 2. Typography

- **Family:** Geist Sans, loaded with `next/font` so the font is self-hosted. Use one family throughout, which is distinct from the Registry app's look.
- **Scale (px):** 12 · 13 · 14 (body) · 16 · 20 · 24 · 32 · 44 (the signature figure only).
- **Weights:** 400 for body, 500 for labels and table headers, 600 for headings and figures. Nothing heavier.
- **Money:**
  - Always use `font-variant-numeric: tabular-nums` and right-align it in tables.
  - Show the ₦ sign at 0.8em in `--text-muted` before the figure.
  - Format as `₦31,050,000.00` in tables. Abbreviate (`₦111.1m`, `₦3.33bn`) only in KPI cards, with the full figure in a tooltip.
- **Labels:** sentence case everywhere. The Registry screenshot used all-caps group labels ("WORKSPACE"). This app uses small sentence-case group labels in `--text-muted` instead, which keeps it calmer and visibly different.
- **Line length:** body text and helper text stay under 80 characters.

---

## 3. Layout

### App shell

```
┌──────────────────┬───────────────────────────────────────────────────────┐
│ [logo] Revenue   │ Dashboard        FY 2026 ▾   As at 02 Nov 2026         │
│ Register         │                               [2 pending]   [theme]    │
│ Receipts, billing├───────────────────────────────────────────────────────┤
│ & collections    │                                                       │
│                  │  Page title                                           │
│ Overview         │  One-line description of what this page is for        │
│ [ Dashboard    ] │                                                       │
│                  │  [ page content ]                                     │
│ Daily work       │                                                       │
│   New receipt    │                                                       │
│   Register       │                                                       │
│   New demand ... │                                                       │
│   Demand notices │                                                       │
│   Payers         │                                                       │
│                  │                                                       │
│ Reports & control│                                                       │
│ Fees & budget    │                                                       │
│ Admin            │                                                       │
│ ┌──────────────┐ │                                                       │
│ │ K  kamiye    │ │                                                       │
│ │    Admin     │ │                                                       │
│ │ Change pass- │ │                                                       │
│ │ word Sign out│ │                                                       │
│ └──────────────┘ │                                                       │
└──────────────────┴───────────────────────────────────────────────────────┘
```

- **Sidebar** (264px, `--surface`, right border):
  - The logo with the product name "Revenue Register" and the tagline "Receipts, billing & collections".
  - Groups: Overview, Daily work, Reports & control, Fees & budget, Admin. Show each group only to the roles that can use it.
  - The active item gets a pill filled with `--grad-brand` and dark text.
  - The user card at the bottom matches the reference: an initial avatar, name, role, "Change password" and "Sign out".
  - Below 1024px the sidebar collapses to icons. On mobile it becomes a slide-over.
- **Top bar:**
  - Left: the page name.
  - Right: an FY switcher chip, "As at 02 Nov 2026", and a **pending badge** (amber, Finance and Admin only). Clicking the badge opens the Register filtered to Pending.
  - Then the theme toggle.
- **Content:** max width 1440px, 32px padding, left-aligned. Page title at 32px with a one-line description in `--text-muted` below it, as in the reference.

### Dashboard

```
┌─────────────────────────────────────────────┬──────────────────────┐
│ SIGNATURE CARD (grad-signature)             │ Pending confirmation │
│ Confirmed revenue, FY 2026                  │ ₦7.75m · 2 receipts  │
│ ₦111,100,000  ← gold gradient, 44px         ├──────────────────────┤
│ IGR ₦61.1m ▇▇▇▇▇▇▇▇▇▇▇▇░░░░░░ Non-IGR ₦50m  │ Outstanding notices  │
│ Budget to date ━━━━●──────────── 3.9%       │ ₦31.05m · 4 open     │
│ Full-year budget ₦3.33bn · 3.3% achieved    │                      │
├──────────────┬──────────────┬───────────────┴──┬───────────────────┤
│ Over 90 days │ Receipts (FY)│ Collection rate   │ Annual budget     │
│ ₦31.0m · 3   │ 16 · 1 rev.  │ 64.9%             │ ₦3.33bn (draft)   │
├──────────────┴──────────────┴──────────┬────────┴───────────────────┤
│ Collections vs budget, by month        │ Needs attention            │
│ (emerald bars, gold dashed budget line)│ list with links            │
│ "Show as table" link                   │                            │
├────────────────────────────────────────┼────────────────────────────┤
│ Top 5 payers                           │ Demand notice ageing       │
└────────────────────────────────────────┴────────────────────────────┘
```

- The signature card is the only element with a gradient background on the page. The four small KPI cards are flat `--surface` with a 1px border. Their figures use `--text`, except Over 90 days, which uses `--rose`.
- The progress bar fill uses `--grad-brand`. A small gold marker shows where budget-to-date sits.
- The two percentages are labelled exactly "Achieved vs budget to date" and "Achieved vs full-year budget".
- **Needs attention** lists real items, each with a link to it:
  - pending receipts older than 3 days,
  - demand notices over 90 days,
  - payers with no Schedule 3 category,
  - unbudgeted receipts.
- When there is nothing to show, use one plain line: "Nothing needs attention."

### Corner radius hierarchy

Different radii show which elements contain which. Do not use one radius on everything.

| Element | Radius |
|---|---|
| Shell panels, signature card | 18px |
| Cards, tables | 14px |
| Inputs, buttons, dropdowns | 10px |
| Status pills, badges | 999px |

Use no drop shadows in dark mode. Depth comes from surface colour and borders. In light mode, one soft shadow is allowed on popovers only.

---

## 4. Components

- **Buttons:**
  - Primary: `--grad-brand` with dark text.
  - Secondary: transparent with a 1px `--border` and `--text`.
  - Danger: `--rose` outline, filled on hover.
  - Labels say exactly what happens: "Save receipt", "Issue demand notice", "Confirm 3 receipts", "Reverse receipt".
- **Inputs:**
  - `--surface-raised` fill and a 1px `--border`.
  - Focus: a 2px `--emerald-400` ring with a soft glow (`box-shadow: 0 0 0 4px rgba(63,208,138,.15)`).
  - Required fields have a small dot, not an asterisk.
  - Errors appear under the field in `--rose`, saying what is wrong and how to fix it.
- **Status pills:**
  - Pending Confirmation: amber.
  - Confirmed: emerald.
  - Reversed: slate, with the row text struck through.
  - Demand notice statuses: Paid is emerald, Part-paid is gold, Overdue and Part-paid (overdue) are rose, Unpaid is muted, Cancelled is slate.
- **Data tables:**
  - Sticky header on `--surface-raised`, no zebra striping, row hover `--surface-raised`.
  - Money right-aligned with tabular figures.
  - Selected rows get an emerald left border.
  - A bulk action bar slides up from the bottom when rows are selected.
- **Form layout:**
  - Two columns on desktop: inputs on the left, a sticky **calculation panel** on the right. The panel shows the rate, basis, computed amount, and the live check line ("Part payment – balance ₦15,000,000.00").
  - Sections are separated by headings, not by boxes inside boxes.
- **Toasts:** bottom-right. They name the result, e.g. "Receipt OGSERC/RCT/2026/00018 saved".
- **Empty states:** one line saying what to do, plus the action button, e.g. "No demand notices yet. Issue the first one." with [Issue demand notice].
- **Charts (Recharts):**
  - Confirmed bars use a vertical emerald gradient (`--emerald-600` to `--emerald-900`).
  - Budget is a dashed `--gold-500` line. Non-IGR is `--sky`.
  - Gridlines use `--border`. Tooltips use the raised surface.
  - Every chart has a "Show as table" toggle.

### Sign-in page

Follow the reference layout: a centred card with the logo, product name and tagline above it, email and password fields, and a full-width primary button.

Differences from the reference:

- The background has a soft aurora behind the card: `--grad-signature` enlarged and blurred (filter: blur(60px)), at low opacity.
- The card title is "Staff sign-in", with "Accounts are created by the system administrator." below it.
- The button reads "Sign in" and uses `--grad-brand`.
- The footer reads "Ogun State Electricity Regulatory Commission".

---

## 5. Motion

Use motion only where it answers a person's action, plus one orchestrated moment. Use the `motion` library for the first three items below and CSS for the rest.

| Moment | Animation |
|---|---|
| **Dashboard first load** (the one orchestrated moment) | The signature figure counts up from 0 over 900ms (ease-out). The progress bar fills over the same 900ms. Other cards fade in at 150ms with no stagger. Runs once per session, not on every visit |
| Sidebar active item | The brand pill slides between items (shared `layoutId`), spring at about 250ms |
| Dialogs and side sheets | Fade plus scale 0.98→1 (160ms); side sheets slide in from the right (240ms) |
| Confirm receipts | Each pill cross-fades amber→emerald with a check mark that draws in (300ms). The row flashes a faint emerald tint for 600ms. KPI figures tween to their new values (400ms) |
| Reverse receipt | The strike-through line draws across the row (300ms), then the row fades to slate |
| Bulk action bar | Slides up from the bottom (200ms) |
| Toasts | Slide up and fade (200ms); they auto-dismiss after 5s |
| Loading | Skeletons with a slow shimmer (1.6s) using `--surface-raised` |

**Rules:**

- No hover lift on cards. Buttons change brightness only.
- No parallax, no bouncing, no looping decoration.
- `prefers-reduced-motion: reduce` sets every duration to 0 and turns off the count-up, so figures appear immediately.
- Animate only `transform` and `opacity`, never layout properties, so tables stay smooth.

---

## 6. Print documents

Receipts, demand notices and PDF exports are **always light**, whatever the theme. Use black text on white, the logo, and no gradients.

- Receipts show a diagonal watermark: **PROVISIONAL** in light grey until confirmed, **REVERSED** in light red if reversed.
- Pages are A4 portrait, with OGSERC details from Settings in the header.

---

## 7. Accessibility and quality floor

- Body text meets WCAG AA contrast against its surface. Check the muted text on both surfaces, in both themes.
- Focus is visible on every interactive element. Every form and table works with the keyboard alone.
- Never use colour alone to carry status. Every pill has text, and charts have labels or a table view.
- The layout is responsive down to 375px wide. On mobile, tables become stacked cards showing the key columns.

---

## 8. Brand assets

Put the official OGSERC logo file in `public/brand/` as `ogserc-logo.svg` or `ogserc-logo.png`. This is a copy of the image file only, not a code dependency on any other project. If only a raster file exists, export it at 2× resolution.
