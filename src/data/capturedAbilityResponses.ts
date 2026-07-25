import type { Ability } from "../game/types";

// Real Gemini responses captured during dev testing (wave 1, human lane),
// already validated + clamped. Use this as a demo fallback if the API is
// flaking or quota-limited during the actual presentation — swap
// generateTwoAbilityOptions() for a lookup here without touching the rest
// of the game.
export const CAPTURED_WAVE_1_HUMAN_OPTIONS: [Ability, Ability] = [
  {
    name: "Tactical Roll",
    category: "MOBILITY",
    description:
      "Quickly roll in your movement direction to dodge incoming attacks and gain a brief speed boost.",
    damage: null,
    cooldownSeconds: 4.5,
    range: 5,
    areaOfEffect: null,
    durationSeconds: null,
    projectileCount: null,
    projectileSpeed: null,
    knockback: null,
    statusEffect: { type: "HASTE", magnitude: 0.25, durationSeconds: 1.5 },
    movementBehavior: "DASH",
    targeting: "DIRECTIONAL",
  },
  {
    name: "Riot Push",
    category: "DEFENSE",
    description: "Deploy a heavy police shield to knock back nearby enemies and briefly slow them.",
    damage: 10,
    cooldownSeconds: 6.95,
    range: 3.1,
    areaOfEffect: 2.15,
    durationSeconds: null,
    projectileCount: null,
    projectileSpeed: null,
    knockback: 1.1,
    statusEffect: { type: "SLOW", magnitude: 0.4, durationSeconds: 2.5 },
    movementBehavior: null,
    targeting: "AREA_SELF",
  },
];
