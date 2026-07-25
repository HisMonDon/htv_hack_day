import { LaneView } from "./LaneView";
import type { LaneState } from "../game/types";

export interface LobbyViewProps {
  humanLaneState: LaneState;
  botLaneState: LaneState;
  onHumanPick: (index: 0 | 1) => void;
}

// Top-level split-screen view: human lane on the left, bot lane on the
// right. The two LaneView instances run completely independently — no
// shared arena, no cross-lane collision or RNG (spec section 1).
export function LobbyView({ humanLaneState, botLaneState, onHumanPick }: LobbyViewProps) {
  return (
    <div>
      <LaneView laneState={humanLaneState} onPick={onHumanPick} />
      {/* Bot lane's onPick is never invoked by UI — botController picks automatically. */}
      <LaneView laneState={botLaneState} onPick={() => {}} />
    </div>
  );
}
