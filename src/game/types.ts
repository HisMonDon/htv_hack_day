// Core type definitions shared across ai/, game/, components/, and data/.
// Mirrors the JSON schemas in the design spec (sections 3.1, 4.1, 6.1).

export type AbilityCategory = "OFFENSE" | "MOBILITY" | "DEFENSE" | "UTILITY";

export type LaneType = "human" | "bot";

export interface StatusEffect {
  type: string | null;
  magnitude: number | null;
  durationSeconds: number | null;
}

// Spec 3.1 — player/bot ability schema.
export interface Ability {
  name: string;
  category: AbilityCategory;
  description: string;
  damage: number | null;
  cooldownSeconds: number;
  range: number;
  areaOfEffect: number | null;
  durationSeconds: number | null;
  projectileCount: number | null;
  projectileSpeed: number | null;
  knockback: number | null;
  statusEffect: StatusEffect;
  movementBehavior: string | null;
  targeting: string;
  // Spec 6.1 — the ability's icon, generated alongside its mechanics and
  // validated by game/spriteValidation.ts. Never null: generation failure
  // substitutes a library sprite (data/spriteLibrary.ts) rather than leaving
  // callers to handle an absent sprite.
  sprite: SpriteData;
}

// Task 4 — minimal shared interface for anything that can take damage from
// an ability hit (resolveAbilityHit in game/combat.ts). Zombie entities
// (Sulaiman's system, not built yet) should implement this directly so they
// can be dropped into resolveAbilityHit's targets list with no changes to
// combat.ts.
export interface Damageable {
  id: string;
  x: number;
  y: number;
  hp: number;
  takeDamage(amount: number): void;
}

// Task 4 — a single lane's controllable entity (human player or bot).
// Position is free 2D movement within the arena bounds (game/arena.ts), not
// grid-locked. Implements Damageable so damage-dealing logic is symmetric —
// once zombies exist, their attacks call player.takeDamage the same way
// resolveAbilityHit calls it on a zombie.
export interface PlayerEntity extends Damageable {
  maxHp: number;
  isAlive: boolean;
  facingDirection: { x: number; y: number }; // normalized
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  lastAttackAt: number;
  alive: boolean;
  kind: "zombie";
  flashUntil?: number;
  special?: ZombieSpecial;
  lastSpecialAt?: number;
}

export interface ZombieSpecial { name: string; kind: "PULSE" | "SPRINT" | "FRENZY"; cooldownSeconds: number; damage: number; range: number; }

export type ZombieAttackType = "MELEE" | "RANGED" | "AURA";

// Spec 4.1 — zombie stat schema, generated once per wave per lane.
export interface ZombieStatBlock {
  zombieType: string;
  attackType: ZombieAttackType;
  damage: number;
  attackCooldownSeconds: number;
  range: number;
  moveSpeed: number;
}

export interface Position {
  x: number;
  y: number;
}

// A spawned zombie instance. The stat block is shared by the wave; these
// fields are the per-instance values the combat loop and bot controller need.
export interface ActiveZombie {
  id: string;
  position: Position;
  health: number;
}

// Spec 6.1 — pixel-art sprite schema.
export interface SpriteData {
  width: number;
  height: number;
  palette: Record<string, string>;
  pixels: string[][];
}

// Min/max ranges returned by getStatRangesForWave for a single numeric field.
export interface StatRange {
  min: number;
  max: number;
}

// The set of stat ranges an ability's numeric fields get clamped into for a
// given wave/lane. Fields are optional because not every ability rolls every stat.
export interface AbilityStatRanges {
  damage?: StatRange;
  cooldownSeconds: StatRange;
  range: StatRange;
  areaOfEffect?: StatRange;
  durationSeconds?: StatRange;
  projectileCount?: StatRange;
  projectileSpeed?: StatRange;
  knockback?: StatRange;
}

export type LanePhase = "COMBAT" | "PAUSED_GENERATING" | "PICKING" | "TRANSITIONING";

// The wave/pick timer's own state (Task 1.1), independent per lane
// instance. Kept as its own type — not just fields on LaneState — so
// modules that only care about the timer (e.g. a zombie spawner keying off
// phase/waveNumber) can depend on this exact shape without pulling in the
// rest of LaneState. Task 5 — waveNumber/combatTimeRemaining/pickTimeRemaining
// are now shared across both lanes (game/useMatchClock.ts); pendingOptions/
// isGenerationReady stay per-lane (game/useLaneGeneration.ts).
export interface LaneTimerState {
  phase: LanePhase;
  waveNumber: number;
  combatTimeRemaining: number; // seconds, counts down from 15
  pickTimeRemaining: number; // seconds, counts down from 5, only relevant in PICKING
  pendingOptions: [Ability, Ability] | null; // pre-generated options for the NEXT pick
  isGenerationReady: boolean; // true once pendingOptions is populated for the upcoming pick
}

// Full per-lane runtime snapshot: the timer state plus everything else a
// lane needs to render (health, loadout, zombie stats). Combat/HP fields are
// owned by whichever system tracks the actual fight (zombie system, not yet
// built); LaneTimerState fields are split between game/useMatchClock.ts
// (shared) and game/useLaneGeneration.ts (per-lane).
export interface LaneState extends LaneTimerState {
  laneType: LaneType;
  health: number;
  maxHealth: number;
  equippedAbilities: [Ability, Ability];
  currentZombieStats: ZombieStatBlock | null;
  isAlive: boolean;
  survivalTimeSeconds: number;
  actorPosition: Position;
  activeZombies: ActiveZombie[];
  // Kept in the same order as equippedAbilities. A value of zero means ready.
  abilityCooldownRemainingSeconds: [number, number];
  // Task 4 — the lane's controllable entity (position, hp, facing). Added
  // as a field on LaneState (rather than a separate type/prop) specifically
  // so botController.ts's LaneState-based functions (decideBotMovement,
  // decideBotAbilityUse) can read player position/hp once implemented,
  // without needing any signature change to that file.
  player: PlayerEntity;
}

// Config for a single wave of zombies, independent per lane.
export interface WaveConfig {
  waveNumber: number;
  laneType: LaneType;
  zombieCount: number;
  spawnIntervalSeconds: number;
  statBlock: ZombieStatBlock;
}
