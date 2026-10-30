import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * Light is the default; dark is an opt-in the visitor chooses and the browser
 * remembers. The theme is a data-theme attribute on <html>, which swaps the
 * colour tokens in index.css. index.html applies a saved choice before the
 * first paint, so a returning dark-mode visitor never sees a light flash.
 */
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'mosip-playground-theme';

export const readTheme = (): Theme => {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light'; // storage unavailable: the default
  }
};

export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  // The browser UI (mobile address bar) follows the page background.
  const canvas = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim();
  if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas);
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  // A layout effect, so the attribute is set before any child effect reads the colours (Mermaid does).
  useLayoutEffect(() => applyTheme(theme), [theme]);

  const toggle = useCallback(() => {
    setTheme(current => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private mode: the choice lasts for this visit only.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
