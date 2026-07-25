import "./MatchResult.css";

export interface MatchResultProps {
  result: "victory" | "defeat";
  waveNumber: number;
  onPlayAgain: () => void;
}

export function MatchResult({ result, waveNumber, onPlayAgain }: MatchResultProps) {
  const victory = result === "victory";
  return (
    <div className={`match-result match-result--${result}`} role="dialog" aria-modal="true" aria-label={victory ? "Victory" : "Defeat"}>
      <section className="match-result__panel">
        <div className="match-result__icon" aria-hidden="true">{victory ? "🏆" : "☠"}</div>
        <p>{victory ? "RIVAL ELIMINATED" : "RUN TERMINATED"}</p>
        <h1>{victory ? "VICTORY" : "DEFEAT"}</h1>
        <span className="match-result__rule" />
        <strong>REACHED WAVE {String(waveNumber).padStart(2, "0")}</strong>
        <button type="button" onClick={onPlayAgain}>RUN IT BACK <kbd>↵</kbd></button>
      </section>
    </div>
  );
}
