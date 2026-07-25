import "./StartMenu.css";
import { useState } from "react";
import { ProjectSprite } from "./ProjectSprite";

export interface StartMenuProps {
  onStart: () => void;
}

export function StartMenu({ onStart }: StartMenuProps) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
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
        <button className="start-menu__how" type="button" onClick={() => setShowHowToPlay(true)}>HOW TO PLAY</button>
        <div className="start-menu__facts" aria-label="Game format">
          <span><b>15s</b> COMBAT</span><span><b>5s</b> PICK</span><span><b>2</b> ABILITY SLOTS</span>
        </div>
      </section>

      <aside className="start-menu__art" aria-label="Zombie artwork">
        <ProjectSprite />
      </aside>
      <footer className="start-menu__footer">HUMAN VS RIVAL BOT <span>•</span> BUILD UNSTABLE</footer>
      {showHowToPlay && <div className="how-to-play" role="dialog" aria-modal="true" aria-label="How to play"><section><button className="how-to-play__close" type="button" onClick={() => setShowHowToPlay(false)} aria-label="Close how to play">×</button><p className="how-to-play__status"><i aria-hidden="true" /> ARENA SYSTEMS READY</p><h2>RUN BRIEFING</h2><div><strong>MOVE</strong><span>Evade the horde with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>.</span></div><div><strong>FIRE</strong><span>Activate your equipped abilities with <kbd>J</kbd> and <kbd>K</kbd>.</span></div><div><strong>ADAPT</strong><span>Choose one of two mutations before the draft timer ends.</span></div><p className="how-to-play__warning">NEW PICKS REPLACE YOUR OLDEST ABILITY.</p><button className="how-to-play__ready" type="button" onClick={() => setShowHowToPlay(false)}>GOT IT</button></section></div>}
    </main>
  );
}
