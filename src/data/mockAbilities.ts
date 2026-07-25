import type { Ability, AbilityCategory } from "../game/types";

// Schema-valid mock abilities so UI components can be built/tested before
// real Gemini calls are wired in. Not tied to any particular wave curve.

const MOCK_ABILITIES_BY_CATEGORY: Record<AbilityCategory, Ability> = {
  OFFENSE: {
    name: "Rusty Cleaver Toss",
    category: "OFFENSE",
    description: "Hurls a spinning cleaver that deals damage to the first zombie it hits.",
    damage: 18,
    cooldownSeconds: 3.5,
    range: 6,
    areaOfEffect: null,
    durationSeconds: null,
    projectileCount: 1,
    projectileSpeed: 12,
    knockback: 2,
    statusEffect: { type: null, magnitude: null, durationSeconds: null },
    movementBehavior: null,
    targeting: "nearest",
  },
  MOBILITY: {
    name: "Panic Dash",
    category: "MOBILITY",
    description: "Dashes a short distance in the direction of movement, passing through zombies.",
    damage: null,
    cooldownSeconds: 6,
    range: 4,
    areaOfEffect: null,
    durationSeconds: 0.3,
    projectileCount: null,
    projectileSpeed: null,
    knockback: null,
    statusEffect: { type: null, magnitude: null, durationSeconds: null },
    movementBehavior: "dash",
    targeting: "self",
  },
  DEFENSE: {
    name: "Scrap Barrier",
    category: "DEFENSE",
    description: "Raises a temporary barrier that blocks incoming zombie attacks.",
    damage: null,
    cooldownSeconds: 10,
    range: 0,
    areaOfEffect: 2,
    durationSeconds: 4,
    projectileCount: null,
    projectileSpeed: null,
    knockback: null,
    statusEffect: { type: null, magnitude: null, durationSeconds: null },
    movementBehavior: null,
    targeting: "self",
  },
  UTILITY: {
    name: "Flare Marker",
    category: "UTILITY",
    description: "Marks nearby zombies, slowing their movement speed briefly.",
    damage: null,
    cooldownSeconds: 8,
    range: 8,
    areaOfEffect: 3,
    durationSeconds: 3,
    projectileCount: null,
    projectileSpeed: null,
    knockback: null,
    statusEffect: { type: "slow", magnitude: 0.3, durationSeconds: 3 },
    movementBehavior: null,
    targeting: "area",
  },
};

export function createMockAbility(overrides: Partial<Ability> = {}): Ability {
  const base = MOCK_ABILITIES_BY_CATEGORY[overrides.category ?? "OFFENSE"];
  return { ...base, ...overrides };
}

// Two abilities from different categories, matching the pick-phase contract
// in spec 3.2 (a single pick always offers two distinct categories).
export function createMockAbilityPair(): [Ability, Ability] {
  return [
    createMockAbility({ category: "OFFENSE" }),
    createMockAbility({ category: "DEFENSE" }),
  ];
}

export function createMockEquippedAbilities(): [Ability, Ability] {
  return [
    createMockAbility({ category: "MOBILITY" }),
    createMockAbility({ category: "UTILITY" }),
  ];
}
