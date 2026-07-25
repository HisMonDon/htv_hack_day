import type { Ability } from "../game/types";
import { categoryColorVar } from "./categoryColor";
import "./AbilityCard.css";

export interface AbilityCardProps {
  ability: Ability;
  onSelect?: () => void;
}

// TODO: render ability sprite via renderPixelArt once that's wired up
// (Task 4/5 scope, not this styling pass).
export function AbilityCard({ ability, onSelect }: AbilityCardProps) {
  return (
    <div
      className="ability-card"
      style={{ ["--category-color" as string]: categoryColorVar(ability.category) }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${ability.name}, ${ability.category}`}
    >
      <span className="ability-card__tag">{ability.category}</span>
      <p className="ability-card__name">{ability.name}</p>
      <p className="ability-card__description">{ability.description}</p>
      <div className="ability-card__stats">
        {ability.damage !== null && (
          <span>
            <span className="ability-card__stat-label">DMG </span>
            {ability.damage}
          </span>
        )}
        <span>
          <span className="ability-card__stat-label">CD </span>
          {ability.cooldownSeconds}s
        </span>
        <span>
          <span className="ability-card__stat-label">RANGE </span>
          {ability.range}
        </span>
        {ability.areaOfEffect !== null && (
          <span>
            <span className="ability-card__stat-label">AOE </span>
            {ability.areaOfEffect}
          </span>
        )}
      </div>
    </div>
  );
}
