import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  Ability,
  Enemy,
  LanePhase,
  LaneType,
  PlayerEntity,
  Position,
  ZombieArchetype,
  ZombieAttackShape,
  ZombieWavePlan,
} from "./types";
import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER_RADIUS, clampToArena } from "./arena";

const ENEMY_RADIUS = 0.48;
const MAX_ABILITY_DAMAGE = 180;
const MAX_ABILITY_RADIUS = 8;
const MAX_ABILITY_RANGE = Math.hypot(ARENA_WIDTH, ARENA_HEIGHT);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function edgePosition(index: number, waveNumber: number): Position {
  const side = index % 4;
  const offset = ((index * 0.61803398875 + waveNumber * 0.137) % 1 + 1) % 1;
  const x = ENEMY_RADIUS + offset * (ARENA_WIDTH - ENEMY_RADIUS * 2);
  const y = ENEMY_RADIUS + offset * (ARENA_HEIGHT - ENEMY_RADIUS * 2);

  if (side === 0) return { x, y: ENEMY_RADIUS };
  if (side === 1) return { x: ARENA_WIDTH - ENEMY_RADIUS, y };
  if (side === 2) return { x, y: ARENA_HEIGHT - ENEMY_RADIUS };
  return { x: ENEMY_RADIUS, y };
}

function distributeSpawnCounts(total: number, archetypes: ZombieArchetype[]): number[] {
  const counts = archetypes.map(() => 1);
  let remaining = Math.max(0, total - counts.length);
  const totalWeight = archetypes.reduce((sum, archetype) => sum + archetype.spawnWeight, 0) || 1;
  const fractional: { index: number; remainder: number }[] = [];

  for (let index = 0; index < archetypes.length; index += 1) {
    const exact = (remaining * archetypes[index].spawnWeight) / totalWeight;
    const whole = Math.floor(exact);
    counts[index] += whole;
    fractional.push({ index, remainder: exact - whole });
  }

  remaining = total - counts.reduce((sum, count) => sum + count, 0);
  fractional.sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < remaining; index += 1) {
    counts[fractional[index % fractional.length].index] += 1;
  }

  return counts;
}

export function createWaveEnemies(
  laneType: LaneType,
  wavePlan: ZombieWavePlan,
  now = performance.now(),
): Enemy[] {
  const waveNumber = Math.max(1, Math.floor(wavePlan.waveNumber));
  const totalCount = Math.min(24, 3 + Math.floor(waveNumber * 1.5));
  const archetypes = wavePlan.archetypes.slice(0, Math.min(totalCount, 3));
  if (archetypes.length === 0) return [];

  const counts = distributeSpawnCounts(totalCount, archetypes);
  const spawnOrder: ZombieArchetype[] = [];
  while (spawnOrder.length < totalCount) {
    for (let index = 0; index < archetypes.length; index += 1) {
      if (counts[index] <= 0) continue;
      spawnOrder.push(archetypes[index]);
      counts[index] -= 1;
    }
  }

  return spawnOrder.map((archetype, index) => {
    const position = edgePosition(index, waveNumber);
    return {
      id: `${laneType}-${archetype.id}-${index}`,
      archetypeId: archetype.id,
      typeName: archetype.name,
      x: position.x,
      y: position.y,
      radius: ENEMY_RADIUS,
      hp: archetype.maxHealth,
      maxHp: archetype.maxHealth,
      speed: archetype.moveSpeed,
      ability: archetype.ability,
      sprite: archetype.sprite,
      abilityReadyAt: now + 600 + (index % 5) * 180,
      alive: true,
      kind: "zombie",
    };
  });
}

function desiredDistanceFor(shape: ZombieAttackShape, range: number): number {
  if (shape === "CONTACT") return 0.7;
  if (shape === "AURA") return Math.max(0.8, range * 0.55);
  if (shape === "CONE") return Math.max(1.1, range * 0.7);
  return Math.max(1.6, range * 0.8);
}

function moveTowardPlayer(
  enemy: Enemy,
  player: PlayerEntity,
  distance: number,
  deltaSeconds: number,
): void {
  if (distance <= 0) return;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const desiredDistance = desiredDistanceFor(enemy.ability.attackShape, enemy.ability.range);
  if (distance <= desiredDistance) return;

  const moveDistance =
    enemy.speed * enemy.ability.movementMultiplier * deltaSeconds;
  const next = clampToArena(
    enemy.x + (dx / distance) * moveDistance,
    enemy.y + (dy / distance) * moveDistance,
    enemy.radius,
  );
  enemy.x = next.x;
  enemy.y = next.y;
}

function useGeneratedAbility(
  enemy: Enemy,
  player: PlayerEntity,
  now: number,
  damageMultiplier: number,
): boolean {
  if (now < enemy.abilityReadyAt) return false;

  const ability = enemy.ability;
  const isInvulnerable = !!player.invulnerableUntil && now < player.invulnerableUntil;
  let dx = player.x - enemy.x;
  let dy = player.y - enemy.y;
  let distance = Math.hypot(dx, dy);
  const movementTriggerRange = Math.max(ability.range + ability.movementDistance, 5);
  const origin = { x: enemy.x, y: enemy.y };
  let moved = false;

  if (
    ability.movementAction !== "NONE" &&
    distance > ability.range &&
    distance <= movementTriggerRange &&
    distance > 0
  ) {
    const desiredDistance = desiredDistanceFor(ability.attackShape, ability.range);
    const availableDistance = Math.max(0, distance - desiredDistance);
    const movementScale = ability.movementAction === "DASH" ? 0.7 : 1;
    const travel = Math.min(ability.movementDistance * movementScale, availableDistance);
    const next = clampToArena(
      enemy.x + (dx / distance) * travel,
      enemy.y + (dy / distance) * travel,
      enemy.radius,
    );
    enemy.x = next.x;
    enemy.y = next.y;
    moved = travel > 0;
    dx = player.x - enemy.x;
    dy = player.y - enemy.y;
    distance = Math.hypot(dx, dy);
  }

  const canHit = distance <= ability.range + PLAYER_RADIUS;
  if (!canHit && !moved) return false;

  if (canHit && !isInvulnerable) {
    player.takeDamage(Math.max(1, Math.round(ability.damage * damageMultiplier)));
  }

  const projectileTravelSeconds =
    ability.attackShape === "BOLT" ? distance / Math.max(1, ability.projectileSpeed) : 0;
  enemy.abilityEffect = {
    origin,
    target: { x: player.x, y: player.y },
    startedAt: now,
    endsAt:
      now +
      Math.max(120, Math.max(ability.durationSeconds, projectileTravelSeconds) * 1000),
  };
  enemy.abilityReadyAt = now + ability.cooldownSeconds * 1000;
  return true;
}

export function advanceEnemies(
  enemies: Enemy[],
  player: PlayerEntity,
  deltaSeconds: number,
  now: number,
  damageMultiplier = 1,
): void {
  if (!player.isAlive || deltaSeconds <= 0) return;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (enemy.stunnedUntil && now < enemy.stunnedUntil) continue;

    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    const usedAbility = useGeneratedAbility(enemy, player, now, damageMultiplier);
    if (!usedAbility) moveTowardPlayer(enemy, player, distance, deltaSeconds);
  }
}

export interface AbilityDamageResult {
  enemies: Enemy[];
  hitIds: string[];
}

export function applyAbilityDamage(
  enemies: Enemy[],
  ability: Ability,
  source: Position,
  now: number,
): AbilityDamageResult {
  const living = enemies.filter((enemy) => enemy.alive);
  if (living.length === 0) return { enemies: [], hitIds: [] };

  const rawDamage = ability.damage ?? (ability.category === "DEFENSE" ? 0 : 8);
  const damage = clamp(rawDamage, 0, MAX_ABILITY_DAMAGE);
  if (damage <= 0) return { enemies: living, hitIds: [] };

  const range = clamp(ability.range, 0.5, MAX_ABILITY_RANGE);
  const requestedRadius = ability.areaOfEffect ?? 0;
  const fallbackRadius =
    ability.targeting === "area" || ability.targeting === "self" || ability.category === "UTILITY"
      ? 1.5
      : 0;
  const radius = clamp(Math.max(requestedRadius, fallbackRadius), 0, MAX_ABILITY_RADIUS);
  const distanceFromSource = (enemy: Enemy) => Math.hypot(enemy.x - source.x, enemy.y - source.y);

  let targets: Enemy[] = [];
  if (ability.targeting === "self") {
    targets = living.filter((enemy) => distanceFromSource(enemy) <= Math.max(radius, 1.5));
  } else {
    const inRange = living.filter((enemy) => distanceFromSource(enemy) <= range);
    if (inRange.length === 0) return { enemies: living, hitIds: [] };
    const nearest = inRange.reduce((closest, enemy) =>
      distanceFromSource(enemy) < distanceFromSource(closest) ? enemy : closest,
    );

    targets =
      radius > 0
        ? living.filter(
            (enemy) => Math.hypot(enemy.x - nearest.x, enemy.y - nearest.y) <= radius,
          )
        : [nearest];
  }

  for (const enemy of targets) {
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.flashUntil = now + 120;
    enemy.alive = enemy.hp > 0;
  }

  return {
    enemies: enemies.filter((enemy) => enemy.alive),
    hitIds: targets.map((enemy) => enemy.id),
  };
}

export interface UseEnemiesOptions {
  laneType: LaneType;
  phase: LanePhase;
  wavePlan: ZombieWavePlan;
  player: PlayerEntity;
}

export interface UseEnemiesResult {
  enemies: Enemy[];
  enemiesRef: MutableRefObject<Enemy[]>;
  damageEnemies: (ability: Ability, source: Position) => string[];
}

export function useEnemies({
  laneType,
  phase,
  wavePlan,
  player,
}: UseEnemiesOptions): UseEnemiesResult {
  const enemiesRef = useRef<Enemy[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const spawnedPlanRef = useRef<{ waveNumber: number; source: ZombieWavePlan["source"] } | null>(
    null,
  );

  useEffect(() => {
    if (phase !== "COMBAT" || !player.isAlive) return;

    const previous = spawnedPlanRef.current;
    const isNewWave = previous?.waveNumber !== wavePlan.waveNumber;
    const isLiveUpgrade =
      previous?.waveNumber === wavePlan.waveNumber &&
      previous.source === "fallback" &&
      wavePlan.source !== "fallback";
    if (!isNewWave && !isLiveUpgrade) return;

    const nextEnemies = createWaveEnemies(laneType, wavePlan);
    enemiesRef.current = nextEnemies;
    setEnemies(nextEnemies);
    spawnedPlanRef.current = { waveNumber: wavePlan.waveNumber, source: wavePlan.source };
    console.log(
      `[useEnemies] spawned ${nextEnemies.length} zombies across ${wavePlan.archetypes.length} archetype(s) for ${laneType} wave ${wavePlan.waveNumber} (${wavePlan.source})`,
    );
  }, [laneType, phase, player, wavePlan]);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    function tick(now: number) {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (phaseRef.current === "COMBAT" && player.isAlive) {
        advanceEnemies(
          enemiesRef.current,
          player,
          deltaSeconds,
          now,
          laneType === "bot" ? 0.35 : 1,
        );
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [laneType, player]);

  const damageEnemies = useCallback((ability: Ability, source: Position): string[] => {
    const result = applyAbilityDamage(enemiesRef.current, ability, source, performance.now());
    enemiesRef.current = result.enemies;
    setEnemies([...enemiesRef.current]);
    return result.hitIds;
  }, []);

  return { enemies, enemiesRef, damageEnemies };
}
