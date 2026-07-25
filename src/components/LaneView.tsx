import { useRef, useState } from "react";
import type { Ability, LaneState, LaneType } from "../game/types";
import { useLaneTimer } from "../game/useLaneTimer";
import { applyPick } from "../game/applyPick";
import { decideBotAbilityPick } from "../game/botController";
import { usePlayerCombat } from "../game/usePlayerCombat";
import { CANVAS_SCALE } from "../game/arena";
import { HUD } from "./HUD";
import { PickOverlay } from "./PickOverlay";

export interface LaneViewProps {
  laneType: LaneType;
  initialEquippedAbilities: [Ability, Ability];
  survivalTimeSeconds: number;
}

// Renders and drives one lane (human or bot). Owns its own wave/pick timer
// instance (game/useLaneTimer.ts) and its own equipped-abilities state — the
// two LaneView instances never share a clock or touch each other's state
// (spec section 1 / Task 1.1).
export function LaneView({
  laneType,
  initialEquippedAbilities,
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

  // Task 4 — health/isAlive used to be static placeholder props; they're
  // now driven by the real player entity/combat system. isAliveRef is
  // populated below (after usePlayerCombat runs) but declared here so the
  // useLaneTimer closure below can close over it — the ref is read lazily
  // by useLaneTimer's interval, not at call time, so this ordering is safe.
  const isAliveRef = useRef(true);

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

  // Task 4 — player entity, WASD movement (human lane), J/K ability
  // activation (human lane), and combat resolution against a temporary
  // dummy target. Renders directly into canvasRef every frame. Only active
  // during timer.phase === "COMBAT" (enforced inside the hook).
  const { player, health, maxHealth, isAlive, cooldownsRemaining } = usePlayerCombat({
    laneType,
    phase: timer.phase,
    equippedAbilities,
    canvasRef,
  });
  isAliveRef.current = isAlive;

  // TODO: zombie rendering/spawning (Sulaiman's system, not built yet)
  // still needs to be drawn into this same canvasRef alongside the player
  // entity — out of this task's scope.

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
    // botController.ts (Darshan's, not mine to touch) assumes canvas pixel
    // space (BOT_MOVE_SPEED=90, clampPosition to 480x360) — CANVAS_SCALE
    // converts player.x/y (world units, see game/arena.ts) into that space
    // so decideBotMovement/decideBotAbilityUse get correctly-scaled input
    // once wired in.
    actorPosition: { x: player.x * CANVAS_SCALE, y: player.y * CANVAS_SCALE },
    activeZombies: [], // owned by the zombie system, not built yet
    abilityCooldownRemainingSeconds: cooldownsRemaining,
    player,
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
