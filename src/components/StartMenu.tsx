import "./StartMenu.css";

export interface StartMenuProps {
  onStart: () => void;
}

export function StartMenu({ onStart }: StartMenuProps) {
  return (
    <main className="start-menu">
      <div className="start-menu__noise" aria-hidden="true" />
      <section className="start-menu__hero" aria-labelledby="game-title">
        <p className="start-menu__eyebrow">GENERATIVE SURVIVAL ARENA</p>
        <h1 id="game-title">CHAOS<br /><span>ROLL</span></h1>
        <p className="start-menu__tagline">Every wave writes a new loadout. Pick quickly, survive longer, and outlast the rival bot.</p>
        <button className="start-menu__play" type="button" onClick={onStart}>
          <span>START RUN</span><kbd>ENTER</kbd>
        </button>
        <div className="start-menu__facts" aria-label="Game format">
          <span><b>15s</b> COMBAT</span><span><b>5s</b> PICK</span><span><b>2</b> ABILITY SLOTS</span>
        </div>
      </section>

      <aside className="start-menu__briefing" aria-label="How to play">
        <p className="start-menu__status"><i aria-hidden="true" /> ARENA SYSTEMS READY</p>
        <h2>RUN BRIEFING</h2>
        <ol>
          <li><b>MOVE</b><span>Evade the horde with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>.</span></li>
          <li><b>FIRE</b><span>Activate your equipped abilities with <kbd>J</kbd> and <kbd>K</kbd>.</span></li>
          <li><b>ADAPT</b><span>Choose one of two mutations before the draft timer ends.</span></li>
        </ol>
        <p className="start-menu__warning">NEW PICKS REPLACE YOUR OLDEST ABILITY.</p>
      </aside>
      <footer className="start-menu__footer">HUMAN VS RIVAL BOT <span>•</span> BUILD UNSTABLE</footer>
    </main>
  );
}
