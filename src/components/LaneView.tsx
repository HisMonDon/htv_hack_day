import { useRef, useState } from "react";
import type { Ability, LaneState, LaneType } from "../game/types";
import { useLaneTimer } from "../game/useLaneTimer";
import { applyPick } from "../game/applyPick";
import { decideBotAbilityPick } from "../game/botController";
import { HUD } from "./HUD";
import { PickOverlay } from "./PickOverlay";

export interface LaneViewProps {
  laneType: LaneType;
  initialEquippedAbilities: [Ability, Ability];
  health: number;
  maxHealth: number;
  isAlive: boolean;
  survivalTimeSeconds: number;
}

// Renders and drives one lane (human or bot). Owns its own wave/pick timer
// instance (game/useLaneTimer.ts) and its own equipped-abilities state — the
// two LaneView instances never share a clock or touch each other's state
// (spec section 1 / Task 1.1).
export function LaneView({
  laneType,
  initialEquippedAbilities,
  health,
  maxHealth,
  isAlive,
  survivalTimeSeconds,
}: LaneViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [equippedAbilities, setEquippedAbilities] = useState<[Ability, Ability]>(
    initialEquippedAbilities,
  );
  // Mutated synchronously alongside setEquippedAbilities (not via a
  // useEffect mirror) so a generation kicked off immediately after a pick
  // reads the just-picked loadout, never a stale one from before the pick
  // (Task 2's "currentLoadout must never be stale" requirement).
  const equippedRef = useRef(equippedAbilities);

  const isAliveRef = useRef(isAlive);
  isAliveRef.current = isAlive;

  const timer = useLaneTimer({
    laneType,
    getCurrentLoadout: () => equippedRef.current,
    onApplyPick: (picked) => {
      const next = applyPick(equippedRef.current, picked);
      equippedRef.current = next;
      setEquippedAbilities(next);
    },
    isAlive: () => isAliveRef.current,
    // Bot lane's pick is decided by botController, never by human input.
    autoPickForBot: laneType === "bot" ? decideBotAbilityPick : undefined,
  });

  // TODO: drive actual combat rendering (zombies, abilities, player/bot)
  // into canvasRef via renderPixelArt once the zombie/sprite systems land —
  // out of this task's scope. WASD movement and J/K ability activation are
  // likewise out of scope here; only pick-phase 1/2 input exists so far,
  // inside PickOverlay.

  const { pick, ...timerState } = timer;
  const laneState: LaneState = {
    laneType,
    ...timerState,
    health,
    maxHealth,
    equippedAbilities,
    currentZombieStats: null, // owned by the zombie system, not built yet
    isAlive,
    survivalTimeSeconds,
  };

  const showInteractivePickOverlay =
    laneType === "human" && timer.phase === "PICKING" && timer.pendingOptions !== null;

  return (
    <div>
      <canvas ref={canvasRef} width={480} height={360} />
      <HUD laneState={laneState} />
      {!isAlive && <p>Defeated at wave {timer.waveNumber}</p>}
      {isAlive && timer.phase === "PAUSED_GENERATING" && <p>Waiting on ability generation…</p>}
      {isAlive && showInteractivePickOverlay && timer.pendingOptions && (
        <PickOverlay
          options={timer.pendingOptions}
          timeRemainingSeconds={timer.pickTimeRemaining}
          onPick={pick}
        />
      )}
    </div>
  );
}
