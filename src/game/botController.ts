import type { Ability, LaneState } from "./types";

// Spec section 5 — scripted (not real AI) bot lane behavior. Kept as one
// small, isolated module so it's easy to tune or replace independently of
// the rest of the game. No ML, no pathfinding graph.

export interface BotMoveIntent {
  dx: number;
  dy: number;
}

// Simple heuristic: move toward the nearest cluster of zombie threats when
// healthy, retreat when low on health. No pathfinding, no group coordination.
export function decideBotMovement(laneState: LaneState): BotMoveIntent {
  // TODO: implement seek-toward-threat / retreat-when-low-health heuristic.
  throw new Error("decideBotMovement not implemented");
}

// Fires whichever equipped ability is off cooldown when a zombie is in
// range. No complex targeting — first eligible ability wins.
export function decideBotAbilityUse(laneState: LaneState): Ability | null {
  // TODO: check each equipped ability's cooldown state against the current
  // zombie positions and return the first one that's ready and in range,
  // or null if none are usable this frame.
  throw new Error("decideBotAbilityUse not implemented");
}

// Spec 1, step 4 — bot lane's version of the human pick phase. Bot always
// "picks" one of the two pre-generated options via this scripted logic
// instead of a UI click.
export function decideBotAbilityPick(options: [Ability, Ability]): 0 | 1 {
  // TODO: implement a simple heuristic (e.g. prefer the option whose
  // category is least represented in the current loadout). Falls back to
  // index 0 like the human auto-pick-on-timeout behavior.
  throw new Error("decideBotAbilityPick not implemented");
}
