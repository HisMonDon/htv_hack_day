import type { ZombieWavePlan } from "../game/types";
import { getFallbackSprite, tierForWave } from "./spriteLibrary";

// Emergency-only content for missing credentials, quota failures, or an
// invalid model response. Live matches replace this plan as soon as Gemini's
// generated wave arrives.
export function createFallbackZombieWavePlan(waveNumber: number): ZombieWavePlan {
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const sprite = getFallbackSprite("ZOMBIE", tierForWave(safeWave));
  if (!sprite) {
    throw new Error("no fallback zombie sprite is available");
  }

  return {
    waveNumber: safeWave,
    theme: "Emergency Horde",
    source: "fallback",
    archetypes: [
      {
        // Keep the implementation source private: enemy IDs are included in
        // combat debug output, so they should use the player-facing name.
        id: `emergency-shambler-${safeWave}`,
        name: "Emergency Shambler",
        description: "A basic emergency enemy used while live generation is unavailable.",
        maxHealth: Math.min(180, 35 + safeWave * 8),
        moveSpeed: Math.min(3.75, 1.45 + safeWave * 0.08),
        spawnWeight: 1,
        ability: {
          name: "Ragged Bite",
          description: "Closes the gap and delivers a basic contact attack.",
          attackShape: "CONTACT",
          movementAction: "NONE",
          damage: Math.min(18, 5 + Math.floor(safeWave * 0.8)),
          cooldownSeconds: 0.9,
          range: 0.95,
          areaOfEffect: 0.5,
          durationSeconds: 0.2,
          projectileSpeed: 8,
          movementMultiplier: 1,
          movementDistance: 0,
          effectColor: "#8fae4b",
        },
        sprite,
      },
    ],
  };
}
