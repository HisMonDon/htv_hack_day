import type { Ability, AbilityStatRanges, StatRange } from "./types";

function clampValue(value: number, range: StatRange | undefined): number {
  if (!range) return value;
  return Math.min(range.max, Math.max(range.min, value));
}

function clampNullable(value: number | null, range: StatRange | undefined): number | null {
  if (value === null) return null;
  return clampValue(value, range);
}

// Spec 3.3 / 4.3 — never trust Gemini's raw numeric output. Every numeric
// field on a generated ability is clamped into the range returned by
// getStatRangesForWave before the ability is used or displayed. Fields with
// no configured range, or null values (ability doesn't roll that stat), pass
// through unchanged.
export function clampAbilityToRange(
  ability: Ability,
  ranges: AbilityStatRanges,
): Ability {
  return {
    ...ability,
    damage: clampNullable(ability.damage, ranges.damage),
    cooldownSeconds: clampValue(ability.cooldownSeconds, ranges.cooldownSeconds),
    range: clampValue(ability.range, ranges.range),
    areaOfEffect: clampNullable(ability.areaOfEffect, ranges.areaOfEffect),
    durationSeconds: clampNullable(ability.durationSeconds, ranges.durationSeconds),
    projectileCount:
      ability.projectileCount === null
        ? null
        : Math.round(clampValue(ability.projectileCount, ranges.projectileCount)),
    projectileSpeed: clampNullable(ability.projectileSpeed, ranges.projectileSpeed),
    knockback: clampNullable(ability.knockback, ranges.knockback),
  };
}
