import { useCallback, useEffect, useRef, useState } from "react";
import type { Ability, LaneTimerState, LaneType } from "./types";
import { getStatRangesForWave } from "./statRanges";
import { generateTwoAbilityOptions } from "../ai/generateTwoAbilityOptions";
import { createMockAbilityPair } from "../data/mockAbilities";

export const COMBAT_DURATION_SECONDS = 15;
export const PICK_DURATION_SECONDS = 5;
const TICK_MS = 1000;

export interface UseLaneTimerOptions {
  laneType: LaneType;
  initialWaveNumber?: number;
  // Always-fresh accessor, not a snapshot — read at the exact moment a
  // generation call is kicked off so currentLoadout is never stale (Task 2).
  getCurrentLoadout: () => [Ability, Ability];
  onApplyPick: (picked: Ability) => void;
  isAlive: () => boolean;
  // Bot lane's pick-decision function (botController.decideBotAbilityPick).
  // Omitted for the human lane, which picks via PickOverlay input instead.
  autoPickForBot?: (options: [Ability, Ability]) => 0 | 1;
}

export interface UseLaneTimerResult extends LaneTimerState {
  pick: (index: 0 | 1) => void;
}

function createInitialState(waveNumber: number): LaneTimerState {
  return {
    phase: "COMBAT",
    waveNumber,
    combatTimeRemaining: COMBAT_DURATION_SECONDS,
    pickTimeRemaining: PICK_DURATION_SECONDS,
    pendingOptions: null,
    isGenerationReady: false,
  };
}

// Task 1 — drives one lane's independent wave/pick timer. Each call to this
// hook (one per LaneView instance) owns its own state, refs, and interval;
// nothing here is shared between the human and bot lanes.
export function useLaneTimer(opts: UseLaneTimerOptions): UseLaneTimerResult {
  const { laneType, initialWaveNumber = 1, getCurrentLoadout, onApplyPick, isAlive, autoPickForBot } = opts;

  const [state, setState] = useState<LaneTimerState>(() => createInitialState(initialWaveNumber));
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Guards against a resolving generation call from an earlier request
  // overwriting a later one, and against React 18 StrictMode's dev-only
  // double-invoke of the "kick off the very first generation" effect below.
  const generationTokenRef = useRef(0);
  const hasKickedFirstGeneration = useRef(false);

  const applyGeneratedOptions = useCallback((token: number, options: [Ability, Ability]) => {
    if (token !== generationTokenRef.current || !isAlive()) return;
    setState((prev) => {
      const next: LaneTimerState = { ...prev, pendingOptions: options, isGenerationReady: true };
      // Spec 1.3 — the moment a paused generation resolves, go straight to PICKING.
      if (prev.phase === "PAUSED_GENERATING") {
        next.phase = "PICKING";
        next.pickTimeRemaining = PICK_DURATION_SECONDS;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kickGeneration = useCallback(
    (forWaveNumber: number) => {
      const token = ++generationTokenRef.current;
      const loadout = getCurrentLoadout();

      // Task 2 — verify laneType is actually distinct per lane at the call
      // site; getStatRangesForWave's bot-lane bias multiplier depends on
      // this being correct, and it's easy to silently hardcode "human" for
      // both lanes by accident. Logging the resolved ranges alongside makes
      // the bias directly visible in the console.
      console.log(
        `[useLaneTimer] requesting ${laneType} lane abilities for wave ${forWaveNumber}`,
        "stat ranges:",
        getStatRangesForWave(forWaveNumber, laneType),
      );

      generateTwoAbilityOptions(forWaveNumber, laneType, loadout)
        .then((options) => applyGeneratedOptions(token, options))
        .catch((err) => {
          // Task 2 — mocks stay as a fallback, not the default path. This
          // is the one place they're still used: keep the lane unstuck if
          // the real call fails, without silently pretending it succeeded.
          console.error(
            `[useLaneTimer] generateTwoAbilityOptions failed for ${laneType} wave ${forWaveNumber}, falling back to mock options:`,
            err,
          );
          applyGeneratedOptions(token, createMockAbilityPair());
        });
    },
    [laneType, getCurrentLoadout, applyGeneratedOptions],
  );

  // Spec 1.2 step 1 — the very first wave has no pendingOptions yet, so
  // generation is kicked off immediately instead of waiting for a
  // TRANSITIONING cycle (which is what kicks off every subsequent wave's
  // generation, from resolvePick below).
  useEffect(() => {
    if (hasKickedFirstGeneration.current) return;
    hasKickedFirstGeneration.current = true;
    kickGeneration(stateRef.current.waveNumber + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvePick = useCallback(
    (index: 0 | 1) => {
      const current = stateRef.current;
      if (!current.pendingOptions) return;
      const picked = current.pendingOptions[index];
      onApplyPick(picked);

      // Spec 1.2 step 4 (TRANSITIONING) — effectively instant: increment
      // wave, reset combat timer, kick off the next generation, land in
      // COMBAT. Folded into one synchronous update rather than rendering a
      // separate TRANSITIONING frame, since the spec describes it as a
      // single tick with no observable combat/pick behavior of its own.
      const nextWaveNumber = current.waveNumber + 1;
      setState({
        phase: "COMBAT",
        waveNumber: nextWaveNumber,
        combatTimeRemaining: COMBAT_DURATION_SECONDS,
        pickTimeRemaining: PICK_DURATION_SECONDS,
        pendingOptions: null,
        isGenerationReady: false,
      });
      kickGeneration(nextWaveNumber + 1);
    },
    [onApplyPick, kickGeneration],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isAlive()) return; // Task 1.4 — dead lanes freeze permanently, no ticking at all.
      const current = stateRef.current;

      if (current.phase === "COMBAT") {
        const remaining = current.combatTimeRemaining - 1;
        if (remaining > 0) {
          setState({ ...current, combatTimeRemaining: remaining });
          return;
        }
        if (current.isGenerationReady) {
          setState({
            ...current,
            combatTimeRemaining: 0,
            phase: "PICKING",
            pickTimeRemaining: PICK_DURATION_SECONDS,
          });
        } else {
          console.warn(
            `[useLaneTimer] ${laneType} lane wave ${current.waveNumber}: generation not ready when combat ended — pausing.`,
          );
          setState({ ...current, combatTimeRemaining: 0, phase: "PAUSED_GENERATING" });
        }
        return;
      }

      if (current.phase === "PICKING") {
        const remaining = current.pickTimeRemaining - 1;
        if (remaining > 0) {
          setState({ ...current, pickTimeRemaining: remaining });
          return;
        }
        // Spec 1.2 step 3 — timeout with no pick made auto-selects option 0.
        resolvePick(0);
        return;
      }

      // PAUSED_GENERATING has nothing to tick — waiting on kickGeneration's
      // .then()/.catch() to call applyGeneratedOptions. TRANSITIONING is
      // never actually stored as a persisted phase (see resolvePick above),
      // so it never reaches this branch.
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [laneType, isAlive, resolvePick]);

  const pick = useCallback(
    (index: 0 | 1) => {
      if (stateRef.current.phase !== "PICKING") return;
      resolvePick(index);
    },
    [resolvePick],
  );

  // Bot lane auto-decision — fires once per PICKING phase entry, entirely
  // independent of the human input handler (PickOverlay's keydown listener
  // isn't even mounted for the bot lane).
  const hasAutoPickedForPhaseRef = useRef(false);
  useEffect(() => {
    if (!autoPickForBot) return;
    if (state.phase !== "PICKING") {
      hasAutoPickedForPhaseRef.current = false;
      return;
    }
    if (hasAutoPickedForPhaseRef.current || !state.pendingOptions) return;
    hasAutoPickedForPhaseRef.current = true;

    let index: 0 | 1 = 0;
    try {
      index = autoPickForBot(state.pendingOptions);
    } catch (err) {
      // botController.decideBotAbilityPick is still a stub — this is
      // expected until that module is implemented, not a bug here.
      console.warn(
        "[useLaneTimer] autoPickForBot threw (botController.decideBotAbilityPick likely not implemented yet) — defaulting to option 0:",
        err,
      );
    }
    resolvePick(index);
  }, [state.phase, state.pendingOptions, autoPickForBot, resolvePick]);

  return { ...state, pick };
}
