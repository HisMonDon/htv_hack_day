import { useEffect, useRef, useState } from "react";
import type { Ability, LanePhase, LaneState, LaneType } from "../game/types";
import { useLaneGeneration } from "../game/useLaneGeneration";
import type { LaneAdapter } from "../game/useMatchClock";
import { applyPick } from "../game/applyPick";
import { decideBotAbilityPick } from "../game/botController";
import { usePlayerCombat } from "../game/usePlayerCombat";
import { CANVAS_SCALE } from "../game/arena";
import { HUD } from "./HUD";
import { PickOverlay } from "./PickOverlay";
import "./LaneView.css";

export interface LaneViewProps {
  laneType: LaneType;
  initialEquippedAbilities: [Ability, Ability];
  survivalTimeSeconds: number;
  // Shared match clock (game/useMatchClock.ts), owned by LobbyView and fed
  // into both LaneView instances so they always show the same wave/phase
  // (Task 5). Ability generation and pick resolution stay per-lane below.
  matchPhase: LanePhase;
  matchWaveNumber: number;
  combatTimeRemaining: number;
  pickTimeRemaining: number;
  registerLane: (laneType: LaneType, adapter: LaneAdapter) => void;
  notifyGenerationReady: () => void;
}

// Renders and drives one lane (human or bot). Reads the shared match clock
// for phase/wave/timers and owns its own ability-generation state and
// equipped-abilities state — the two LaneView instances never touch each
// other's generation or loadout (spec section 1 / Task 5).
export function LaneView({
  laneType,
  initialEquippedAbilities,
  survivalTimeSeconds,
  matchPhase,
  matchWaveNumber,
  combatTimeRemaining,
  pickTimeRemaining,
  registerLane,
  notifyGenerationReady,
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
  // useLaneGeneration closure below can close over it — the ref is read
  // lazily, not at call time, so this ordering is safe.
  const isAliveRef = useRef(true);

  const generation = useLaneGeneration({
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
    notifyGenerationReady,
  });

  // Register this lane's generation adapter with the shared match clock once
  // on mount (and again if the adapter identity changes) — Map.set on the
  // same laneType key is idempotent, and useMatchClock guards the
  // one-time "kick off wave 1's generation" call internally.
  useEffect(() => {
    registerLane(laneType, generation.adapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneType, registerLane, generation.adapter]);

  // Bot lane's auto-pick — the old per-lane timer fired this by watching its
  // own local phase state; now phase is a prop driven by the shared clock,
  // so this fires once per PICKING-phase entry instead.
  useEffect(() => {
    if (laneType !== "bot" || matchPhase !== "PICKING") return;
    const safeLatestDelayMs = Math.max(0, (pickTimeRemaining - 0.2) * 1000);
    const minimumDelayMs = Math.min(2000, safeLatestDelayMs);
    const maximumDelayMs = Math.min(5000, safeLatestDelayMs);
    const delayMs = minimumDelayMs + Math.random() * (maximumDelayMs - minimumDelayMs);
    const timeoutId = window.setTimeout(() => generation.maybeAutoPickForBot(), delayMs);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneType, matchPhase]);

  // Per-lane player movement, J/K abilities, zombie combat, and canvas
  // rendering. The shared match clock remains read-only here.
  const { player, health, maxHealth, isAlive, cooldownsRemaining, enemies } = usePlayerCombat({
    laneType,
    phase: matchPhase,
    waveNumber: matchWaveNumber,
    equippedAbilities,
    canvasRef,
  });
  isAliveRef.current = isAlive;

  // Section 4 — once this lane's player dies it freezes permanently: capture
  // the shared clock's values at the instant of death and keep showing those
  // rather than the still-advancing shared clock (which keeps moving for the
  // surviving lane).
  const frozenAtDeathRef = useRef<{
    phase: LanePhase;
    waveNumber: number;
    combatTimeRemaining: number;
    pickTimeRemaining: number;
  } | null>(null);
  useEffect(() => {
    if (!isAlive && frozenAtDeathRef.current === null) {
      frozenAtDeathRef.current = { phase: matchPhase, waveNumber: matchWaveNumber, combatTimeRemaining, pickTimeRemaining };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAlive]);

  const display = isAlive
    ? { phase: matchPhase, waveNumber: matchWaveNumber, combatTimeRemaining, pickTimeRemaining }
    : frozenAtDeathRef.current!;

  const laneState: LaneState = {
    laneType,
    phase: display.phase,
    waveNumber: display.waveNumber,
    combatTimeRemaining: display.combatTimeRemaining,
    pickTimeRemaining: display.pickTimeRemaining,
    pendingOptions: generation.pendingOptions,
    isGenerationReady: generation.isGenerationReady,
    health,
    maxHealth,
    equippedAbilities,
    currentZombieStats: null, // MVP enemies use deterministic per-wave stats.
    isAlive,
    survivalTimeSeconds,
    // botController.ts (Darshan's, not mine to touch) assumes canvas pixel
    // space (BOT_MOVE_SPEED=90, clampPosition to 480x360) — CANVAS_SCALE
    // converts player.x/y (world units, see game/arena.ts) into that space
    // so decideBotMovement/decideBotAbilityUse get correctly-scaled input
    // once wired in.
    actorPosition: { x: player.x * CANVAS_SCALE, y: player.y * CANVAS_SCALE },
    activeZombies: enemies.map((enemy) => ({
      id: enemy.id,
      position: { x: enemy.x * CANVAS_SCALE, y: enemy.y * CANVAS_SCALE },
      health: enemy.hp,
    })),
    abilityCooldownRemainingSeconds: cooldownsRemaining,
    player,
  };

  const showInteractivePickOverlay =
    laneType === "human" &&
    display.phase === "PICKING" &&
    generation.pendingOptions !== null &&
    !generation.hasCommittedPick;

  return (
    <div className={`lane lane--${laneType}`}>
      <HUD laneState={laneState} />
      <div className="lane__arena">
        <canvas className="lane__canvas" ref={canvasRef} width={480} height={360} />
        {!isAlive && (
          <p className="lane__status lane__status--defeated">
            DEFEATED — WAVE {display.waveNumber}
          </p>
        )}
        {isAlive && display.phase === "PAUSED_GENERATING" && (
          <p className="lane__status lane__status--waiting">Waiting on ability generation…</p>
        )}
        {isAlive && display.phase === "PICKING" && generation.hasCommittedPick && (
          <p className="lane__status lane__status--waiting">Picked — waiting on other lane…</p>
        )}
        {isAlive && showInteractivePickOverlay && generation.pendingOptions && (
          <PickOverlay
            options={generation.pendingOptions}
            timeRemainingSeconds={display.pickTimeRemaining}
            onPick={generation.pick}
          />
        )}
      </div>
    </div>
  );
}
