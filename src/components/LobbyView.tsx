import { LaneView } from "./LaneView";
import { createMockEquippedAbilities } from "../data/mockAbilities";

// Top-level split-screen view: human lane on the left, bot lane on the
// right. Each LaneView instance owns its own timer/state internally (Task
// 1.1) — this component's only job is layout and seeding each lane's
// starting config. No shared arena, no cross-lane collision or RNG (spec
// section 1).
//
// health/maxHealth/isAlive are now driven internally by LaneView's player
// entity/combat system (Task 4) — no longer passed in as static placeholders.
export function LobbyView() {
  return (
    <div>
      <LaneView
        laneType="human"
        initialEquippedAbilities={createMockEquippedAbilities()}
        survivalTimeSeconds={0}
      />
      <LaneView
        laneType="bot"
        initialEquippedAbilities={createMockEquippedAbilities()}
        survivalTimeSeconds={0}
      />
    </div>
  );
}
