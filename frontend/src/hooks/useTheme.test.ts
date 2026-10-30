import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readTheme, THEME_KEY, useTheme } from './useTheme';

afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('is light by default, not following the system setting', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    expect(readTheme()).toBe('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    vi.unstubAllGlobals();
  });

  it('reads a saved dark choice', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores any other saved value', () => {
    localStorage.setItem(THEME_KEY, 'solarized');
    expect(readTheme()).toBe('light');
  });

  it('toggles, applies the attribute and remembers the choice', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('does not save anything until the visitor chooses', () => {
    renderHook(() => useTheme());
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('works with blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
  });

  it('colours the browser UI with the page background', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafbfd">';
    document.documentElement.style.setProperty('--color-canvas', '#12141a');
    applyTheme('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#12141a');
    document.documentElement.style.removeProperty('--color-canvas');
    document.head.innerHTML = '';
  });
});
