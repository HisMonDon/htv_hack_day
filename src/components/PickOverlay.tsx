import { useEffect } from "react";
import type { Ability } from "../game/types";
import { AbilityCard } from "./AbilityCard";
import "./PickOverlay.css";

const URGENT_THRESHOLD_SECONDS = 2;

export interface PickOverlayProps {
  options: [Ability, Ability];
  timeRemainingSeconds: number;
  onPick: (index: 0 | 1) => void;
}

// Timeout auto-pick (index 0 when the shared pick window expires) is handled
// by game/useMatchClock.ts + game/useLaneGeneration.ts, not here — this
// component only owns rendering the two options and human input (click or
// "1"/"2" keys). It's only ever mounted for the human lane (see LaneView),
// so the keydown listener never exists for the bot lane.
export function PickOverlay({ options, timeRemainingSeconds, onPick }: PickOverlayProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "1") onPick(0);
      else if (event.key === "2") onPick(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPick]);

  const isUrgent = timeRemainingSeconds <= URGENT_THRESHOLD_SECONDS;

  return (
    <div className="pick-overlay">
      <div className="pick-overlay__frame">
        <p className="pick-overlay__title">CHOOSE AN ABILITY</p>
        <p className={`pick-overlay__timer ${isUrgent ? "pick-overlay__timer--urgent" : ""}`}>
          {timeRemainingSeconds}s — press 1 or 2
        </p>
        <div className="pick-overlay__cards">
          <AbilityCard ability={options[0]} onSelect={() => onPick(0)} />
          <AbilityCard ability={options[1]} onSelect={() => onPick(1)} />
        </div>
      </div>
    </div>
  );
}
