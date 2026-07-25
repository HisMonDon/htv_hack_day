import { useCallback, useRef, useState } from "react";
import type { Ability, LaneType } from "./types";
import { getStatRangesForWave } from "./statRanges";
import { generateTwoAbilityOptions } from "../ai/generateTwoAbilityOptions";
import { createMockAbilityPair } from "../data/mockAbilities";
import type { LaneAdapter } from "./useMatchClock";

export interface UseLaneGenerationOptions {
  laneType: LaneType;
  // Always-fresh accessor, not a snapshot — read at the exact moment a
  // generation call is kicked off so currentLoadout is never stale (Task 2).
  getCurrentLoadout: () => [Ability, Ability];
  onApplyPick: (picked: Ability) => void;
  isAlive: () => boolean;
  // Bot lane's pick-decision function (botController.decideBotAbilityPick).
  // Omitted for the human lane, which picks via PickOverlay input instead.
  autoPickForBot?: (options: [Ability, Ability]) => 0 | 1;
  // useMatchClock.notifyGenerationReady — lets a match paused on this lane
  // resume the instant this lane's generation resolves.
  notifyGenerationReady: () => void;
}

export interface LaneGenerationState {
  pendingOptions: [Ability, Ability] | null;
  isGenerationReady: boolean;
  // True once this lane has committed a pick for the round currently in
  // PICKING — used purely for UI feedback (e.g. hiding the pick overlay);
  // the actual round advance is gated by the shared match clock, not this.
  hasCommittedPick: boolean;
}

export interface UseLaneGenerationResult extends LaneGenerationState {
  // Registered with useMatchClock so the shared clock can gate/advance
  // phases without knowing anything about how this lane generates or picks.
  adapter: LaneAdapter;
  // Human lane: called from PickOverlay's onPick. Bot lane: never called
  // directly — see maybeAutoPickForBot below.
  pick: (index: 0 | 1) => void;
  // LaneView calls this once per PICKING-phase entry for the bot lane, since
  // (unlike the old per-lane timer) entering PICKING is now a prop change
  // driven by the shared clock, not a local state transition this hook
  // observes on its own.
  maybeAutoPickForBot: () => void;
}

// Task 5 — per-lane ability generation and pick resolution, split out of the
// old useLaneTimer so it no longer owns any timing. What to generate
// (laneType, currentLoadout) and how a pick resolves (human keypress vs.
// decideBotAbilityPick) stay exactly as independent as before; only the
// phase/wave/timer clock moved out to useMatchClock (shared).
export function useLaneGeneration(opts: UseLaneGenerationOptions): UseLaneGenerationResult {
  const { laneType, getCurrentLoadout, onApplyPick, isAlive, autoPickForBot, notifyGenerationReady } = opts;

  const [state, setState] = useState<LaneGenerationState>({
    pendingOptions: null,
    isGenerationReady: false,
    hasCommittedPick: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Guards a resolving generation call from an earlier request overwriting a
  // later one (same purpose as in the original useLaneTimer).
  const generationTokenRef = useRef(0);

  const applyGeneratedOptions = useCallback(
    (token: number, options: [Ability, Ability]) => {
      if (token !== generationTokenRef.current || !isAlive()) return;
      setState((prev) => ({ ...prev, pendingOptions: options, isGenerationReady: true }));
      notifyGenerationReady();
    },
    [isAlive, notifyGenerationReady],
  );

  const kickGeneration = useCallback(
    (forWaveNumber: number) => {
      if (!isAlive()) return; // Section 4 — a dead lane never generates again.
      const token = ++generationTokenRef.current;
      const loadout = getCurrentLoadout();

      console.log(
        `[useLaneGeneration] requesting ${laneType} lane abilities for wave ${forWaveNumber}`,
        "stat ranges:",
        getStatRangesForWave(forWaveNumber, laneType),
      );

      generateTwoAbilityOptions(forWaveNumber, laneType, loadout)
        .then((options) => applyGeneratedOptions(token, options))
        .catch((err) => {
          console.error(
            `[useLaneGeneration] generateTwoAbilityOptions failed for ${laneType} wave ${forWaveNumber}, falling back to mock options:`,
            err,
          );
          applyGeneratedOptions(token, createMockAbilityPair());
        });
    },
    [laneType, getCurrentLoadout, applyGeneratedOptions, isAlive],
  );

  // Commits this lane's pick immediately (human keypress/click, or the bot's
  // decision) — updates the loadout right away. Does NOT advance the wave;
  // the shared match clock decides when the round actually turns over (see
  // finalizeRound below), per Section 5.
  const commitPick = useCallback(
    (index: 0 | 1) => {
      if (stateRef.current.hasCommittedPick) return;
      const options = stateRef.current.pendingOptions;
      if (!options) return;
      setState((prev) => ({ ...prev, hasCommittedPick: true }));
      onApplyPick(options[index]);
    },
    [onApplyPick],
  );

  const pick = useCallback((index: 0 | 1) => commitPick(index), [commitPick]);

  const maybeAutoPickForBot = useCallback(() => {
    if (!autoPickForBot) return;
    if (stateRef.current.hasCommittedPick) return;
    const options = stateRef.current.pendingOptions;
    if (!options) return;

    let index: 0 | 1 = 0;
    try {
      index = autoPickForBot(options);
    } catch (err) {
      // botController.decideBotAbilityPick throwing is treated the same way
      // it was under the old timer — default to option 0, don't get stuck.
      console.warn(
        "[useLaneGeneration] autoPickForBot threw — defaulting to option 0:",
        err,
      );
    }
    commitPick(index);
  }, [autoPickForBot, commitPick]);

  // Called by useMatchClock exactly once when the shared pick window closes
  // for this round.
  const finalizeRound = useCallback(
    (nextWaveNumber: number) => {
      if (!stateRef.current.hasCommittedPick) {
        // Spec 1.2 step 3 — timeout with no pick made auto-selects option 0.
        commitPick(0);
      }
      setState({ pendingOptions: null, isGenerationReady: false, hasCommittedPick: false });
      kickGeneration(nextWaveNumber + 1);
    },
    [commitPick, kickGeneration],
  );

  const adapter: LaneAdapter = {
    isAlive,
    isGenerationReady: () => stateRef.current.isGenerationReady,
    kickGeneration,
    finalizeRound,
  };

  return { ...state, adapter, pick, maybeAutoPickForBot };
}
