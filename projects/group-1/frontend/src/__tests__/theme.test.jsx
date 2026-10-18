import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "../components/ThemeToggle.jsx";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(cleanup);

describe("Theme toggle", () => {
  it("starts in bright mode", () => {
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /dark mode/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("switches to dark and back", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /dark mode/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /bright mode/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("remembers the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /dark mode/i }));
    cleanup();
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
