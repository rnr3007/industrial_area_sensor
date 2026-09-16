# Design — Industrial Area Sensor (IAS Console)

A locked design system for the IAS operator console. Every view/component
redesign reads this file before emitting code. Do not regenerate per page —
extend or amend this file when the system needs to grow.

Produced by a Hallmark multi-page redesign (`.claude/skills/ias-frontend`).
The app is a 24/7 industrial water-intake / environment monitoring tool for
plant operators and EHS auditors — not a marketing site. Function carries
every page; there is no hero, no macrostructure, no nav/footer archetype.
The existing fixed left-sidebar app shell is preserved and restyled, not
replaced.

## Genre

modern-minimal — dashboard / enterprise / technical / instrument-panel is
this genre's exact trigger vocabulary.

## Theme — "Instrument" (custom)

Not a catalog pick. Closest relative is Cobalt (cool engineered paper,
hairlines, one electric-blue signal, tight radii) — but Cobalt is explicitly
a *light* theme with a single dark band. An always-on control-room console
needs a genuinely dark ground, so this locks in Cobalt's discipline inverted
to dark per the standard dark-mode recipe (paper L 12–18%, ink L 92–96%,
accent chroma trimmed, hue never shifts).

- `--color-paper` oklch(15% 0.014 250) — cool near-black, never pure `#000`
- `--color-paper-2` oklch(18.5% 0.015 250) — raised surface (panel head, table head)
- `--color-paper-3` oklch(22% 0.016 250) — further raised (modal, popover)
- `--color-rule` oklch(28% 0.014 250) — default hairline border
- `--color-rule-2` oklch(35% 0.017 250) — stronger border (inputs, focus-adjacent)
- `--color-ink` oklch(93% 0.006 250) — primary text
- `--color-ink-2` oklch(78% 0.010 250) — secondary text
- `--color-muted` oklch(58% 0.012 250) — tertiary / placeholder text
- `--color-accent` oklch(66% 0.17 254) — electric cobalt signal, <5% of any view
- `--color-accent-ink` oklch(12% 0.02 254) — text/icon on an accent fill
- `--color-focus` oklch(74% 0.15 254) — focus ring, ≥3:1 against paper and ink

Functional status tokens (semantic information, not decoration — same
category as Hallmark's own `--color-error`):
- `--color-ok` oklch(72% 0.15 152)
- `--color-warning` oklch(79% 0.14 80)
- `--color-critical` oklch(67% 0.19 25)

Paper band: dark. Display style: grotesk-sans. Accent hue: cool (254°).

## Typography

- Display: **Space Grotesk** 500/600, tight tracking (`-0.01em` to `-0.02em`) — headings, panel titles, stat values.
- Body: **IBM Plex Sans** 400/500 — the "engineering sans" register; avoids the banned Inter/Roboto/system-ui defaults while staying legible at data-dense sizes.
- Mono (outlier, one consistent role): **JetBrains Mono** 400/500 — every device ID, timestamp, coordinate, IP/topic string, and tabular numeric readout. One role, applied everywhere that role appears — not a second body face.
- Scale: 1.25 (major third), 16px body floor. Tabular numerals (`font-variant-numeric: tabular-nums`) on every metric/table value.

## Spacing

4-point named scale (`layout-and-space.md`), values in `tokens.css` / `styles.css`. Views use named tokens, never raw px.

## Radii & surfaces

- 6px — buttons, inputs, badges (pill-free; "drawn with a ruler," not Coral's soft-pill vocabulary)
- 10px — panels, modals, cards
- Hairline borders (1px, `--color-rule`) define every surface. **No side-stripe cards, no card-in-card, no drop-shadow-for-depth** — elevation comes from `--color-paper-2/3` lightness steps, matching the dark-mode recipe.

## Motion

- Easings: `--ease-out` `cubic-bezier(0.16,1,0.3,1)`, `--ease-in` `cubic-bezier(0.7,0,0.84,0)`, `--ease-in-out` `cubic-bezier(0.65,0,0.35,1)`.
- Durations: micro 120ms, short 220ms, long 420ms.
- Live telemetry values get a **number-tick** (Hallmark default-on primitive for dashboards) — counts to the new value over ~400ms, respects reduced-motion (snaps to final value).
- No page-load stagger, no parallax, no marquee. `prefers-reduced-motion: reduce` collapses everything to a ≤150ms opacity crossfade.

## Microinteractions stance

- Silent success on actions whose effect is already visible in view (row updates in place).
- Toasts reserved for: alerts (functional, not celebratory), errors, and actions whose effect isn't visible from the current view (e.g. after a modal closes).
- Hover delay 800ms / focus delay 0ms on tooltips. Focus rings never animate in.
- Optimistic UI where safe (alert acknowledge/resolve), with rollback + toast on failure.

## CTA voice

- Primary: solid `--color-accent` fill, `--color-accent-ink` text, 6px radius.
- Secondary: hairline `--color-rule-2` border, `--color-ink` text, transparent fill.
- Danger: hairline `--color-critical` border, `--color-critical` text, transparent fill.
- Never a pill. Never a gradient. Never accent as a large fill (buttons stay content-sized).

## Per-page allowances

Every page in this app is an "app page" — no enrichment, no hero, no
marketing macrostructure. Function carries the page. Pages vary only in
which data they show, not in structural voice.

## What pages MUST share

- The sidebar app shell, the wordmark, the token set, the type pairing, the CTA voice, the badge/status vocabulary (`normal` / `warning` / `critical` / `unknown`), the 6px/10px radius pair, the hairline-not-shadow surface language.

## What pages MAY differ on

- Layout of data (table vs. gauge vs. map vs. chart) per the view's actual content need.

## Exports

### tokens.css (mirrors `ias_prototype_origin/ias_frontend/src/assets/styles.css` `:root`)

```css
:root {
  --color-paper:      oklch(15% 0.014 250);
  --color-paper-2:    oklch(18.5% 0.015 250);
  --color-paper-3:    oklch(22% 0.016 250);
  --color-rule:       oklch(28% 0.014 250);
  --color-rule-2:     oklch(35% 0.017 250);
  --color-ink:        oklch(93% 0.006 250);
  --color-ink-2:      oklch(78% 0.010 250);
  --color-muted:      oklch(58% 0.012 250);
  --color-accent:     oklch(66% 0.17 254);
  --color-accent-ink: oklch(12% 0.02 254);
  --color-focus:      oklch(74% 0.15 254);
  --color-ok:         oklch(72% 0.15 152);
  --color-warning:    oklch(79% 0.14 80);
  --color-critical:   oklch(67% 0.19 25);

  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-body:    "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;
  --space-sm:  0.75rem;  --space-md:  1rem;    --space-lg: 1.5rem;
  --space-xl:  2.5rem;   --space-2xl: 4rem;    --space-3xl: 6rem;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:  cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 120ms; --dur-short: 220ms; --dur-long: 420ms;

  --radius-sm: 6px; --radius: 10px;
}
```

## Stamp

`/* Hallmark · genre: modern-minimal · theme: Instrument (custom, dark) · design-system: design.md · designed-as-app */`
