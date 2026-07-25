import { useEffect, useRef } from "react";

export interface MovementVector {
  x: number;
  y: number;
}

// Task 4 — WASD input tracking for the human lane's player entity. Scoped
// to human input only; the bot lane's entity position is driven by
// botController.ts (not this hook) once that's wired in. Pure input
// tracking — doesn't know about arena bounds, phase, or speed; the caller
// (usePlayerCombat) decides when/how to apply the vector each frame.
export function usePlayerMovement() {
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      pressedKeysRef.current.add(event.key.toLowerCase());
    }
    function handleKeyUp(event: KeyboardEvent) {
      pressedKeysRef.current.delete(event.key.toLowerCase());
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  function getMovementVector(): MovementVector {
    const keys = pressedKeysRef.current;
    let x = 0;
    let y = 0;
    if (keys.has("a")) x -= 1;
    if (keys.has("d")) x += 1;
    if (keys.has("w")) y -= 1; // canvas y grows downward
    if (keys.has("s")) y += 1;

    if (x !== 0 && y !== 0) {
      const norm = Math.SQRT1_2;
      x *= norm;
      y *= norm;
    }
    return { x, y };
  }

  return { getMovementVector };
}
