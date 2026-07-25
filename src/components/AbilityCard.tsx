import type { Ability } from "../game/types";

export interface AbilityCardProps {
  ability: Ability;
  onSelect?: () => void;
}

export function AbilityCard({ ability, onSelect }: AbilityCardProps) {
  // TODO: render ability sprite via renderPixelArt, show stats, wire
  // onSelect to click + the 1/2 pick-phase keybinds (human lane only).
  return (
    <div onClick={onSelect}>
      <p>{ability.name}</p>
      <p>{ability.category}</p>
      <p>{ability.description}</p>
    </div>
  );
}
