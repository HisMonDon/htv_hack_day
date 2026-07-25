import { useEffect, useState } from "react";
import "./MatchCountdown.css";

export interface MatchCountdownProps {
  onComplete: () => void;
}

interface BriefingStep {
  title: string;
  label: string;
  copy: string;
  accent: "human" | "bot" | "neutral";
}

const BRIEFING_STEPS: Record<number, BriefingStep> = {
  4: {
    title: "ARENA LINK",
    label: "SYSTEM CHECK",
    copy: "Both fighters enter with two generated abilities. Read the HUD, then make every cooldown count.",
    accent: "neutral",
  },
  3: {
    title: "YOUR ABILITIES",
    label: "HUMAN // J + K",
    copy: "Move with WASD. Press J or K to use your equipped abilities as soon as their cooldown bars are ready.",
    accent: "human",
  },
  2: {
    title: "RIVAL AI",
    label: "BOT // AUTONOMOUS",
    copy: "The rival has its own two-ability loadout. It moves, casts, and picks upgrades automatically—outlast it to win.",
    accent: "bot",
  },
  1: {
    title: "ADAPT OR FALL",
    label: "NEXT WAVE // NEW PICK",
    copy: "After each wave, choose a mutation quickly. New picks replace your oldest ability, while the rival evolves too.",
    accent: "neutral",
  },
};

export function MatchCountdown({ onComplete }: MatchCountdownProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(4);
  const step = BRIEFING_STEPS[secondsRemaining];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(1, current - 1));
    }, 1000);
    const completeId = window.setTimeout(onComplete, 4000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(completeId);
    };
  }, [onComplete]);

  return (
    <main className="match-countdown" aria-labelledby="match-countdown-title">
      <div className="match-countdown__grid" aria-hidden="true" />
      <section className={`match-countdown__briefing match-countdown__briefing--${step.accent}`}>
        <p className="match-countdown__label">{step.label}</p>
        <h1 id="match-countdown-title">{step.title}</h1>
        <p className="match-countdown__copy">{step.copy}</p>
      </section>

      <div className="match-countdown__timer" aria-live="assertive" aria-atomic="true">
        <span>STARTING IN</span>
        <strong key={secondsRemaining}>{secondsRemaining}</strong>
      </div>

      <p className="match-countdown__footer">CHAOS ROLL // LIVE ARENA INITIALIZING</p>
    </main>
  );
}
