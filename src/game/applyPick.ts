import type { Ability } from "./types";

// Spec Task 1.3 — strict FIFO loadout replacement, no exceptions and no
// player choice of which slot to replace. currentLoadout[0] is the OLDEST
// equipped ability, currentLoadout[1] is the newest; the oldest is always
// the one replaced. Pure and standalone so it's trivially unit-testable in
// isolation from the timer state machine.
export function applyPick(
  currentLoadout: [Ability, Ability],
  picked: Ability,
): [Ability, Ability] {
  return [currentLoadout[1], picked];
}
