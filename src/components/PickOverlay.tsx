import type { Ability } from "../game/types";
import { AbilityCard } from "./AbilityCard";

export interface PickOverlayProps {
  options: [Ability, Ability];
  timeRemainingSeconds: number;
  onPick: (index: 0 | 1) => void;
}

export function PickOverlay({ options, timeRemainingSeconds, onPick }: PickOverlayProps) {
  // TODO: 5-second pick window (spec section 1, step 4); auto-pick index 0
  // when timeRemainingSeconds hits 0. Human lane only listens for "1"/"2".
  return (
    <div>
      <p>Choose an ability ({timeRemainingSeconds}s)</p>
      <AbilityCard ability={options[0]} onSelect={() => onPick(0)} />
      <AbilityCard ability={options[1]} onSelect={() => onPick(1)} />
    </div>
  );
}
