import type { Ability, LaneState, Position } from "./types";

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
export function decideBotMovement(laneState: LaneState): BotMoveIntent {
  const { activeZombies, actorPosition } = laneState;
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
  const isLowHealth = laneState.health / laneState.maxHealth <= BOT_LOW_HEALTH_RATIO;
  return isLowHealth
    ? { dx: -towardThreat.dx, dy: -towardThreat.dy }
    : towardThreat;
}

// Fires whichever equipped ability is off cooldown when a zombie is in
// range. No complex targeting — first eligible ability wins.
export function decideBotAbilityUse(laneState: LaneState): Ability | null {
  for (const [index, ability] of laneState.equippedAbilities.entries()) {
    if (laneState.abilityCooldownRemainingSeconds[index] > 0) continue;

    const hasTargetInRange = laneState.activeZombies.some(
      (zombie) => distanceBetween(laneState.actorPosition, zombie.position) <= ability.range,
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

function clampPosition(position: Position): Position {
  return { x: Math.max(0, Math.min(480, position.x)), y: Math.max(0, Math.min(360, position.y)) };
}

// Applies only the simple bot decisions. Combat effects beyond direct ability
// damage (projectiles, barriers, statuses) remain the responsibility of the
// shared combat engine when it is added.
export function advanceBotLane(
  laneState: LaneState,
  deltaSeconds: number,
  nextAbilityOptions: [Ability, Ability],
): LaneState {
  if (!laneState.isAlive || deltaSeconds <= 0) return laneState;

  // useLaneTimer owns the COMBAT/PICKING transitions and ability choices in
  // the current main-branch architecture. This function therefore handles
  // only the bot's movement, cooldowns, and direct combat effects.
  void nextAbilityOptions;

  const cooldowns = laneState.abilityCooldownRemainingSeconds.map((value) =>
    Math.max(0, value - deltaSeconds),
  ) as [number, number];

  const movement = decideBotMovement({ ...laneState, abilityCooldownRemainingSeconds: cooldowns });
  const actorPosition = clampPosition({
    x: laneState.actorPosition.x + movement.dx * BOT_MOVE_SPEED * deltaSeconds,
    y: laneState.actorPosition.y + movement.dy * BOT_MOVE_SPEED * deltaSeconds,
  });
  const stateAtNewPosition = { ...laneState, actorPosition, abilityCooldownRemainingSeconds: cooldowns };
  const ability = decideBotAbilityUse(stateAtNewPosition);
  const abilityIndex = ability ? stateAtNewPosition.equippedAbilities.indexOf(ability) : -1;
  const activeZombies = ability && ability.damage !== null
    ? stateAtNewPosition.activeZombies
        .map((zombie) => distanceBetween(actorPosition, zombie.position) <= ability.range
          ? { ...zombie, health: zombie.health - ability.damage! }
          : zombie)
        .filter((zombie) => zombie.health > 0)
    : stateAtNewPosition.activeZombies;

  if (abilityIndex >= 0) cooldowns[abilityIndex] = ability!.cooldownSeconds;
  return {
    ...stateAtNewPosition,
    activeZombies,
    abilityCooldownRemainingSeconds: cooldowns,
    survivalTimeSeconds: laneState.survivalTimeSeconds + deltaSeconds,
  };
}
