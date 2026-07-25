import type { AbilityCategory, SpriteData } from "../game/types";
import { SPRITE_SIZE } from "../game/spriteValidation";

// Spec 6.3 — pre-generated fallback sprite library, tagged by category/type
// and rough power tier. Used when live sprite generation fails validation or
// times out, so the game never blocks on sprite generation.
//
// Shapes are authored as 16-row strings: "0" is transparent, "1" is the void
// outline, "2" the body, "3" the bright edge. Palette is resolved per tier so
// one silhouette covers all three power levels without triplicating grids —
// escalation reads through heat (scrap grey -> burnt amber -> danger red),
// which is also how the HUD communicates threat elsewhere.

export type PowerTier = "low" | "mid" | "high";

export interface SpriteLibraryEntry {
  tag: AbilityCategory | "ZOMBIE";
  tier: PowerTier;
  sprite: SpriteData;
}

const TIER_PALETTES: Record<PowerTier, Record<string, string>> = {
  low: { "0": "transparent", "1": "#0b0b0e", "2": "#4a4d55", "3": "#9a9488" },
  mid: { "0": "transparent", "1": "#0b0b0e", "2": "#7a5230", "3": "#c4552b" },
  high: { "0": "transparent", "1": "#0b0b0e", "2": "#8a1f1f", "3": "#ff2e2e" },
};

// Zombies read as decayed rather than powered-up, so they keep a sickly green
// body across tiers and escalate only on the bright edge.
const ZOMBIE_PALETTES: Record<PowerTier, Record<string, string>> = {
  low: { "0": "transparent", "1": "#0b0b0e", "2": "#3f5136", "3": "#6b8e4e" },
  mid: { "0": "transparent", "1": "#0b0b0e", "2": "#4a5a2f", "3": "#8fae4b" },
  high: { "0": "transparent", "1": "#0b0b0e", "2": "#5a3f2f", "3": "#c4552b" },
};

// Angled cleaver — splintered edge, heavy hilt at the base.
const SHAPE_OFFENSE = [
  "0000000000000000",
  "0000000000011000",
  "0000000000122100",
  "0000000001223100",
  "0000000012231000",
  "0000000122310000",
  "0000001223100000",
  "0000012231000000",
  "0000122310000000",
  "0001223100000000",
  "0012231000000000",
  "0122310000000000",
  "1223100000000000",
  "1331000000000000",
  "1110000000000000",
  "0000000000000000",
];

// Swept chevron with trailing streaks — forward-leaning, asymmetric.
const SHAPE_MOBILITY = [
  "0000000000000000",
  "0000000000001100",
  "0000000000012310",
  "0000000000123310",
  "0000000001233100",
  "0000000012331000",
  "0011000123310000",
  "0123101233100000",
  "0012312331000000",
  "0001231233100000",
  "0000123123310000",
  "0000012312331000",
  "0000001231233100",
  "0000000123123310",
  "0000000012311100",
  "0000000001100000",
];

// Notched shield, cracked down the middle.
const SHAPE_DEFENSE = [
  "0000000000000000",
  "0001111111111000",
  "0012333113332100",
  "0123310110133210",
  "0123301100133210",
  "0123301100133210",
  "0123311011133210",
  "0123310110133210",
  "0123301100133210",
  "0012301100132100",
  "0012331011332100",
  "0001233113321000",
  "0000123333210000",
  "0000012332100000",
  "0000001221000000",
  "0000000110000000",
];

// Broken ring — a deliberately incomplete circular motif.
const SHAPE_UTILITY = [
  "0000011111000000",
  "0001233333210000",
  "0012331111332100",
  "0123310000133210",
  "0123100000013210",
  "1231000000001321",
  "1230000000000321",
  "1230000000000321",
  "1230000000000321",
  "1231000000000000",
  "0123100000000000",
  "0123310000133210",
  "0012331111332100",
  "0001233333210000",
  "0000011111000000",
  "0000000000000000",
];

// Hunched asymmetric figure — uneven shoulders, exposed teeth.
const SHAPE_ZOMBIE = [
  "0000000000000000",
  "0000011110000000",
  "0000123321000000",
  "0001233332100000",
  "0001233332100000",
  "0001231312100000",
  "0001233332100000",
  "0000132231000000",
  "0011233332110000",
  "0123233332321000",
  "1231233332312100",
  "0001233332100000",
  "0001231233100000",
  "0001210012310000",
  "0012100001231000",
  "0011000000110000",
];

function buildSprite(shape: string[], palette: Record<string, string>): SpriteData {
  const pixels: string[][] = [];

  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = shape[y] ?? "";
    const cells: string[] = [];
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const key = row[x];
      cells.push(key !== undefined && palette[key] !== undefined ? key : "0");
    }
    pixels.push(cells);
  }

  return { width: SPRITE_SIZE, height: SPRITE_SIZE, palette, pixels };
}

const SHAPES: Record<AbilityCategory | "ZOMBIE", string[]> = {
  OFFENSE: SHAPE_OFFENSE,
  MOBILITY: SHAPE_MOBILITY,
  DEFENSE: SHAPE_DEFENSE,
  UTILITY: SHAPE_UTILITY,
  ZOMBIE: SHAPE_ZOMBIE,
};

const TIERS: PowerTier[] = ["low", "mid", "high"];

export const SPRITE_LIBRARY: SpriteLibraryEntry[] = (
  Object.keys(SHAPES) as (AbilityCategory | "ZOMBIE")[]
).flatMap((tag) =>
  TIERS.map((tier) => ({
    tag,
    tier,
    sprite: buildSprite(SHAPES[tag], tag === "ZOMBIE" ? ZOMBIE_PALETTES[tier] : TIER_PALETTES[tier]),
  })),
);

// Falls back across tiers (never across tags) so an OFFENSE ability always
// gets an offense silhouette even if its exact tier is missing. Returns null
// only if the tag has no entries at all, which callers must still handle.
export function getFallbackSprite(
  tag: AbilityCategory | "ZOMBIE",
  tier: PowerTier,
): SpriteData | null {
  const forTag = SPRITE_LIBRARY.filter((entry) => entry.tag === tag);
  if (forTag.length === 0) return null;

  const exact = forTag.find((entry) => entry.tier === tier);
  if (exact) return exact.sprite;

  const byDistance = [...forTag].sort(
    (a, b) => Math.abs(TIERS.indexOf(a.tier) - TIERS.indexOf(tier)) -
      Math.abs(TIERS.indexOf(b.tier) - TIERS.indexOf(tier)),
  );
  return byDistance[0].sprite;
}

// Maps a wave number onto the library's three tiers so callers don't each
// invent their own thresholds.
export function tierForWave(waveNumber: number): PowerTier {
  if (waveNumber <= 3) return "low";
  if (waveNumber <= 8) return "mid";
  return "high";
}
