import type { PlayerEntity } from "./types";

// Task 4 — factory for a lane's controllable entity. One per lane (human,
// bot), fully independent — see game/usePlayerCombat.ts, which owns the
// only mutable reference to each instance.
export function createPlayerEntity(id: string, x: number, y: number, maxHp = 100): PlayerEntity {
  return {
    id,
    x,
    y,
    hp: maxHp,
    maxHp,
    isAlive: true,
    facingDirection: { x: 0, y: 1 },
    takeDamage(amount: number) {
      if (!this.isAlive || amount <= 0) return;
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp === 0) this.isAlive = false;
    },
  };
}
