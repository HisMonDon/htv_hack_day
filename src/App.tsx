import { useEffect, useRef, useState } from "react";
import { LobbyView } from "./components/LobbyView";
import { createMockEquippedAbilities, createMockAbilityPair } from "./data/mockAbilities";
import { createMockZombieStatBlock } from "./data/mockZombies";
import type { LaneState } from "./game/types";
import { generateTwoAbilityOptions } from "./ai/generateTwoAbilityOptions";
import { advanceBotLane } from "./game/botController";

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
    actorPosition: { x: 240, y: 180 },
    activeZombies: laneType === "bot"
      ? [
          { id: "bot-zombie-1", position: { x: 340, y: 180 }, health: 35 },
          { id: "bot-zombie-2", position: { x: 370, y: 210 }, health: 35 },
        ]
      : [],
    abilityCooldownRemainingSeconds: [0, 0],
  };
}

export function App() {
  const [humanLaneState] = useState(() => createMockLaneState("human"));
  const [botLaneState, setBotLaneState] = useState(() => createMockLaneState("bot"));
  const botOptions = useRef(createMockAbilityPair());
  const requestedBotOptionWave = useRef<number | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setBotLaneState((current) => advanceBotLane(current, 0.25, botOptions.current));
    }, 250);
    return () => window.clearInterval(tick);
  }, []);

  // Generate the bot's next pick during combat. The fallback pair keeps the
  // controller playable when no Gemini key is configured; successful bot
  // generation uses its lane-specific 1.4x stat ranges automatically.
  useEffect(() => {
    const nextWave = botLaneState.waveNumber + 1;
    if (requestedBotOptionWave.current === nextWave) return;
    requestedBotOptionWave.current = nextWave;

    generateTwoAbilityOptions(
      nextWave,
      "bot",
      botLaneState.equippedAbilities,
    )
      .then((options) => {
        botOptions.current = options;
      })
      .catch((err) => {
        console.warn("[bot] using fallback ability options:", err);
      });
  }, [botLaneState.equippedAbilities, botLaneState.waveNumber]);

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
