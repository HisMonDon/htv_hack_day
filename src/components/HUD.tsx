import type { LaneState } from "../game/types";

export interface HUDProps {
  laneState: LaneState;
}

export function HUD({ laneState }: HUDProps) {
  // TODO: render health bar, wave number, survival time, and the two
  // equipped ability slots (with cooldown state) for this lane.
  return (
    <div>
      <p>{laneState.laneType.toUpperCase()}</p>
      <p>Wave {laneState.waveNumber}</p>
      <p>
        HP {laneState.health}/{laneState.maxHealth}
      </p>
      <p>Survived {laneState.survivalTimeSeconds}s</p>
    </div>
  );
}
