import { LaneView } from "./LaneView";
import { createMockEquippedAbilities } from "../data/mockAbilities";

// Top-level split-screen view: human lane on the left, bot lane on the
// right. Each LaneView instance owns its own timer/state internally (Task
// 1.1) — this component's only job is layout and seeding each lane's
// starting config. No shared arena, no cross-lane collision or RNG (spec
// section 1).
//
// health/maxHealth/isAlive are static placeholders until the zombie/combat
// system (not built yet) actually drives them.
export function LobbyView() {
  return (
    <div>
      <LaneView
        laneType="human"
        initialEquippedAbilities={createMockEquippedAbilities()}
        health={80}
        maxHealth={100}
        isAlive={true}
        survivalTimeSeconds={0}
      />
      <LaneView
        laneType="bot"
        initialEquippedAbilities={createMockEquippedAbilities()}
        health={80}
        maxHealth={100}
        isAlive={true}
        survivalTimeSeconds={0}
      />
    </div>
  );
}
