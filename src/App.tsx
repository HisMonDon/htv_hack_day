import { useState } from "react";
import { LobbyView } from "./components/LobbyView";
import { MatchCountdown } from "./components/MatchCountdown";
import { StartMenu } from "./components/StartMenu";

export function App() {
  const [screen, setScreen] = useState<"menu" | "countdown" | "match">("menu");

  if (screen === "countdown") {
    return <MatchCountdown onComplete={() => setScreen("match")} />;
  }

  return screen === "match"
    ? <LobbyView onMenu={() => setScreen("menu")} />
    : <StartMenu onStart={() => setScreen("countdown")} />;
}
