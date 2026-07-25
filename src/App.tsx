import { useEffect, useRef } from "react";
import { LobbyView } from "./components/LobbyView";
import { createMockEquippedAbilities, createMockAbilityPair } from "./data/mockAbilities";
import { createMockZombieStatBlock } from "./data/mockZombies";
import type { LaneState } from "./game/types";
import { generateTwoAbilityOptions } from "./ai/generateTwoAbilityOptions";

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

  // TEMP sanity check — raw one-shot call to confirm the live Gemini wiring
  // works before anything is built on top of it (not wired into game state).
  // Remove once LaneView is swapped over to the real call.
  // hasRun guards against React 18 StrictMode's dev-only double-invoke of
  // effects, which would otherwise silently double every Gemini call here
  // and burn through the free-tier quota twice as fast.
  const hasRun = useRef(false);
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    generateTwoAbilityOptions(1, "human", [])
      .then((options) => {
        console.log("[sanity check] generateTwoAbilityOptions result:", JSON.stringify(options, null, 2));
      })
      .catch((err) => {
        console.error("[sanity check] generateTwoAbilityOptions failed:", err);
      });
  }, []);

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
