import { useCallback, useRef, useState } from "react";
import { CountdownOverlay } from "./CountdownOverlay";
import { LaneView } from "./LaneView";
import { MatchResult } from "./MatchResult";
import { createMockEquippedAbilities } from "../data/mockAbilities";
import { useMatchClock } from "../game/useMatchClock";
import { useZombieWaveGeneration } from "../game/useZombieWaveGeneration";
import { getStatRangesForWave } from "../game/statRanges";
import { clampAbilityToRange } from "../game/clamp";
import type { Ability, LaneType } from "../game/types";
import "./LobbyView.css";

// Starting loadouts are pre-authored mock content, so they get the same wave-1
// clamp every generated ability gets. Without this the match opens with
// whatever raw numbers the mock table happens to carry.
function createStartingLoadout(laneType: LaneType): [Ability, Ability] {
  const ranges = getStatRangesForWave(1, laneType);
  const [first, second] = createMockEquippedAbilities();
  return [clampAbilityToRange(first, ranges), clampAbilityToRange(second, ranges)];
}

// Top-level split-screen view: human lane on the left, bot lane on the
// right. LobbyView owns the single shared match clock (Task 5) so both
// LaneView instances always show the same wave/phase; each LaneView still
// owns its own ability-generation and loadout state internally. No shared
// arena, no cross-lane collision or RNG (spec section 1).
//
// health/maxHealth/isAlive are driven internally by LaneView's player
// entity/combat system (Task 4) — no longer passed in as static placeholders.
export function LobbyView({ onMenu }: { onMenu: () => void }) {
  const [result, setResult] = useState<{ type: "victory" | "defeat"; waveNumber: number } | null>(null);
  const [matchId, setMatchId] = useState(0);

  return (
    <>
      <ActiveMatch key={matchId} onResult={(next) => setResult((current) => current ?? next)} />
      {result && <MatchResult result={result.type} waveNumber={result.waveNumber} onPlayAgain={() => { setResult(null); setMatchId((id) => id + 1); }} onMenu={onMenu} />}
    </>
  );
}

function ActiveMatch({
  onResult,
}: {
  onResult: (result: { type: "victory" | "defeat"; waveNumber: number } | null) => void;
}) {
  const [countdownDone, setCountdownDone] = useState(false);
  const humanLoadoutRef = useRef(createStartingLoadout("human"));
  const botLoadoutRef = useRef(createStartingLoadout("bot"));
  const { phase, waveNumber, combatTimeRemaining, pickTimeRemaining, registerLane, notifyGenerationReady } =
    useMatchClock(1, countdownDone);
  const visiblePhase = countdownDone ? phase : "TRANSITIONING";
  const { currentPlan: zombieWavePlan, isGeneratingCurrentWave } =
    useZombieWaveGeneration(waveNumber);
  const handleDefeated = useCallback((laneType: "human" | "bot", defeatedAtWave: number) => {
    onResult({ type: laneType === "human" ? "defeat" : "victory", waveNumber: defeatedAtWave });
  }, [onResult]);

  return (
    <div className="lobby">
      <header className="lobby__header">
        <h1 className="lobby__title">CHAOS ROLL</h1>
        <span className="lobby__subtitle">live-generated loadouts</span>
      </header>
      <div className="lobby__lanes">
        <LaneView
          laneType="human"
          initialEquippedAbilities={humanLoadoutRef.current}
          survivalTimeSeconds={0}
          matchPhase={visiblePhase}
          matchWaveNumber={waveNumber}
          combatTimeRemaining={combatTimeRemaining}
          pickTimeRemaining={pickTimeRemaining}
          registerLane={registerLane}
          notifyGenerationReady={notifyGenerationReady}
          onDefeated={handleDefeated}
          zombieWavePlan={zombieWavePlan}
          isZombieWaveGenerating={isGeneratingCurrentWave}
        />
        <LaneView
          laneType="bot"
          initialEquippedAbilities={botLoadoutRef.current}
          survivalTimeSeconds={0}
          matchPhase={visiblePhase}
          matchWaveNumber={waveNumber}
          combatTimeRemaining={combatTimeRemaining}
          pickTimeRemaining={pickTimeRemaining}
          registerLane={registerLane}
          notifyGenerationReady={notifyGenerationReady}
          onDefeated={handleDefeated}
          zombieWavePlan={zombieWavePlan}
          isZombieWaveGenerating={isGeneratingCurrentWave}
        />
      </div>
      {!countdownDone && (
        <CountdownOverlay
          humanAbilities={humanLoadoutRef.current}
          botAbilities={botLoadoutRef.current}
          onComplete={() => setCountdownDone(true)}
        />
      )}
    </div>
  );
}
