import { useEffect, useState } from "react";
import type { Ability } from "../game/types";
import { SpriteCanvas } from "./SpriteCanvas";
import { categoryColorVar } from "./categoryColor";
import "./CountdownOverlay.css";

export interface CountdownOverlayProps {
  humanAbilities: [Ability, Ability];
  botAbilities: [Ability, Ability];
  onComplete: () => void;
}

type Phase = "counting" | "go" | "done";

export function CountdownOverlay({
  humanAbilities,
  botAbilities,
  onComplete,
}: CountdownOverlayProps) {
  const [count, setCount] = useState(4);
  const [phase, setPhase] = useState<Phase>("counting");

  useEffect(() => {
    if (phase !== "counting") return;

    const id = setInterval(() => {
      setCount((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(id);
          setPhase("go");
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "go") return;

    const timeout = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 600);

    return () => clearTimeout(timeout);
  }, [phase, onComplete]);

  if (phase === "done") return null;

  return (
    <div className="countdown-overlay">
      {/* Ability info cards */}
      <div className="countdown-overlay__abilities">
        {/* Human side — left */}
        <div className="countdown-overlay__side countdown-overlay__side--human">
          <span className="countdown-overlay__side-label countdown-overlay__side-label--human">
            HUMAN
          </span>
          {humanAbilities.map((ability, i) => (
            <div
              key={ability.name}
              className="countdown-overlay__card countdown-overlay__card--left"
              style={{ animationDelay: `${0.3 + i * 0.3}s` }}
            >
              <div className="countdown-overlay__card-sprite">
                <SpriteCanvas sprite={ability.sprite} scale={4} />
              </div>
              <div className="countdown-overlay__card-body">
                <span className="countdown-overlay__card-name">{ability.name}</span>
                <span
                  className="countdown-overlay__card-category"
                  style={{ color: categoryColorVar(ability.category) }}
                >
                  {ability.category}
                </span>
                <span className="countdown-overlay__card-desc">{ability.description}</span>
                <kbd className="countdown-overlay__card-key">{i === 0 ? "J" : "K"}</kbd>
              </div>
            </div>
          ))}
        </div>

        {/* Bot side — right */}
        <div className="countdown-overlay__side countdown-overlay__side--bot">
          <span className="countdown-overlay__side-label countdown-overlay__side-label--bot">
            BOT
          </span>
          {botAbilities.map((ability, i) => (
            <div
              key={ability.name}
              className="countdown-overlay__card countdown-overlay__card--right"
              style={{ animationDelay: `${0.3 + i * 0.3}s` }}
            >
              <div className="countdown-overlay__card-sprite">
                <SpriteCanvas sprite={ability.sprite} scale={4} />
              </div>
              <div className="countdown-overlay__card-body">
                <span className="countdown-overlay__card-name">{ability.name}</span>
                <span
                  className="countdown-overlay__card-category"
                  style={{ color: categoryColorVar(ability.category) }}
                >
                  {ability.category}
                </span>
                <span className="countdown-overlay__card-desc">{ability.description}</span>
                <kbd className="countdown-overlay__card-key">AUTO</kbd>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Central countdown number */}
      {phase === "counting" && count > 0 && (
        <span key={count} className="countdown-overlay__number">
          {count}
        </span>
      )}
      {phase === "go" && <span className="countdown-overlay__go">GO!</span>}
    </div>
  );
}
