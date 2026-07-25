import { useRef } from "react";
import type { LaneState } from "../game/types";
import { HUD } from "./HUD";
import { PickOverlay } from "./PickOverlay";

export interface LaneViewProps {
  laneState: LaneState;
  onPick: (index: 0 | 1) => void;
}

// Renders one lane (human or bot). The two lanes never share state — each
// LaneView instance owns its own canvas and reads only its own LaneState.
export function LaneView({ laneState, onPick }: LaneViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // TODO: drive the 15s combat / 5s pick loop (spec section 1) for this lane
  // independently of the other lane. Combat rendering (zombies, abilities,
  // player/bot) draws into canvasRef via renderPixelArt; input comes from
  // WASD+J/K for the human lane or botController for the bot lane.

  // Bot lane has no player input (spec section 2/5) — its pick is made
  // automatically by botController, so it never shows a clickable overlay.
  const showInteractivePickOverlay =
    laneState.laneType === "human" &&
    laneState.phase === "pick" &&
    laneState.pendingAbilityOptions;

  return (
    <div>
      <canvas ref={canvasRef} width={480} height={360} />
      <HUD laneState={laneState} />
      {showInteractivePickOverlay && laneState.pendingAbilityOptions && (
        <PickOverlay
          options={laneState.pendingAbilityOptions}
          timeRemainingSeconds={laneState.phaseTimeRemainingSeconds}
          onPick={onPick}
        />
      )}
    </div>
  );
}
