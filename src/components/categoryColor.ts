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

// Canvas 2D fillStyle/strokeStyle can't resolve CSS custom properties, so
// combat VFX fallback shapes (game/useCombatEffects.ts) need the same
// category colors as literal hex values, kept in sync with theme.css by hand.
export function categoryColorHex(category: AbilityCategory): string {
  switch (category) {
    case "OFFENSE":
      return "#c4552b";
    case "MOBILITY":
      return "#3b8fa3";
    case "DEFENSE":
      return "#6b8e4e";
    case "UTILITY":
      return "#8a7bae";
  }
}
