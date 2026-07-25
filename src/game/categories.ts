import type { AbilityCategory } from "./types";

// Spec 3.2 — category enforcement is code-side, not prompt-trust. Pick two
// distinct categories in code first; generateAbility is then called once per
// chosen category, and the response's category field is validated against
// what was requested here.
export function pickTwoCategories(): [AbilityCategory, AbilityCategory] {
  // TODO: randomly select two distinct values from OFFENSE / MOBILITY /
  // DEFENSE / UTILITY.
  throw new Error("pickTwoCategories not implemented");
}
