import "./MatchResult.css";

export interface MatchResultProps {
  result: "victory" | "defeat";
  waveNumber: number;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function MatchResult({ result, waveNumber, onPlayAgain, onMenu }: MatchResultProps) {
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
        <button className="match-result__menu" type="button" onClick={onMenu}>GO BACK TO MENU</button>
      </section>
    </div>
  );
}
