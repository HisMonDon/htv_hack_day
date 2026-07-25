import { useCallback, useEffect, useRef, useState } from "react";
import type { LanePhase, LaneType } from "./types";

export const COMBAT_DURATION_SECONDS = 15;
export const PICK_DURATION_SECONDS = 12;
const TICK_MS = 1000;

export interface MatchClockState {
  phase: LanePhase;
  waveNumber: number;
  combatTimeRemaining: number;
  pickTimeRemaining: number;
}

// What useMatchClock needs from each lane in order to gate phase
// transitions. Ability generation itself (what to generate, how a lane
// resolves its own pick) stays owned by that lane's useLaneGeneration
// instance — this is just the read/trigger surface the shared clock needs.
export interface LaneAdapter {
  isAlive: () => boolean;
  isGenerationReady: () => boolean;
  // True once this lane has chosen its option for the active pick phase.
  hasCommittedPick: () => boolean;
  // True once this lane's current wave has spawned zombies and every one of
  // them is dead — lets the clock skip the rest of the combat timer instead
  // of idling until it expires.
  hasNoEnemies: () => boolean;
  // Kicks off generation of the options that will be presented at the end
  // of forWaveNumber's combat phase.
  kickGeneration: (forWaveNumber: number) => void;
  // Called exactly once when the shared pick window closes for this round.
  // Auto-picks option 0 if the lane hasn't committed a pick yet, resets the
  // lane's generation state, and kicks off the next wave's generation.
  finalizeRound: (nextWaveNumber: number) => void;
}

export interface UseMatchClockResult extends MatchClockState {
  registerLane: (laneType: LaneType, adapter: LaneAdapter) => void;
  // A lane calls this the instant its OWN generation becomes ready, so a
  // match paused on it can resume immediately instead of waiting for the
  // next tick.
  notifyGenerationReady: () => void;
  // A lane calls this immediately after committing its pick so the shared
  // clock can advance without waiting for the fallback timer.
  notifyPickCommitted: () => void;
}

function createInitialState(waveNumber: number): MatchClockState {
  return {
    phase: "COMBAT",
    waveNumber,
    combatTimeRemaining: COMBAT_DURATION_SECONDS,
    pickTimeRemaining: PICK_DURATION_SECONDS,
  };
}

// Task 5 — one shared clock driving BOTH lanes' phase/wave/timers, replacing
// the two independent useLaneTimer instances from Task 1. Both LaneView
// instances read from a single instance of this hook (owned by LobbyView),
// so they always show the same wave number and transition
// COMBAT -> PICKING -> next wave at the same moment. Per-lane generation and
// pick resolution remain independent — see useLaneGeneration.ts.
export function useMatchClock(initialWaveNumber = 1): UseMatchClockResult {
  const [state, setState] = useState<MatchClockState>(() => createInitialState(initialWaveNumber));
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const lanesRef = useRef<Map<LaneType, LaneAdapter>>(new Map());
  const hasKickedInitialRef = useRef<Set<LaneType>>(new Set());
  const isFinalizingRef = useRef(false);

  const aliveLaneEntries = useCallback((): [LaneType, LaneAdapter][] => {
    return [...lanesRef.current.entries()].filter(([, adapter]) => adapter.isAlive());
  }, []);

  const registerLane = useCallback((laneType: LaneType, adapter: LaneAdapter) => {
    lanesRef.current.set(laneType, adapter);
    // Spec 1.2 step 1 equivalent — the very first wave has no pendingOptions
    // yet, so generation is kicked off immediately on registration rather
    // than waiting for a round to finalize. Guarded per lane so remounts /
    // re-registration (e.g. React StrictMode double-invoke) never double-kick.
    if (!hasKickedInitialRef.current.has(laneType)) {
      hasKickedInitialRef.current.add(laneType);
      adapter.kickGeneration(stateRef.current.waveNumber + 1);
    }
  }, []);

  // Section 3 — the gate both lanes must clear (excluding dead lanes, Section
  // 4) before the match can move from COMBAT into PICKING.
  const tryOpenPicking = useCallback(() => {
    const alive = aliveLaneEntries();
    if (alive.length === 0) return; // both lanes dead — nothing left to advance.

    const notReady = alive.filter(([, adapter]) => !adapter.isGenerationReady());
    if (notReady.length > 0) {
      for (const [laneType] of notReady) {
        console.warn(
          `[useMatchClock] waiting on ${laneType} lane generation for wave ${stateRef.current.waveNumber}`,
        );
      }
      setState((prev) => ({ ...prev, phase: "PAUSED_GENERATING", combatTimeRemaining: 0 }));
      return;
    }

    setState((prev) => ({
      ...prev,
      phase: "PICKING",
      combatTimeRemaining: 0,
      pickTimeRemaining: PICK_DURATION_SECONDS,
    }));
  }, [aliveLaneEntries]);

  const notifyGenerationReady = useCallback(() => {
    if (stateRef.current.phase === "PAUSED_GENERATING") tryOpenPicking();
  }, [tryOpenPicking]);

  // Section 5 (TRANSITIONING) — folded into one synchronous update, same as
  // the original per-lane version: increment wave, finalize every alive
  // lane's pick, reset both timers, land back in COMBAT.
  const finalizeRound = useCallback(() => {
    if (stateRef.current.phase !== "PICKING" || isFinalizingRef.current) return;
    isFinalizingRef.current = true;
    const nextWaveNumber = stateRef.current.waveNumber + 1;
    for (const [, adapter] of aliveLaneEntries()) {
      adapter.finalizeRound(nextWaveNumber);
    }
    const nextState: MatchClockState = {
      phase: "COMBAT",
      waveNumber: nextWaveNumber,
      combatTimeRemaining: COMBAT_DURATION_SECONDS,
      pickTimeRemaining: PICK_DURATION_SECONDS,
    };
    // Update the ref synchronously so a timer tick or a second notification
    // in the same render cannot finalize the round twice.
    stateRef.current = nextState;
    setState(nextState);
    isFinalizingRef.current = false;
  }, [aliveLaneEntries]);

  const tryFinalizePickedRound = useCallback(() => {
    if (stateRef.current.phase !== "PICKING") return;
    const alive = aliveLaneEntries();
    if (alive.length > 0 && alive.every(([, adapter]) => adapter.hasCommittedPick())) {
      finalizeRound();
    }
  }, [aliveLaneEntries, finalizeRound]);

  const notifyPickCommitted = useCallback(() => {
    tryFinalizePickedRound();
  }, [tryFinalizePickedRound]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Section 4 — once both lanes are dead there is nothing left to
      // advance; freeze the shared clock entirely rather than looping
      // PICKING/COMBAT transitions no one can see.
      if (aliveLaneEntries().length === 0) return;

      const current = stateRef.current;

      if (current.phase === "COMBAT") {
        // Both sides cleared their wave early — no reason to sit out the
        // rest of the combat timer with nothing left to fight.
        const alive = aliveLaneEntries();
        if (alive.length > 0 && alive.every(([, adapter]) => adapter.hasNoEnemies())) {
          tryOpenPicking();
          return;
        }

        const remaining = current.combatTimeRemaining - 1;
        if (remaining > 0) {
          setState({ ...current, combatTimeRemaining: remaining });
          return;
        }
        tryOpenPicking();
        return;
      }

      if (current.phase === "PICKING") {
        const remaining = current.pickTimeRemaining - 1;
        if (remaining > 0) {
          setState({ ...current, pickTimeRemaining: remaining });
          return;
        }
        finalizeRound();
        return;
      }

      if (current.phase === "PAUSED_GENERATING") {
        tryOpenPicking();
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [aliveLaneEntries, tryOpenPicking, finalizeRound]);

  return { ...state, registerLane, notifyGenerationReady, notifyPickCommitted };
}
