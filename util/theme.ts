export const THEMES = ["rose", "lagoon", "moss", "noir", "vapor"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  rose: "Rose gold",
  lagoon: "Midnight lagoon",
  moss: "Moss cathedral",
  noir: "Noir ember",
  vapor: "Vapor",
};

const STORAGE_KEY = "msn-theme";

export function loadTheme(): Theme {
  if (typeof window === "undefined") return "rose";
  const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  return saved && THEMES.includes(saved) ? saved : "rose";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function nextTheme(current: Theme): Theme {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length];
}
