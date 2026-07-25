import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Ability, Enemy, LanePhase, LaneType, PlayerEntity, Position } from "./types";
import { ARENA_HEIGHT, ARENA_WIDTH, CANVAS_SCALE, PLAYER_RADIUS } from "./arena";

const ENEMY_RADIUS = 0.45;
const ENEMY_ATTACK_RANGE = 0.95;
const ENEMY_ATTACK_COOLDOWN_MS = 900;
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

export function createWaveEnemies(laneType: LaneType, waveNumber: number): Enemy[] {
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const count = Math.min(24, 3 + Math.floor(safeWave * 1.5));
  const hp = Math.min(180, 35 + safeWave * 8);
  const speed = Math.min(90, 35 + safeWave * 2);
  const damage = Math.min(18, 5 + Math.floor(safeWave * 0.8));

  return Array.from({ length: count }, (_, index) => {
    const position = edgePosition(index, safeWave);
    return {
      id: `${laneType}-zombie-${safeWave}-${index}`,
      x: position.x,
      y: position.y,
      radius: ENEMY_RADIUS,
      hp,
      maxHp: hp,
      speed,
      damage,
      attackRange: ENEMY_ATTACK_RANGE,
      attackCooldownMs: ENEMY_ATTACK_COOLDOWN_MS,
      lastAttackAt: 0,
      alive: true,
      kind: "zombie",
    };
  });
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

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= enemy.attackRange + PLAYER_RADIUS) {
      const isInvulnerable = !!player.invulnerableUntil && now < player.invulnerableUntil;
      if (!isInvulnerable && now - enemy.lastAttackAt >= enemy.attackCooldownMs) {
        player.takeDamage(Math.max(1, Math.round(enemy.damage * damageMultiplier)));
        enemy.lastAttackAt = now;
      }
      continue;
    }

    if (distance > 0) {
      const moveDistance = (enemy.speed / CANVAS_SCALE) * deltaSeconds;
      enemy.x += (dx / distance) * moveDistance;
      enemy.y += (dy / distance) * moveDistance;
    }
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
        ? living.filter((enemy) => Math.hypot(enemy.x - nearest.x, enemy.y - nearest.y) <= radius)
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
  waveNumber: number;
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
  waveNumber,
  player,
}: UseEnemiesOptions): UseEnemiesResult {
  const enemiesRef = useRef<Enemy[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const spawnedWaveRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "COMBAT" || !player.isAlive || spawnedWaveRef.current === waveNumber) return;
    const nextEnemies = createWaveEnemies(laneType, waveNumber);
    enemiesRef.current = nextEnemies;
    setEnemies(nextEnemies);
    spawnedWaveRef.current = waveNumber;
    console.log(`[useEnemies] spawned ${nextEnemies.length} zombies for ${laneType} wave ${waveNumber}`);
  }, [laneType, phase, player, waveNumber]);

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    function tick(now: number) {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (phaseRef.current === "COMBAT" && player.isAlive) {
        advanceEnemies(enemiesRef.current, player, deltaSeconds, now, laneType === "bot" ? 0.35 : 1);
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
