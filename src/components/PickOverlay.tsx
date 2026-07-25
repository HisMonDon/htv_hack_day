import { useEffect } from "react";
import type { Ability } from "../game/types";
import { AbilityCard } from "./AbilityCard";

export interface PickOverlayProps {
  options: [Ability, Ability];
  timeRemainingSeconds: number;
  onPick: (index: 0 | 1) => void;
}

// Timeout auto-pick (index 0 when the 5s window expires) is handled by
// game/useLaneTimer.ts, not here — this component only owns rendering the
// two options and human input (click or "1"/"2" keys). It's only ever
// mounted for the human lane (see LaneView), so the keydown listener never
// exists for the bot lane.
export function PickOverlay({ options, timeRemainingSeconds, onPick }: PickOverlayProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "1") onPick(0);
      else if (event.key === "2") onPick(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPick]);

  return (
    <div>
      <p>Choose an ability ({timeRemainingSeconds}s)</p>
      <AbilityCard ability={options[0]} onSelect={() => onPick(0)} />
      <AbilityCard ability={options[1]} onSelect={() => onPick(1)} />
    </div>
  );
}
