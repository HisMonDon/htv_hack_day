import type { Ability, AbilityStatRanges } from "./types";

// Spec 3.3 / 4.3 — never trust Gemini's raw numeric output. Every numeric
// field on a generated ability must be clamped into the range returned by
// getStatRangesForWave before the ability is used or displayed.
export function clampAbilityToRange(
  ability: Ability,
  ranges: AbilityStatRanges,
): Ability {
  // TODO: clamp damage, cooldownSeconds, range, areaOfEffect,
  // durationSeconds, projectileCount, projectileSpeed, knockback (and
  // statusEffect.magnitude/durationSeconds) into their matching StatRange.
  // Fields with no configured range, or null values, pass through unchanged.
  throw new Error("clampAbilityToRange not implemented");
}
