/**
 * RAJA GAMING — global theme registry.
 *
 * The active theme is stored in the existing SiteSetting table under the
 * key "SITE_THEME" (admin-editable via /api/admin/settings, publicly
 * readable via /api/settings). The root layout reads it server-side and
 * sets `data-theme` on <html>; globals.css maps every `[data-theme="…"]`
 * to a full CSS-variable palette so the whole site (public pages,
 * dashboards, admin panel, mobile layouts) restyles consistently.
 *
 * Themes are presentation-only: they never touch payments, orders,
 * wallet math or API behaviour.
 */

export const DEFAULT_THEME = "royal-gold" as const;

export type ThemeId =
  | "blood-red"
  | "royal-gold"
  | "neon-purple"
  | "ice-blue"
  | "dark-shadow";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  description: string;
  /** Small colour dots for the admin picker (accent + background). */
  swatch: { accent: string; background: string; secondary: string };
};

export const THEMES: ThemeDef[] = [
  {
    id: "blood-red",
    label: "Blood Red",
    description: "Black base with crimson neon accents — intense esports energy.",
    swatch: { accent: "#ff3b46", background: "#0a0a0b", secondary: "#ff6b4a" },
  },
  {
    id: "royal-gold",
    label: "Royal Gold",
    description: "Black base with metallic gold — the classic RAJA GAMING look.",
    swatch: { accent: "#f5b90b", background: "#09090b", secondary: "#e5484d" },
  },
  {
    id: "neon-purple",
    label: "Neon Purple",
    description: "Deep purple base with violet neon glow.",
    swatch: { accent: "#a855f7", background: "#0e0a1a", secondary: "#ec4899" },
  },
  {
    id: "ice-blue",
    label: "Ice Blue",
    description: "Deep navy base with electric blue highlights.",
    swatch: { accent: "#38bdf8", background: "#050d1a", secondary: "#22d3ee" },
  },
  {
    id: "dark-shadow",
    label: "Dark Shadow",
    description: "Matte black and charcoal with clean silver details.",
    swatch: { accent: "#c8c8d0", background: "#0b0b0d", secondary: "#8b8b94" },
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as string[]).includes(value);
}

export function normalizeTheme(value: unknown): ThemeId {
  return isValidTheme(value) ? value : DEFAULT_THEME;
}

export function getThemeDef(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[1];
}
