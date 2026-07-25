import type { AbilityCategory, SpriteData } from "../game/types";

// Spec 6.3 — pre-generated fallback sprite library, tagged by category/type
// and rough power tier. Used when live sprite generation fails validation
// twice or times out, so the game never blocks on sprite generation.
// This is a lookup-table scaffold only — real entries get filled in during
// the hackathon, not here.

export type PowerTier = "low" | "mid" | "high";

export interface SpriteLibraryEntry {
  tag: AbilityCategory | "ZOMBIE";
  tier: PowerTier;
  sprite: SpriteData;
}

// TODO: populate with AI-authored sprites ahead of the event.
export const SPRITE_LIBRARY: SpriteLibraryEntry[] = [];

export function getFallbackSprite(
  tag: AbilityCategory | "ZOMBIE",
  tier: PowerTier,
): SpriteData | null {
  // TODO: look up a matching (or closest-tier) entry in SPRITE_LIBRARY.
  throw new Error("getFallbackSprite not implemented");
}
