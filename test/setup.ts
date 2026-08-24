import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});

const capturedPointers = new WeakMap<Element, Set<number>>();

Object.defineProperties(HTMLElement.prototype, {
  setPointerCapture: {
    configurable: true,
    writable: true,
    value(this: HTMLElement, pointerId: number) {
      const captured = capturedPointers.get(this) ?? new Set<number>();
      captured.add(pointerId);
      capturedPointers.set(this, captured);
    }
  },
  releasePointerCapture: {
    configurable: true,
    writable: true,
    value(this: HTMLElement, pointerId: number) {
      capturedPointers.get(this)?.delete(pointerId);
    }
  },
  hasPointerCapture: {
    configurable: true,
    writable: true,
    value(this: HTMLElement, pointerId: number) {
      return capturedPointers.get(this)?.has(pointerId) ?? false;
    }
  }
});
