import type { LaneState } from "../game/types";
import { categoryColorVar } from "./categoryColor";
import { SpriteCanvas } from "./SpriteCanvas";
import "./HUD.css";

export interface HUDProps {
  laneState: LaneState;
}

const LOW_HP_THRESHOLD = 0.25;
const DEMO_MIN_COOLDOWN_SECONDS = 0.6;
const DEMO_MAX_COOLDOWN_SECONDS = 1.8;

export function HUD({ laneState }: HUDProps) {
  const hpFraction = laneState.maxHealth > 0 ? laneState.health / laneState.maxHealth : 0;
  const isLowHp = hpFraction <= LOW_HP_THRESHOLD;
  const abilityKeys = ["J", "K"] as const;

  return (
    <div className={`hud hud--${laneState.laneType}`}>
      <div className="hud__top">
        <span className="hud__lane-tag">{laneState.laneType}</span>
        <span className="hud__wave">WAVE {laneState.waveNumber}</span>
        <span className="hud__timer">{laneState.survivalTimeSeconds}s survived</span>
      </div>

      <div className="hud__hp-row">
        <div className="hud__hp-bar">
          <div
            className={`hud__hp-fill ${isLowHp ? "hud__hp-fill--low" : ""}`}
            style={{ width: `${Math.max(0, Math.min(1, hpFraction)) * 100}%` }}
          />
        </div>
        <span className={`hud__hp-text ${isLowHp ? "hud__hp-text--low" : ""}`}>
          {laneState.health}/{laneState.maxHealth}
        </span>
      </div>

      <div className="hud__abilities">
        {laneState.equippedAbilities.map((ability, index) => {
          const remaining = laneState.abilityCooldownRemainingSeconds[index];
          const max = Math.max(
            DEMO_MIN_COOLDOWN_SECONDS,
            Math.min(DEMO_MAX_COOLDOWN_SECONDS, ability.cooldownSeconds),
          );
          const isReady = remaining <= 0;
          const fillFraction = max > 0 ? Math.max(0, Math.min(1, 1 - remaining / max)) : 1;
          const categoryColor = categoryColorVar(ability.category);

          return (
            <div
              key={index}
              className={`hud__ability ${isReady ? "hud__ability--ready" : ""}`}
              style={{ ["--category-color" as string]: categoryColor }}
            >
              <SpriteCanvas sprite={ability.sprite} scale={1} className="hud__ability-sprite" />
              <span className="hud__ability-key">{abilityKeys[index]}</span>
              <div className="hud__ability-info">
                <div className="hud__ability-name">{ability.name}</div>
                <div className="hud__ability-cd-track">
                  <div
                    className="hud__ability-cd-fill"
                    style={{ width: `${fillFraction * 100}%` }}
                  />
                </div>
              </div>
              <span className={`hud__ability-cd-text ${isReady ? "hud__ability-cd-text--ready" : ""}`}>
                {isReady ? "READY" : `${remaining.toFixed(1)}s`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
