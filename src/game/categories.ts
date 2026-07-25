import type { AbilityCategory } from "./types";

const ALL_CATEGORIES: AbilityCategory[] = ["OFFENSE", "MOBILITY", "DEFENSE", "UTILITY"];

// Spec 3.2 — category enforcement is code-side, not prompt-trust. Pick two
// distinct categories in code first; generateAbility is then called once per
// chosen category, and the response's category field is validated against
// what was requested here.
export function pickTwoCategories(): [AbilityCategory, AbilityCategory] {
  const first = ALL_CATEGORIES[Math.floor(Math.random() * ALL_CATEGORIES.length)];
  const remaining = ALL_CATEGORIES.filter((category) => category !== first);
  const second = remaining[Math.floor(Math.random() * remaining.length)];
  return [first, second];
}
