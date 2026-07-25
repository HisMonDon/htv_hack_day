import type { AbilityCategory } from "../game/types";

// Presentational lookup only — maps each category to its CSS custom
// property from styles/theme.css. Shared by HUD and AbilityCard so the
// category → color mapping stays consistent everywhere it appears.
export function categoryColorVar(category: AbilityCategory): string {
  switch (category) {
    case "OFFENSE":
      return "var(--color-offense)";
    case "MOBILITY":
      return "var(--color-mobility)";
    case "DEFENSE":
      return "var(--color-defense)";
    case "UTILITY":
      return "var(--color-utility)";
  }
}
