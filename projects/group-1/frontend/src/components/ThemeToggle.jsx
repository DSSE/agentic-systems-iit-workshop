import { useEffect, useState } from "react";

const KEY = "campusdesk-theme";

// Bright by default. The choice is a per-browser convenience, so storage failures are ignored.
function savedTheme() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(savedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Private mode or blocked storage: the toggle still works for this visit.
    }
  }, [theme]);

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? "☀ Bright mode" : "☾ Dark mode"}
    </button>
  );
}
