import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';

/**
 * Design-system checks: token contrast (WCAG 2.2) and a guardrail against the
 * visual patterns docs/design-tokens.md bans. See that doc for the rationale.
 */

const tokens = Object.fromEntries([...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('design tokens', () => {
  it('defines every token the components rely on', () => {
    for (const name of [
      'canvas', 'surface', 'surface-muted', 'line', 'line-strong',
      'ink', 'ink-muted', 'ink-subtle',
      'accent', 'accent-hover', 'accent-soft',
      'success-ink', 'success-soft', 'success-line',
      'warning-ink', 'warning-soft', 'warning-line',
      'danger-ink', 'danger-soft', 'danger-line'
    ]) {
      expect(tokens[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  // Text: WCAG 1.4.3 AA (4.5:1). Every pairing used for body-size text.
  const textPairs: [string, string][] = [
    ...['ink', 'ink-muted', 'ink-subtle'].flatMap(t => ['surface', 'canvas', 'surface-muted'].map(bg => [t, bg] as [string, string])),
    ['accent', 'surface'], ['accent', 'canvas'], ['accent', 'accent-soft'],
    ['surface', 'accent'], ['surface', 'accent-hover'],
    ['success-ink', 'surface'], ['success-ink', 'success-soft'],
    ['warning-ink', 'surface'], ['warning-ink', 'warning-soft'],
    ['danger-ink', 'surface'], ['danger-ink', 'danger-soft'],
    ['ink', 'accent-soft'], ['ink', 'success-soft'], ['ink', 'warning-soft'], ['ink', 'danger-soft']
  ];
  it.each(textPairs)('%s text on %s meets 4.5:1', (fg, bg) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // Focus indicator and status icons: WCAG 1.4.11 non-text contrast (3:1).
  it.each([
    ['accent', 'surface'],
    ['accent', 'canvas'],
    ['success-line', 'surface'],
    ['danger-line', 'surface']
  ])('%s against %s meets 3:1 for focus rings and icons', (fg, bg) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });

  it('keeps amber line decorative only (below 3:1, so icons use warning-ink)', () => {
    expect(contrast(tokens['warning-line'], tokens.surface)).toBeLessThan(3);
    expect(contrast(tokens['warning-ink'], tokens.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

// Patterns docs/design-tokens.md bans in component source.
const BANNED: [RegExp, string][] = [
  [/\bbg-(linear|gradient|radial|conic)-/, 'gradients'],
  [/\bshadow-(md|lg|xl|2xl)\b/, 'large shadows'],
  [/\bshadow-[a-z]+-\d+/, 'coloured shadows'],
  [/\banimate-pulse\b/, 'pulsing decoration'],
  [/\btracking-wide(r|st)?\b/, 'wide letter spacing'],
  [/\bbackdrop-blur/, 'backdrop blur'],
  [/\brounded-(xl|2xl|3xl)\b/, 'oversized radii'],
  [/\b(bg|text|border|ring|outline|from|to|via|divide|fill|stroke|accent|decoration|placeholder)-(slate|gray|zinc|neutral|sky|blue|indigo|violet|purple|emerald|green|rose|red|amber|yellow|teal|cyan|pink|fuchsia|orange|lime)-\d{2,3}\b/, 'raw palette colours (use tokens)'],
  [/\btransition-all\b/, 'transition-all (use transition-colors)'],
  [/\btext-\[(9|10|11)px\]/, 'text below 12px'],
  [/#(020617|0f172a|090d16|1e293b)\b|rgb\(\s*76,\s*29,\s*41\)/i, 'hard-coded dark colours'],
  // Inline styles and raw HTML strings bypass the class checks above.
  [/\b(radial|linear|conic)-gradient\(/, 'CSS gradients'],
  [/\banimation\s*:/, 'inline animation']
];

// Vite reads the sources at test time; no Node APIs needed in browser-typed code.
const sources = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true });
const componentFiles = () => Object.entries(sources).map(([file, text]) => ({ file: file.replace('../', 'src/'), text }));

describe('design guardrail', () => {
  // Enabled once the restyle is complete (docs/design-tokens.md).
  it.each(BANNED)('no component uses %s (%s)', (pattern, label) => {
    const offenders = componentFiles().flatMap(({ file, text }) =>
      text.split('\n').flatMap((line: string, i: number) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim().slice(0, 100)}`] : []))
    );
    expect(offenders, `${label}:\n${offenders.join('\n')}`).toEqual([]);
  });
});

// The global stylesheet is where a theme regression lands first.
describe('global stylesheet', () => {
  const outsideTheme = css.replace(/@theme\s*{[^}]*}/, '');

  it('uses tokens, not raw colours, outside @theme', () => {
    expect(outsideTheme.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
  });

  it('has no gradients, keyframes or extra font imports', () => {
    expect(css).not.toMatch(/gradient\(|@keyframes|fonts\.googleapis/);
  });

  it('keeps the canvas background, Inter and the accent focus ring', () => {
    expect(outsideTheme).toMatch(/background-color:\s*var\(--color-canvas\)/);
    expect(css).toMatch(/--font-sans:\s*'Inter'/);
    expect(outsideTheme).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid var\(--color-accent\)/);
  });
});
