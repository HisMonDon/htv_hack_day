import { LobbyView } from "./components/LobbyView";
import { createMockEquippedAbilities, createMockAbilityPair } from "./data/mockAbilities";
import { createMockZombieStatBlock } from "./data/mockZombies";
import type { LaneState } from "./game/types";

// Placeholder lane states built from mock data, standing in for the real
// per-lane runtime state until the combat/pick loop (spec section 1) is
// implemented. Lets the component tree be viewed/tested independently.
function createMockLaneState(laneType: LaneState["laneType"]): LaneState {
  return {
    laneType,
    waveNumber: 1,
    health: 80,
    maxHealth: 100,
    equippedAbilities: createMockEquippedAbilities(),
    pendingAbilityOptions: laneType === "human" ? createMockAbilityPair() : null,
    currentZombieStats: createMockZombieStatBlock(),
    phase: laneType === "human" ? "pick" : "combat",
    phaseTimeRemainingSeconds: laneType === "human" ? 5 : 15,
    isAlive: true,
    survivalTimeSeconds: 42,
  };
}

export function App() {
  const humanLaneState = createMockLaneState("human");
  const botLaneState = createMockLaneState("bot");

  return (
    <LobbyView
      humanLaneState={humanLaneState}
      botLaneState={botLaneState}
      onHumanPick={(index) => {
        // TODO: wire to the real pick-phase reducer (spec section 1, steps 4-5).
        console.log("picked option", index);
      }}
    />
  );
}
