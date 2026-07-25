import type { ZombieStatBlock } from "../game/types";

export function createMockZombieStatBlock(
  overrides: Partial<ZombieStatBlock> = {},
): ZombieStatBlock {
  return {
    zombieType: "Shambler",
    attackType: "MELEE",
    damage: 8,
    attackCooldownSeconds: 1.2,
    range: 1,
    moveSpeed: 1.5,
    ...overrides,
  };
}
