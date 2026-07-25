import { LaneView } from "./LaneView";
import { createMockEquippedAbilities } from "../data/mockAbilities";
import { useMatchClock } from "../game/useMatchClock";
import "./LobbyView.css";

// Top-level split-screen view: human lane on the left, bot lane on the
// right. LobbyView owns the single shared match clock (Task 5) so both
// LaneView instances always show the same wave/phase; each LaneView still
// owns its own ability-generation and loadout state internally. No shared
// arena, no cross-lane collision or RNG (spec section 1).
//
// health/maxHealth/isAlive are driven internally by LaneView's player
// entity/combat system (Task 4) — no longer passed in as static placeholders.
export function LobbyView() {
  const { phase, waveNumber, combatTimeRemaining, pickTimeRemaining, registerLane, notifyGenerationReady } =
    useMatchClock();

  return (
    <div className="lobby">
      <header className="lobby__header">
        <h1 className="lobby__title">CHAOS ROLL</h1>
        <span className="lobby__subtitle">live-generated loadouts</span>
      </header>
      <div className="lobby__lanes">
        <LaneView
          laneType="human"
          initialEquippedAbilities={createMockEquippedAbilities()}
          survivalTimeSeconds={0}
          matchPhase={phase}
          matchWaveNumber={waveNumber}
          combatTimeRemaining={combatTimeRemaining}
          pickTimeRemaining={pickTimeRemaining}
          registerLane={registerLane}
          notifyGenerationReady={notifyGenerationReady}
        />
        <LaneView
          laneType="bot"
          initialEquippedAbilities={createMockEquippedAbilities()}
          survivalTimeSeconds={0}
          matchPhase={phase}
          matchWaveNumber={waveNumber}
          combatTimeRemaining={combatTimeRemaining}
          pickTimeRemaining={pickTimeRemaining}
          registerLane={registerLane}
          notifyGenerationReady={notifyGenerationReady}
        />
      </div>
    </div>
  );
}
