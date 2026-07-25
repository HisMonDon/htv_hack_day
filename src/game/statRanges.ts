import type { AbilityStatRanges, LaneType } from "./types";

// Spec 4.4 — bot lane's own ability rolls are scaled up relative to the human
// lane at the same wave number, to compensate for weaker scripted play.
// Tune this constant; do not remove the bias.
export const BOT_LANE_DIFFICULTY_MULTIPLIER = 1.4;

// Spec 3.3 — no currency system, power comes purely from wave-scaled ranges.
// Returns the min/max numeric ranges an ability's stats must be clamped into
// for the given wave and lane. laneType "bot" ranges are scaled up by
// BOT_LANE_DIFFICULTY_MULTIPLIER relative to "human" at the same wave.
export function getStatRangesForWave(
  waveNumber: number,
  laneType: LaneType,
): AbilityStatRanges {
  // TODO: implement real wave-scaled curve (damage/cooldown/AoE/projectile
  // count/etc). Apply BOT_LANE_DIFFICULTY_MULTIPLIER to the "bot" lane here,
  // not to zombie stats.
  throw new Error("getStatRangesForWave not implemented");
}
