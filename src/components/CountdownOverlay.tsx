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

    const id = window.setInterval(() => {
      setCount((previous) => {
        const next = previous - 1;
        if (next <= 0) {
          window.clearInterval(id);
          setPhase("go");
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "go") return;

    const timeout = window.setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [phase, onComplete]);

  if (phase === "done") return null;

  return (
    <div className="countdown-overlay" aria-live="assertive" aria-label="Match starting countdown">
      <div className="countdown-overlay__abilities">
        <div className="countdown-overlay__side countdown-overlay__side--human">
          <span className="countdown-overlay__side-label countdown-overlay__side-label--human">
            HUMAN
          </span>
          {humanAbilities.map((ability, index) => (
            <div
              key={ability.name}
              className="countdown-overlay__card countdown-overlay__card--left"
              style={{ animationDelay: `${0.3 + index * 0.3}s` }}
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
                <kbd className="countdown-overlay__card-key">{index === 0 ? "J" : "K"}</kbd>
              </div>
            </div>
          ))}
        </div>

        <div className="countdown-overlay__side countdown-overlay__side--bot">
          <span className="countdown-overlay__side-label countdown-overlay__side-label--bot">
            BOT
          </span>
          {botAbilities.map((ability, index) => (
            <div
              key={ability.name}
              className="countdown-overlay__card countdown-overlay__card--right"
              style={{ animationDelay: `${0.3 + index * 0.3}s` }}
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

      {phase === "counting" && count > 0 && <span key={count} className="countdown-overlay__number">{count}</span>}
      {phase === "go" && <span className="countdown-overlay__go">GO!</span>}
    </div>
  );
}
