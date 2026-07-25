import type { Ability, AbilityCategory, LaneType } from "../game/types";

// Spec 3 — generates one ability option for a lane's controller.
// currentLoadout (spec 3.4) is passed so Gemini can avoid near-duplicates of
// what's already equipped. The caller (not this function) is responsible for
// calling pickTwoCategories() first and invoking this once per category, then
// clamping the result with clampAbilityToRange().
export async function generateAbility(
  waveNumber: number,
  laneType: LaneType,
  category: AbilityCategory,
  currentLoadout: Ability[],
): Promise<Ability> {
  // TODO: call geminiClient with a category-constrained prompt + loadout
  // context, validate the response against the Ability schema, and return it
  // unclamped (clamping happens separately in game/clamp.ts).
  throw new Error("generateAbility not implemented");
}
