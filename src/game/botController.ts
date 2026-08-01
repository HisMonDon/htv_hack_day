import type { Ability, ActiveZombie, Position } from "./types";

// Spec section 5 — scripted (not real AI) bot lane behavior. Kept as one
// small, isolated module so it's easy to tune or replace independently of
// the rest of the game. No ML, no pathfinding graph.

export interface BotMoveIntent {
  dx: number;
  dy: number;
}

export const BOT_LOW_HEALTH_RATIO = 0.3;
export const BOT_MOVE_SPEED = 90;
export const BOT_PICK_DELAY_SECONDS = 1;

// The slice of live lane state decideBotMovement/decideBotAbilityUse
// actually need — narrower than the full LaneState (which also carries
// unrelated timer/UI fields) so usePlayerCombat.ts's per-frame tick loop can
// build one of these straight from its own refs without assembling a whole
// LaneState snapshot every frame.
export interface BotDecisionState {
  activeZombies: ActiveZombie[];
  actorPosition: Position;
  health: number;
  maxHealth: number;
  equippedAbilities: [Ability, Ability];
  abilityCooldownRemainingSeconds: [number, number];
}

function distanceBetween(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function directionFromTo(from: Position, to: Position): BotMoveIntent {
  const distance = distanceBetween(from, to);
  if (distance === 0) return { dx: 0, dy: 0 };
  return { dx: (to.x - from.x) / distance, dy: (to.y - from.y) / distance };
}

// Simple heuristic: move toward the nearest cluster of zombie threats when
// healthy, retreat when low on health. No pathfinding, no group coordination.
export function decideBotMovement(state: BotDecisionState): BotMoveIntent {
  const { activeZombies, actorPosition } = state;
  if (activeZombies.length === 0) return { dx: 0, dy: 0 };

  // Treat zombies near the closest one as a threat cluster. This is deliberately
  // local and deterministic: it is not pathfinding or global route planning.
  const nearest = activeZombies.reduce((closest, zombie) =>
    distanceBetween(actorPosition, zombie.position) < distanceBetween(actorPosition, closest.position)
      ? zombie
      : closest,
  );
  const clusterRadius = 100;
  const cluster = activeZombies.filter(
    (zombie) => distanceBetween(nearest.position, zombie.position) <= clusterRadius,
  );
  const target = cluster.reduce(
    (sum, zombie) => ({ x: sum.x + zombie.position.x, y: sum.y + zombie.position.y }),
    { x: 0, y: 0 },
  );
  target.x /= cluster.length;
  target.y /= cluster.length;

  const towardThreat = directionFromTo(actorPosition, target);
  const isLowHealth = state.health / state.maxHealth <= BOT_LOW_HEALTH_RATIO;
  return isLowHealth
    ? { dx: -towardThreat.dx, dy: -towardThreat.dy }
    : towardThreat;
}

// Fires whichever equipped ability is off cooldown when a zombie is in
// range. No complex targeting — first eligible ability wins.
export function decideBotAbilityUse(state: BotDecisionState): Ability | null {
  for (const [index, ability] of state.equippedAbilities.entries()) {
    if (state.abilityCooldownRemainingSeconds[index] > 0) continue;

    const hasTargetInRange = state.activeZombies.some(
      (zombie) => distanceBetween(state.actorPosition, zombie.position) <= ability.range,
    );
    if (hasTargetInRange) return ability;
  }
  return null;
}

// Spec 1, step 4 — bot lane's version of the human pick phase. Bot always
// "picks" one of the two pre-generated options via this scripted logic
// instead of a UI click.
export function decideBotAbilityPick(
  options: [Ability, Ability],
  equippedAbilities: [Ability, Ability] = options,
): 0 | 1 {
  const categoryCount = (category: Ability["category"]) =>
    equippedAbilities.filter((ability) => ability.category === category).length;

  // Prefer diversifying the two-slot loadout. Equal counts intentionally fall
  // back to option 0, which mirrors the human timeout rule.
  return categoryCount(options[1].category) < categoryCount(options[0].category) ? 1 : 0;
}
