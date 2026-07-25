import type { AbilityStatRanges, LaneType, StatRange } from "./types";

// Spec 4.4 — bot lane's own ability rolls are scaled up relative to the human
// lane at the same wave number, to compensate for weaker scripted play.
// Tune this constant; do not remove the bias.
export const BOT_LANE_DIFFICULTY_MULTIPLIER = 1.4;

function scaleRange(range: StatRange, multiplier: number): StatRange {
  return { min: range.min * multiplier, max: range.max * multiplier };
}

// Inverse scale for stats where "lower is stronger" (cooldown).
function scaleRangeInverse(range: StatRange, multiplier: number): StatRange {
  return { min: range.min / multiplier, max: range.max / multiplier };
}

// Spec 3.3 — no currency system, power comes purely from wave-scaled ranges.
// Returns the min/max numeric ranges an ability's stats must be clamped into
// for the given wave and lane. Deliberately simple linear growth — tune
// freely, this is not meant to be a final balance curve.
export function getStatRangesForWave(
  waveNumber: number,
  laneType: LaneType,
): AbilityStatRanges {
  const wave = Math.max(1, waveNumber);

  const base: AbilityStatRanges = {
    damage: { min: 5 + wave * 1.5, max: 12 + wave * 2.5 },
    cooldownSeconds: { min: Math.max(0.8, 4 - wave * 0.05), max: Math.max(1.5, 7 - wave * 0.05) },
    range: { min: 3 + wave * 0.1, max: 8 + wave * 0.25 },
    areaOfEffect: { min: 1, max: 2 + wave * 0.15 },
    durationSeconds: { min: 0.5, max: 2 + wave * 0.1 },
    projectileCount: { min: 1, max: 1 + Math.floor(wave / 5) },
    projectileSpeed: { min: 5, max: 10 + wave * 0.3 },
    knockback: { min: 0, max: 1 + wave * 0.1 },
  };

  if (laneType === "human") {
    return base;
  }

  // Bot lane: offensive/utility power stats scale up, cooldown scales down
  // (faster) — both make the bot's rolls stronger, never weaker.
  return {
    damage: scaleRange(base.damage!, BOT_LANE_DIFFICULTY_MULTIPLIER),
    cooldownSeconds: scaleRangeInverse(base.cooldownSeconds, BOT_LANE_DIFFICULTY_MULTIPLIER),
    range: scaleRange(base.range, BOT_LANE_DIFFICULTY_MULTIPLIER),
    areaOfEffect: scaleRange(base.areaOfEffect!, BOT_LANE_DIFFICULTY_MULTIPLIER),
    durationSeconds: scaleRange(base.durationSeconds!, BOT_LANE_DIFFICULTY_MULTIPLIER),
    projectileCount: scaleRange(base.projectileCount!, BOT_LANE_DIFFICULTY_MULTIPLIER),
    projectileSpeed: scaleRange(base.projectileSpeed!, BOT_LANE_DIFFICULTY_MULTIPLIER),
    knockback: scaleRange(base.knockback!, BOT_LANE_DIFFICULTY_MULTIPLIER),
  };
}
