import { useState } from "react";
import { LobbyView } from "./components/LobbyView";
import { StartMenu } from "./components/StartMenu";

export function App() {
  const [started, setStarted] = useState(false);

  return started ? <LobbyView onMenu={() => setStarted(false)} /> : <StartMenu onStart={() => setStarted(true)} />;
}
