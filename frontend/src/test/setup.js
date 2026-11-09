import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom implements neither scrollIntoView nor the clipboard API, and ChatPanel
// / YamlViewer both call them. Stub them so component tests stay focused on
// behaviour rather than on environment gaps.
Element.prototype.scrollIntoView = () => {};

// navigator.clipboard is a getter-only property, so it must be redefined
// rather than assigned.
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});