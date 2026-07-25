import { useState } from "react";
import { LobbyView } from "./components/LobbyView";
import { StartMenu } from "./components/StartMenu";
import music from "./audio/music.mp3";

let gameMusic: HTMLAudioElement | null = null;

function startMusic() {
  if (!gameMusic) {
    gameMusic = new Audio(music);
    gameMusic.loop = true;
    gameMusic.volume = 0.4;
  }

  gameMusic.play().catch((err) => {
    console.log("Music failed:", err);
  });
}

export function App() {
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    startMusic();
    setStarted(true);
  };

  return started ? (
    <LobbyView onMenu={() => setStarted(false)} />
  ) : (
    <StartMenu onStart={handleStart} />
  );
}