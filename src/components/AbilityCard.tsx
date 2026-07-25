import type { Ability } from "../game/types";
import { categoryColorVar } from "./categoryColor";
import { SpriteCanvas } from "./SpriteCanvas";
import "./AbilityCard.css";

export interface AbilityCardProps {
  ability: Ability;
  onSelect?: () => void;
}

export function AbilityCard({ ability, onSelect }: AbilityCardProps) {
  return (
    <div
      className="ability-card notched"
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
      <div className="ability-card__header">
        <SpriteCanvas sprite={ability.sprite} scale={3} className="ability-card__sprite" />
        <span className="ability-card__tag">{ability.category}</span>
      </div>
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
