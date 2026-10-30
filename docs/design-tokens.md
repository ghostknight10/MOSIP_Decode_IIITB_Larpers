# Design Tokens & Visual Rules

The playground should look like a sober developer tool from the Inji family, not a generic AI-generated dashboard. This page is the single source for colours, type and visual rules. **Read it before changing any UI, and give it to any AI assistant you use for UI work.**

- Tokens live in [`frontend/src/index.css`](../frontend/src/index.css) (`@theme`). Tailwind generates classes from them: `bg-surface`, `text-ink-muted`, `border-line`, `text-danger-ink`, and so on.
- [`frontend/src/test/design.test.ts`](../frontend/src/test/design.test.ts) checks contrast for every token pairing, and fails the build if a component uses a banned pattern (see [Guardrail](#guardrail)).

---

## Tokens

### Surfaces, lines, text

| Token | Hex | Use |
| --- | --- | --- |
| `canvas` | `#fafbfd` | Page background (Inji Verify's page colour) |
| `surface` | `#ffffff` | Panels, cards, inputs |
| `surface-muted` | `#f4f5f7` | Code blocks, table headers, subtle fills, disabled controls |
| `line` | `#e1e4ea` | Borders, dividers (default border colour) |
| `line-strong` | `#c4c9d2` | Input borders, emphasised dividers |
| `ink` | `#1b1e24` | Primary text |
| `ink-muted` | `#454b57` | Secondary text, labels |
| `ink-subtle` | `#626977` | Hints, metadata, placeholders |

### Interaction

| Token | Hex | Use |
| --- | --- | --- |
| `accent` | `#951f6f` | **The only interaction colour** (MOSIP plum): primary buttons, links, selected states, focus outline |
| `accent-hover` | `#7a1959` | Hover/active state of `accent` fills |
| `accent-soft` | `#f8eef4` | Background of selected items |

### Status

Each status has three tokens: `*-ink` for **text and icons**, `*-soft` for **fills**, and `*-line` for **borders only**.

| Status | ink | soft | line | Means |
| --- | --- | --- | --- | --- |
| `success` | `#2f6b27` | `#eef8ec` | `#57a04b` | Valid, pass, done |
| `warning` | `#7a4f00` | `#fff5e3` | `#d98c00` | Emulated sandbox, tampered input, over-disclosure |
| `danger` | `#a32d2c` | `#fdeeee` | `#cb4241` | Invalid, fail, error |

Inji Verify's raw status colours are kept as `*-line`. `success-line` and `danger-line` reach 3:1 against white, which is enough for borders. `warning-line` doesn't (2.7:1), so **icons always use `*-ink`**.

### Dark theme

Light is the default. The header has a **Dark mode** toggle; the choice is saved in `localStorage` (`mosip-playground-theme`), and nothing is saved until someone uses it. Dark sets `data-theme="dark"` on `<html>`, which overrides the same token names, so components never branch on the theme. It applies on screen only: printing stays light.

| Token | Dark value |
| --- | --- |
| `canvas` / `surface` / `surface-muted` | `#12141a` / `#1a1d24` / `#232731` |
| `line` / `line-strong` | `#333845` / `#4a5162` |
| `ink` / `ink-muted` / `ink-subtle` | `#eceef2` / `#b8bec9` / `#959cab` |
| `accent` / `accent-hover` / `accent-soft` | `#e885c6` / `#f0a0d4` / `#2d1b28` |
| `success` ink / soft / line | `#86d57a` / `#17261a` / `#4d9a43` |
| `warning` ink / soft / line | `#f0b84a` / `#2b2210` / `#b87d00` |
| `danger` ink / soft / line | `#ff8a85` / `#2e1a1b` / `#d9514f` |

Two tokens exist so nothing needs a fixed colour: `on-accent` (text on an `accent` fill: white in light, dark in dark) and `scrim` (dimming behind dialogs). Contrast is tested for both themes. QR codes keep a white frame in both, because scanners need dark-on-light.

### Type

| Token | Value | Use |
| --- | --- | --- |
| `font-sans` | Inter | All UI text (Inji's font) |
| `font-mono` | JetBrains Mono | **Data only:** JSON, URIs, transaction IDs, wire formats, claim names |

Sizes: `text-xs` (12px) is the minimum, `text-sm` (14px) is body text in panels, and `text-base`/`text-lg` are for headings. Weights: 400, 500, 600 (headings and labels).

---

## Rules

1. **Flat surfaces.** Panels are `bg-surface` with a 1px `border-line`. No gradients, glows, coloured shadows or backdrop blur. `shadow-sm` is allowed only on floating elements (dialogs, popovers).
2. **Small radii.** `rounded` (4px) for controls, `rounded-md` (6px) for panels and cards. `rounded-full` only for status pills and dots.
3. **One accent.** `accent` means "you can act here" or "this is selected". Status colours mean status, and nothing else. Role, format and protocol chips are neutral (`bg-surface-muted text-ink-muted`).
4. **Never colour alone** (WCAG 1.4.1). Every status has an icon *and* a text label.
5. **Sentence case.** No `uppercase` with `tracking-wider` eyebrow labels. Headings say what the section is ("Run history", not "RUN HISTORY").
6. **Quiet motion.** `transition-colors` for hover and selection only. No pulse, no decorative animation. A spinner only while a request is in flight. `prefers-reduced-motion` is respected globally.
7. **Meaningful icons only.** Status, actions and roles get icons; headings don't. No sparkles or decorative icons.
8. **One primary button per area.** Primary is `bg-accent text-on-accent hover:bg-accent-hover`. Secondary is `bg-surface border-line-strong text-ink hover:bg-surface-muted`.
9. **Focus is for focus.** A global 2px `accent` outline with a 2px offset on `:focus-visible`. Don't remove it, and don't reuse the focus style for anything else.
10. **Real data over decoration.** Show actual payloads, IDs and counts. Empty states are one plain sentence that says what to do next.

### Common patterns

| Element | Classes |
| --- | --- |
| Panel | `bg-surface border border-line rounded-md p-4` |
| Section heading | `text-base font-semibold text-ink` |
| Label / hint | `text-xs text-ink-muted` / `text-xs text-ink-subtle` |
| Primary button | `bg-accent text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-accent-hover transition-colors` |
| Secondary button | `bg-surface border border-line-strong text-ink rounded px-3 py-1.5 text-sm hover:bg-surface-muted transition-colors` |
| Selected option | `border-accent bg-accent-soft` |
| Status pill | `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-success-soft text-success-ink` (+ icon) |
| Code block | `bg-surface-muted border border-line rounded-md p-3 font-mono text-xs` |
| Table header | `bg-surface-muted text-ink-muted text-xs font-medium` |

---

## Guardrail

`design.test.ts` scans every component and fails on:

- `bg-linear-*`, `bg-gradient-*`, `bg-radial-*`: gradients
- `shadow-md` or larger, or coloured shadows
- `animate-pulse`
- `tracking-wide*`
- `backdrop-blur*`
- `rounded-xl` or larger
- raw palette colours such as `text-emerald-300` or `bg-slate-900` (use tokens)
- `transition-all`
- text smaller than 12px
- fixed `text-white`, `text-black` or `bg-black` (use `on-accent`, `scrim`, so dark mode works)
- inline `…-gradient(` or `animation:` in style attributes or HTML strings

It also checks `frontend/src/index.css`, where a theme regression lands first:

- no raw colours (hex or `rgb()`) outside `@theme`; use `var(--color-…)`
- no gradients, `@keyframes` or extra Google Fonts imports
- the body background is `var(--color-canvas)`, `--font-sans` starts with Inter, and `:focus-visible` uses the `accent` outline

If you have a real need for an exception, change the rule here first and explain why.

---

## Why

- **The "AI look":** design writers list the same tells (purple/indigo gradients, oversized radii, glows, wide-tracked uppercase labels, pulsing "live" badges, dark by default) and recommend explicit tokens plus a written design doc as the fix:
  - [noqta, "AI design slop"](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026)
  - [prg.sh, "Why your AI keeps building the same purple gradient website"](https://scour.ing/@emschwartz/p/https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
  - [GeekyAnts](https://geekyants.com/blog/why-everything-your-ai-builds-looks-the-same)
- **[IBM Carbon colour](https://carbondesignsystem.com/elements/color/overview/):** neutral grey layers, one interaction colour, other colours "used sparingly and purposefully", focus at 3:1.
- **[GitHub Primer colour](https://primer.style/foundations/color/overview):** neutral surfaces, colour through functional tokens.
- **GOV.UK ([brand colour](https://brand.design-system.service.gov.uk/colour/govuk-blue), [styles](https://design-system.service.gov.uk/styles/colour)):** "Do not mix colours to create gradients", don't invent colours, use functional variables, reserve the focus colour for focus.
- **[MOSIP Inji Verify](https://github.com/mosip/inji-verify)** (`verify-ui/src/index.css`): the light theme, plum primary, Inter and the status colours this palette is based on.
- **[WCAG 2.2](https://www.w3.org/TR/WCAG22/):** 1.4.1 (use of colour), 1.4.3 (contrast, 4.5:1) and 1.4.11 (non-text contrast, 3:1), all checked by the design test.
