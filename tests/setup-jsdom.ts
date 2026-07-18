// Loaded by Vitest before each component test (the ones that opt into the
// jsdom environment via `@vitest-environment jsdom`). Wires up the matchers
// from @testing-library/jest-dom (`toBeInTheDocument`, `toHaveClass`, …)
// and provides DOM API polyfills that jsdom lacks but Tailwind / Next.js
// components routinely call.

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia. Some Tailwind utilities and a few
// Next.js components touch it on mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Stub scrollIntoView — used by Onboarding to bring the highlighted target
// into view; jsdom doesn't implement it.
if (typeof window !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// jsdom 29 exposes a `localStorage` accessor that resolves to Node's native
// implementation, which is disabled unless node is started with
// `--localstorage-file`. The property is therefore present but reads back as
// undefined, so anything touching window.localStorage throws. Substitute an
// in-memory Storage; tests want isolation from a real profile anyway.
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string) {
      return map.has(String(key)) ? map.get(String(key))! : null;
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
    removeItem(key: string) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
  return storage;
}

if (typeof window !== 'undefined') {
  for (const prop of ['localStorage', 'sessionStorage'] as const) {
    // Read through a try/catch: jsdom's accessor can also throw outright
    // (SecurityError on an opaque origin) rather than returning undefined.
    let usable = false;
    try {
      usable = Boolean(window[prop]) && typeof window[prop].setItem === 'function';
    } catch {
      usable = false;
    }
    if (!usable) {
      Object.defineProperty(window, prop, {
        value: createMemoryStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}
