import type { Damageable } from "./types";

// Task 4 — TEMPORARY test scaffolding, not part of the real game. A static
// Damageable target so ability activation / resolveAbilityHit can be
// verified before zombies (Sulaiman's system) exist. Delete this file once
// real zombie entities are wired into usePlayerCombat's targets list.
export interface DummyTarget extends Damageable {
  maxHp: number;
}

export function createDummyTarget(id: string, x: number, y: number, maxHp = 50): DummyTarget {
  return {
    id,
    x,
    y,
    hp: maxHp,
    maxHp,
    takeDamage(amount: number) {
      if (amount <= 0) return;
      this.hp = Math.max(0, this.hp - amount);
    },
  };
}
