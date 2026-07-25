import { useEffect, useRef } from "react";
import { LobbyView } from "./components/LobbyView";
import { generateTwoAbilityOptions } from "./ai/generateTwoAbilityOptions";

export function App() {
  // TEMP sanity check — raw one-shot call to confirm the live Gemini wiring
  // works before anything is built on top of it (not wired into game state).
  // hasRun guards against React 18 StrictMode's dev-only double-invoke of
  // effects, which would otherwise silently double every Gemini call here.
  const hasRun = useRef(false);
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    generateTwoAbilityOptions(1, "human", [])
      .then((options) => {
        console.log("[sanity check] generateTwoAbilityOptions result:", JSON.stringify(options, null, 2));
      })
      .catch((err) => {
        console.error("[sanity check] generateTwoAbilityOptions failed:", err);
      });
  }, []);

  return <LobbyView />;
}
