/**
 * Shared class strings for the patterns in docs/design-tokens.md, so buttons
 * and panels look the same everywhere.
 */

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium bg-accent text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-sm border border-line-strong bg-surface text-ink hover:bg-surface-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** Small secondary button for inline actions (copy, open, toggles). */
export const btnSmall =
  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs border border-line-strong bg-surface text-ink hover:bg-surface-muted transition-colors';

export const panel = 'bg-surface border border-line rounded-md';

export const chip = 'inline-flex items-center rounded px-1.5 py-0.5 text-xs border border-line bg-surface-muted text-ink-muted';
