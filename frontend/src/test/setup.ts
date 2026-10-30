import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node >= 25 defines its own global localStorage (undefined without
// --localstorage-file), which stops Vitest copying jsdom's onto globalThis.
// Use the jsdom instance's storage directly. No-op on Node 22 (CI).
const jsdomStorage = (globalThis as any).jsdom?.window?.localStorage;
if (jsdomStorage && !globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { value: jsdomStorage, configurable: true });
}

// The onboarding tour starts for a first-time visitor; tests are not one.
beforeEach(() => {
  localStorage.setItem('mosip-playground-tour', 'done');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
