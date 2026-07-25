import { useCallback, useEffect, useRef, useState } from "react";
import { generateZombieWavePlan } from "../ai/generateZombieWave";
import { createFallbackZombieWavePlan } from "../data/mockZombies";
import type { ZombieWavePlan } from "./types";

export interface UseZombieWaveGenerationResult {
  currentPlan: ZombieWavePlan;
  isGeneratingCurrentWave: boolean;
}

// One shared generator feeds both lanes. This keeps the match fair, halves
// zombie-generation API traffic, and lets the next wave pre-generate during
// the current combat window.
export function useZombieWaveGeneration(
  waveNumber: number,
): UseZombieWaveGenerationResult {
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const plansRef = useRef<Map<number, ZombieWavePlan>>(new Map());
  const inFlightRef = useRef<Map<number, Promise<ZombieWavePlan>>>(new Map());
  const mountedRef = useRef(true);
  const [, forceRender] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!plansRef.current.has(safeWave)) {
    plansRef.current.set(safeWave, createFallbackZombieWavePlan(safeWave));
  }

  const ensurePlan = useCallback((requestedWave: number): Promise<ZombieWavePlan> => {
    const existing = plansRef.current.get(requestedWave);
    if (existing && existing.source !== "fallback") {
      return Promise.resolve(existing);
    }

    const pending = inFlightRef.current.get(requestedWave);
    if (pending) return pending;

    if (!existing) {
      plansRef.current.set(requestedWave, createFallbackZombieWavePlan(requestedWave));
      if (mountedRef.current) forceRender((value) => value + 1);
    }

    const previousNames = [...plansRef.current.entries()]
      .filter(([wave]) => wave < requestedWave)
      .sort(([a], [b]) => a - b)
      .flatMap(([, plan]) => plan.archetypes.map((archetype) => archetype.name))
      .slice(-8);

    const request = generateZombieWavePlan(requestedWave, previousNames)
      .then((plan) => {
        plansRef.current.set(requestedWave, plan);
        if (mountedRef.current) forceRender((value) => value + 1);
        return plan;
      })
      .catch((error) => {
        console.warn(
          `[useZombieWaveGeneration] live generation failed for wave ${requestedWave}; keeping fallback roster:`,
          error instanceof Error ? error.message : error,
        );
        return plansRef.current.get(requestedWave) ?? createFallbackZombieWavePlan(requestedWave);
      })
      .finally(() => {
        inFlightRef.current.delete(requestedWave);
        if (mountedRef.current) forceRender((value) => value + 1);
      });

    inFlightRef.current.set(requestedWave, request);
    if (mountedRef.current) forceRender((value) => value + 1);
    return request;
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Resolve the active wave first. Then spend the rest of the combat window
    // pre-generating the next roster so the following transition is instant.
    void ensurePlan(safeWave).then(() => {
      if (!cancelled) void ensurePlan(safeWave + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [ensurePlan, safeWave]);

  return {
    currentPlan: plansRef.current.get(safeWave) ?? createFallbackZombieWavePlan(safeWave),
    isGeneratingCurrentWave: inFlightRef.current.has(safeWave),
  };
}
