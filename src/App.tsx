import { useEffect, useRef, useState } from "react";
import { LobbyView } from "./components/LobbyView";
import { createMockEquippedAbilities, createMockAbilityPair } from "./data/mockAbilities";
import { createMockZombieStatBlock } from "./data/mockZombies";
import { CAPTURED_WAVE_1_HUMAN_OPTIONS } from "./data/capturedAbilityResponses";
import type { Ability, LaneState } from "./game/types";
import { generateTwoAbilityOptions } from "./ai/generateTwoAbilityOptions";

// Placeholder lane state, standing in for the real per-lane runtime state
// until the combat/pick loop (spec section 1) is implemented. Lets the
// component tree be viewed/tested independently. Bot lane still runs
// entirely on mock data — it gets swapped to generateTwoAbilityOptions
// separately, after the human lane is confirmed working end-to-end.
function createMockLaneState(laneType: LaneState["laneType"]): LaneState {
  return {
    laneType,
    waveNumber: 1,
    health: 80,
    maxHealth: 100,
    equippedAbilities: createMockEquippedAbilities(),
    pendingAbilityOptions: laneType === "human" ? null : createMockAbilityPair(),
    currentZombieStats: createMockZombieStatBlock(),
    phase: laneType === "human" ? "pick" : "combat",
    phaseTimeRemainingSeconds: laneType === "human" ? 5 : 15,
    isAlive: true,
    survivalTimeSeconds: 42,
  };
}

export function App() {
  const [humanLaneState, setHumanLaneState] = useState<LaneState>(() => createMockLaneState("human"));
  const [botLaneState] = useState<LaneState>(() => createMockLaneState("bot"));

  // Human lane's pick options now come from the real Gemini pipeline instead
  // of mockAbilities.ts. hasRun guards against React 18 StrictMode's
  // dev-only double-invoke of effects, which would otherwise double the
  // call. generateTwoAbilityOptions already caches per (laneType, wave) in
  // dev, so reloads after the first successful call are free.
  const hasRun = useRef(false);
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    generateTwoAbilityOptions(
      humanLaneState.waveNumber,
      "human",
      humanLaneState.equippedAbilities,
    )
      .then((options) => {
        setHumanLaneState((prev) => ({ ...prev, pendingAbilityOptions: options }));
      })
      .catch((err) => {
        // Demo-safety fallback — known-good captured response instead of a
        // blank/broken pick screen if the API is down or quota-limited.
        console.error("generateTwoAbilityOptions failed, using captured fallback:", err);
        setHumanLaneState((prev) => ({
          ...prev,
          pendingAbilityOptions: CAPTURED_WAVE_1_HUMAN_OPTIONS,
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleHumanPick(index: 0 | 1) {
    setHumanLaneState((prev) => {
      if (!prev.pendingAbilityOptions) return prev;
      const picked: Ability = prev.pendingAbilityOptions[index];
      // Spec section 1, step 5 — strict FIFO: picked ability always replaces
      // equipped slot 0.
      const [, keep] = prev.equippedAbilities;
      return {
        ...prev,
        equippedAbilities: [keep, picked],
        pendingAbilityOptions: null,
        phase: "combat",
      };
    });
  }

  return (
    <LobbyView
      humanLaneState={humanLaneState}
      botLaneState={botLaneState}
      onHumanPick={handleHumanPick}
    />
  );
}
