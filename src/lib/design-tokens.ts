/**
 * Design tokens for the UI rebuild (v2 shell + 3-room IA).
 *
 * Source of truth for spacing, typography, color, motion, and density rules.
 * Hung Phat brand restraint (editorial serif chrome, beige + pink accent) fused
 * with internal-tool density (32px default row, tabular nums, dense tables).
 *
 * Tailwind utility classes still drive layout in JSX; this module exists so
 * that:
 *   - Visx charts can read the same color + scale values used by Tailwind
 *   - Custom components have a single source for motion + density
 *   - Tests can assert on stable token values instead of literal strings
 *
 * Token names are platform-foundations compliant: status, severity, action,
 * and density labels match the PRD glossary.
 */

export const tokens = {
  /** Type ramp. Numbers are pixel sizes; line-heights paired by index. */
  type: {
    families: {
      serif:
        '"Source Serif Pro", "Source Serif 4", Georgia, "Times New Roman", serif',
      sans:
        'system-ui, -apple-system, "Segoe UI", Roboto, Inter, "Helvetica Neue", Arial, sans-serif',
      mono:
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    },
    sizes: {
      "display-xl": { size: 48, line: 56, tracking: -0.02 },
      "display-lg": { size: 36, line: 44, tracking: -0.015 },
      "display": { size: 28, line: 36, tracking: -0.01 },
      "title": { size: 20, line: 28, tracking: 0 },
      "label": { size: 14, line: 20, tracking: 0 },
      "body": { size: 14, line: 22, tracking: 0 },
      "body-sm": { size: 13, line: 20, tracking: 0 },
      "caption": { size: 12, line: 16, tracking: 0.01 },
      "metric-lg": { size: 32, line: 36, tracking: 0, weight: 600, tabular: true },
      "metric": { size: 20, line: 24, tracking: 0, weight: 600, tabular: true },
      "metric-sm": { size: 14, line: 18, tracking: 0, weight: 600, tabular: true },
    },
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  /**
   * Color palette. Light mode is the default. Dark mode mirrors with same
   * accent. Values are hex (or rgb) suitable for Visx and arbitrary Tailwind.
   *
   * `accent` is HP signature pink, used sparingly for one primary action per
   * screen + signal-critical state. `severity` is reserved for signal chrome.
   */
  color: {
    light: {
      bgPage: "#F8F4EE", // warm beige
      bgSurface: "#FFFFFF",
      bgSubtle: "#F1ECE3",
      border: "#E6DFD2",
      borderStrong: "#C9C0AE",
      text: "#1F1A14",
      textMuted: "#5A5346",
      textSubtle: "#8B8470",
      accent: "#e91d79", // HP pink
      accentInk: "#FFFFFF",
      accentHover: "#c9166a",
      accentSubtle: "#FDE6EE",
      focus: "#e91d79",
    },
    dark: {
      bgPage: "#16110A",
      bgSurface: "#1F1A12",
      bgSubtle: "#241E15",
      border: "#3A3122",
      borderStrong: "#5A5040",
      text: "#F4EFE3",
      textMuted: "#B3AC97",
      textSubtle: "#857E69",
      accent: "#F26595",
      accentInk: "#1A0F14",
      accentHover: "#F58AB0",
      accentSubtle: "#3A1E2A",
      focus: "#F26595",
    },
    severity: {
      info: { fg: "#0F4C75", bg: "#E0F0FA" },
      warn: { fg: "#7A4900", bg: "#FFEFD4" },
      critical: { fg: "#7A1A1A", bg: "#FBE0DE" },
    },
    chart: {
      // Sequence used by Visx series. Ordered for accessible adjacency.
      series: [
        "#1F4B8A",
        "#e91d79",
        "#3F7A66",
        "#B07535",
        "#6B4D8C",
        "#3C8A8C",
        "#A8392B",
      ],
      axis: "#8B8470",
      gridline: "#E6DFD2",
    },
    status: {
      live: "#1F7A4D",
      paused: "#8B8470",
      off: "#5A5346",
      queued: "#5A5346",
      running: "#0F4C75",
      done: "#1F7A4D",
      failed: "#7A1A1A",
      snoozed: "#7A4900",
      assigned: "#1F4B8A",
    },
  },

  /** 4px base unit. Composite spacings keep rhythm consistent. */
  space: {
    "0": 0,
    "0.5": 2,
    "1": 4,
    "1.5": 6,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "8": 32,
    "10": 40,
    "12": 48,
    "16": 64,
    "20": 80,
  },

  /**
   * Density rules (per PRD). Row height applies to tables, list items, and
   * conversation list rows. Card padding never exceeds `cardMax`.
   */
  density: {
    rowDefault: 32,
    rowCompact: 24,
    rowComfortable: 40,
    cardPadding: 16,
    cardMax: 16,
    cardRadius: 8,
    chipHeight: 22,
  },

  /** Motion: short cross-fades + ease for state changes only. */
  motion: {
    fast: { duration: 80, ease: "ease-out" },
    base: { duration: 120, ease: "ease-in-out" },
    slow: { duration: 200, ease: "ease-in-out" },
  },

  /** Touch targets: PRD requires 44 minimum, 8 spacing. */
  touch: {
    minTargetPx: 44,
    minGapPx: 8,
  },

  /** Z-index ladder so popovers/drawers never collide. */
  z: {
    base: 0,
    sticky: 10,
    drawer: 40,
    overlay: 50,
    palette: 60,
    toast: 70,
    tooltip: 80,
  },

  /**
   * Breakpoint thresholds (px). Match Tailwind defaults so existing utilities
   * stay aligned.
   */
  breakpoint: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    "2xl": 1536,
  },
} as const;

export type DesignTokens = typeof tokens;

/**
 * Picks the appropriate palette for the current color scheme. Server-safe;
 * `prefersDark` is intended to be supplied by a layout-level theme provider.
 */
export function palette(prefersDark: boolean) {
  return prefersDark ? tokens.color.dark : tokens.color.light;
}

/**
 * Resolves a status word (PRD glossary) to a stable foreground color hex.
 * Returns null for unknown values so callers can branch on missing.
 */
export function statusColor(status: string): string | null {
  const normalized = status.toLowerCase() as keyof typeof tokens.color.status;
  return tokens.color.status[normalized] ?? null;
}

/**
 * Severity (signal engine) → fg/bg pair.
 */
export function severityColors(
  severity: "info" | "warn" | "critical",
): { fg: string; bg: string } {
  return tokens.color.severity[severity];
}
