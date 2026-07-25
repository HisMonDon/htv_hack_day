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
}

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

// Per-lane runtime state driving the combat/pick loop described in section 1.
export interface LaneState {
  laneType: LaneType;
  waveNumber: number;
  health: number;
  maxHealth: number;
  equippedAbilities: [Ability, Ability];
  pendingAbilityOptions: [Ability, Ability] | null;
  currentZombieStats: ZombieStatBlock | null;
  phase: "combat" | "pick";
  phaseTimeRemainingSeconds: number;
  isAlive: boolean;
  survivalTimeSeconds: number;
}

// Config for a single wave of zombies, independent per lane.
export interface WaveConfig {
  waveNumber: number;
  laneType: LaneType;
  zombieCount: number;
  spawnIntervalSeconds: number;
  statBlock: ZombieStatBlock;
}
