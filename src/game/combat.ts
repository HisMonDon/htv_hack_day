import type { Ability, Damageable } from "./types";

// Task 4 — minimal viable damage resolution, pure and isolated so it's the
// exact interface Sulaiman's zombies plug into later as Damageable targets.
// Deliberately simplified, decided with the team over guessing silently:
//
// - "self" targeting abilities never damage external targets — they're
//   buffs/shields on the caster (e.g. Scrap Barrier), not simulated here.
// - Non-area abilities (areaOfEffect == null) hit the single nearest live
//   target within `range` of sourcePosition ("first zombie it hits").
// - Area abilities (areaOfEffect != null) find the nearest live target
//   within `range` as the impact point, then also hit every other live
//   target within `areaOfEffect` of THAT point — explode-at-nearest-target,
//   not a blob radius around the caster. Confirmed with the user: this is
//   the model that matters once zombie clusters exist.
// - Instant hit-scan: no projectile travel time. knockback and statusEffect
//   are read off the ability but not simulated (no physics/duration-ticking
//   system yet) — flagged as a TODO below, not silently dropped.
//
// Returns the ids of targets actually hit, for logging/verification.
export function resolveAbilityHit(
  ability: Ability,
  sourcePosition: { x: number; y: number },
  targets: Damageable[],
): string[] {
  if (ability.targeting === "self") return [];

  const liveTargets = targets.filter((target) => target.hp > 0);
  if (liveTargets.length === 0) return [];

  const distanceTo = (target: Damageable) =>
    Math.hypot(target.x - sourcePosition.x, target.y - sourcePosition.y);

  const inRange = liveTargets.filter((target) => distanceTo(target) <= ability.range);
  if (inRange.length === 0) return [];

  const impactTarget = inRange.reduce((closest, target) =>
    distanceTo(target) < distanceTo(closest) ? target : closest,
  );

  const hitTargets =
    ability.areaOfEffect != null
      ? liveTargets.filter(
          (target) =>
            Math.hypot(target.x - impactTarget.x, target.y - impactTarget.y) <=
            ability.areaOfEffect!,
        )
      : [impactTarget];

  const damage = ability.damage ?? 0;
  if (damage > 0) {
    for (const target of hitTargets) target.takeDamage(damage);
  }

  // TODO: knockback and statusEffect are part of the generated ability data
  // but have no simulation yet (no physics system, no duration-ticking
  // status effects). Worth revisiting once zombies exist to fight against.

  return hitTargets.map((target) => target.id);
}
