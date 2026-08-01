import type { Ability, LaneType } from "../game/types";
import { pickTwoCategories } from "../game/categories";
import { getStatRangesForWave } from "../game/statRanges";
import { clampAbilityToRange } from "../game/clamp";
import { generateAbility } from "./generateAbility";

// Free-tier Gemini quota is limited per-minute as well as per-day. Firing
// both ability calls concurrently (Promise.all) burns two requests in the
// same instant, which is the fastest way to trip the per-minute limit during
// dev. Sequencing them with a short gap trades a bit of latency for staying
// under that limit — remove this once on a paid tier with real headroom.
const CALL_SPACING_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Dev-only response cache — once a (wave, lane) pair has been generated
// successfully, reuse it on every subsequent call in this browser instead of
// re-hitting the API. This is what actually saves quota during iterative
// dev/testing; it is NOT loadout-aware, so don't rely on it once loadouts
// start meaningfully varying between playtests — clear localStorage
// ("chaos-roll:ability-options:*") when you want a fresh generation.
const CACHE_PREFIX = "chaos-roll:ability-options:";

function cacheKey(waveNumber: number, laneType: LaneType): string {
  return `${CACHE_PREFIX}${laneType}:wave${waveNumber}`;
}

function readCache(waveNumber: number, laneType: LaneType): [Ability, Ability] | null {
  if (!import.meta.env.DEV) return null;
  try {
    const raw = localStorage.getItem(cacheKey(waveNumber, laneType));
    return raw ? (JSON.parse(raw) as [Ability, Ability]) : null;
  } catch {
    return null;
  }
}

function writeCache(waveNumber: number, laneType: LaneType, options: [Ability, Ability]): void {
  if (!import.meta.env.DEV) return;
  try {
    localStorage.setItem(cacheKey(waveNumber, laneType), JSON.stringify(options));
  } catch {
    // Storage full or unavailable — not worth failing the call over.
  }
}

// Spec section 1, step 2 — generates the next 2 ability options for a lane's
// controller. This is the single entry point LaneView will call once the
// timer runtime (not yet implemented) needs a fresh pick pair in the
// background during combat.
export async function generateTwoAbilityOptions(
  waveNumber: number,
  laneType: LaneType,
  currentLoadout: Ability[],
): Promise<[Ability, Ability]> {
  const cached = readCache(waveNumber, laneType);
  if (cached) {
    console.log(`[generateTwoAbilityOptions] Requesting ability generation for ${laneType} wave ${waveNumber}`);
    return cached;
  }

  const [categoryA, categoryB] = pickTwoCategories();
  const ranges = getStatRangesForWave(waveNumber, laneType);

  const abilityA = await generateAbility(waveNumber, laneType, categoryA, currentLoadout);
  await delay(CALL_SPACING_MS);
  const abilityB = await generateAbility(waveNumber, laneType, categoryB, currentLoadout);

  const options: [Ability, Ability] = [
    clampAbilityToRange(abilityA, ranges),
    clampAbilityToRange(abilityB, ranges),
  ];

  writeCache(waveNumber, laneType, options);
  return options;
}
