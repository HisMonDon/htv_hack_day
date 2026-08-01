import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Ability,
  Enemy,
  LanePhase,
  LaneState,
  LaneType,
  ZombieWavePlan,
} from "../game/types";
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
  notifyPickCommitted: () => void;
  onDefeated: (laneType: LaneType, waveNumber: number) => void;
  zombieWavePlan: ZombieWavePlan;
  isZombieWaveGenerating: boolean;
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
  notifyPickCommitted,
  onDefeated,
  zombieWavePlan,
  isZombieWaveGenerating,
}: LaneViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aura, setAura] = useState<Ability["category"] | null>(null);

  const [equippedAbilities, setEquippedAbilities] = useState<[Ability, Ability]>(
    initialEquippedAbilities,
  );
  useEffect(() => {
    let timeoutId = 0;
    const onAbilityUsed = (event: Event) => {
      const detail = (event as CustomEvent<{ laneType: LaneType; category: Ability["category"] }>).detail;
      if (detail.laneType !== laneType) return;
      setAura(detail.category);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setAura(null), 700);
    };
    window.addEventListener("chaos-roll:ability-used", onAbilityUsed);
    return () => { window.removeEventListener("chaos-roll:ability-used", onAbilityUsed); window.clearTimeout(timeoutId); };
  }, [laneType]);
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

  // Populated after usePlayerCombat runs below (declared here so
  // hasNoEnemies/the registerLane effect above it can close over the ref
  // rather than the value, which would otherwise be stale).
  const enemiesRef = useRef<Enemy[]>([]);
  const hasNoEnemies = useCallback(
    () => enemiesRef.current.length > 0 && enemiesRef.current.every((enemy) => !enemy.alive),
    [],
  );

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
    notifyPickCommitted,
  });

  // Register this lane's generation adapter with the shared match clock once
  // on mount (and again if the adapter identity changes) — Map.set on the
  // same laneType key is idempotent, and useMatchClock guards the
  // one-time "kick off wave 1's generation" call internally.
  useEffect(() => {
    registerLane(laneType, { ...generation.adapter, hasNoEnemies });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneType, registerLane, generation.adapter, hasNoEnemies]);

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
    zombieWavePlan,
    equippedAbilities,
    canvasRef,
  });
  isAliveRef.current = isAlive;
  enemiesRef.current = enemies;

  // This belongs to the lane rather than LobbyView: a defeated lane freezes
  // while the surviving lane may continue playing.
  const [liveSurvivalSeconds, setLiveSurvivalSeconds] = useState(survivalTimeSeconds);
  useEffect(() => {
    if (!isAlive || matchPhase === "TRANSITIONING") return;
    const intervalId = window.setInterval(() => {
      setLiveSurvivalSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isAlive, matchPhase]);

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

  // On the first render after death, the effect above has not populated the
  // ref yet. Use the current clock as a one-render fallback so the defeat
  // callback and match-result overlay can mount instead of dereferencing
  // null during that transition.
  const currentClock = { phase: matchPhase, waveNumber: matchWaveNumber, combatTimeRemaining, pickTimeRemaining };
  const display = isAlive ? currentClock : (frozenAtDeathRef.current ?? currentClock);

  const reportedDefeatRef = useRef(false);
  useEffect(() => {
    if (isAlive || reportedDefeatRef.current) return;
    reportedDefeatRef.current = true;
    onDefeated(laneType, display.waveNumber);
  }, [isAlive, laneType, display.waveNumber, onDefeated]);

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
    currentZombieWave: zombieWavePlan,
    isAlive,
    survivalTimeSeconds: liveSurvivalSeconds,
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

  const healthFraction = maxHealth > 0 ? health / maxHealth : 0;
  const dangerClass =
    !isAlive || healthFraction > 0.5
      ? ""
      : healthFraction <= 0.25
        ? "lane--critical"
        : "lane--wounded";

  return (
    <div className={`lane lane--${laneType} ${dangerClass}`}>
      <HUD laneState={laneState} />
      <div className="lane__arena">
        <canvas className="lane__canvas" ref={canvasRef} width={480} height={360} />
        {aura && (
          <div
            className={`lane__aura lane__aura--${aura.toLowerCase()}`}
            aria-hidden="true"
          >
            {Array.from({ length: 14 }, (_, index) => (
              <i key={index} style={{ ["--n" as string]: index }} />
            ))}
          </div>
        )}
        <aside className="lane__mutant-roster" aria-label="Current AI-generated zombie types">
          <span className="lane__mutant-kicker">
            {isZombieWaveGenerating ? "MUTATING LIVE" : "WAVE MUTATIONS"}
          </span>
          <strong className="lane__mutant-theme">{zombieWavePlan.theme}</strong>
          {zombieWavePlan.archetypes.map((archetype) => (
            <span className="lane__mutant-type" key={archetype.id}>
              {archetype.name}
              <small>{archetype.ability.name}</small>
            </span>
          ))}
        </aside>
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
