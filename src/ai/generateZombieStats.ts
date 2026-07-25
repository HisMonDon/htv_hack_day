import type { LaneType, ZombieStatBlock } from "../game/types";

// Spec 4 — generates one zombie stat block per wave per lane (not per
// zombie instance); every zombie spawned in that wave for that lane shares
// this stat block. Same clamping rule as abilities applies at the call site.
export async function generateZombieStats(
  waveNumber: number,
  laneType: LaneType,
): Promise<ZombieStatBlock> {
  // TODO: call geminiClient with the smaller zombie schema, validate the
  // response, and return it unclamped.
  throw new Error("generateZombieStats not implemented");
}
