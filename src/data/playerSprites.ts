import type { SpriteData } from "../game/types";

// 16×16 player character sprites for the combat arena.  Designed to read
// clearly at 1.5× scale (24×24 rendered pixels) against the dark arena
// floor.  Palette keys follow the same convention as spriteLibrary.ts:
//   "0" = transparent
//   "1" = void outline (darkest)
//   "2" = shadow / secondary tone
//   "3" = body midtone
//   "4" = bright accent
//   "5" = highlight / visor

// ── Human Player: armored warrior / knight ──────────────────────────────
// Teal/cyan tones matching COLOR_HUMAN (#35e0c8).  Top-down facing-down
// pose: helmet, pauldrons, chestplate, legs.
export const HUMAN_PLAYER_SPRITE: SpriteData = {
  width: 16,
  height: 16,
  palette: {
    "0": "transparent",
    "1": "#0b0b0e",  // void outline
    "2": "#1a5c52",  // dark teal shadow
    "3": "#28a898",  // body midtone
    "4": "#35e0c8",  // bright accent (matches COLOR_HUMAN)
    "5": "#ede6d6",  // bone highlight / visor
  },
  pixels: [
    // Row 0  — empty top
    ["0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0"],
    // Row 1  — helmet crest
    ["0","0","0","0","0","0","1","1","1","1","0","0","0","0","0","0"],
    // Row 2  — helmet top
    ["0","0","0","0","0","1","3","4","4","3","1","0","0","0","0","0"],
    // Row 3  — helmet with visor
    ["0","0","0","0","1","3","4","5","5","4","3","1","0","0","0","0"],
    // Row 4  — helmet bottom / chin
    ["0","0","0","0","1","2","3","3","3","3","2","1","0","0","0","0"],
    // Row 5  — neck + pauldron tops
    ["0","0","0","1","1","2","1","2","2","1","2","1","1","0","0","0"],
    // Row 6  — pauldrons wide
    ["0","0","1","3","4","1","2","3","3","2","1","4","3","1","0","0"],
    // Row 7  — shoulders + chestplate top
    ["0","0","1","2","3","1","3","4","4","3","1","3","2","1","0","0"],
    // Row 8  — chestplate mid
    ["0","0","0","1","2","3","4","5","5","4","3","2","1","0","0","0"],
    // Row 9  — chestplate lower
    ["0","0","0","1","2","3","3","4","4","3","3","2","1","0","0","0"],
    // Row 10 — belt
    ["0","0","0","0","1","2","3","3","3","3","2","1","0","0","0","0"],
    // Row 11 — hip / waist
    ["0","0","0","0","1","2","2","3","3","2","2","1","0","0","0","0"],
    // Row 12 — upper legs
    ["0","0","0","1","2","3","1","0","0","1","3","2","1","0","0","0"],
    // Row 13 — lower legs
    ["0","0","0","1","2","3","1","0","0","1","3","2","1","0","0","0"],
    // Row 14 — boots
    ["0","0","1","2","3","2","1","0","0","1","2","3","2","1","0","0"],
    // Row 15 — empty bottom
    ["0","0","0","1","1","1","0","0","0","0","1","1","1","0","0","0"],
  ],
};

// ── Bot Player: robot / mech ────────────────────────────────────────────
// Pink/magenta tones matching COLOR_BOT (#ff3d7f).  Top-down facing-down
// pose: antenna, rectangular head, boxy torso, stumpy legs.
export const BOT_PLAYER_SPRITE: SpriteData = {
  width: 16,
  height: 16,
  palette: {
    "0": "transparent",
    "1": "#0b0b0e",  // void outline
    "2": "#7a1a3a",  // dark magenta shadow
    "3": "#cc2e65",  // body midtone
    "4": "#ff3d7f",  // bright accent (matches COLOR_BOT)
    "5": "#ede6d6",  // bone highlight / optic
  },
  pixels: [
    // Row 0  — antenna tip
    ["0","0","0","0","0","0","0","1","1","0","0","0","0","0","0","0"],
    // Row 1  — antenna stalk
    ["0","0","0","0","0","0","1","4","4","1","0","0","0","0","0","0"],
    // Row 2  — head top
    ["0","0","0","0","1","1","1","3","3","1","1","1","0","0","0","0"],
    // Row 3  — head with optics
    ["0","0","0","1","2","3","4","5","5","4","3","2","1","0","0","0"],
    // Row 4  — head bottom / jaw
    ["0","0","0","1","2","3","3","4","4","3","3","2","1","0","0","0"],
    // Row 5  — neck joint
    ["0","0","0","0","1","1","2","3","3","2","1","1","0","0","0","0"],
    // Row 6  — shoulder / torso top
    ["0","0","1","1","2","3","3","4","4","3","3","2","1","1","0","0"],
    // Row 7  — torso with vents
    ["0","1","2","3","4","1","5","1","1","5","1","4","3","2","1","0"],
    // Row 8  — torso core
    ["0","1","2","3","4","3","4","5","5","4","3","4","3","2","1","0"],
    // Row 9  — torso lower
    ["0","1","2","3","3","3","3","4","4","3","3","3","3","2","1","0"],
    // Row 10 — torso bottom
    ["0","0","1","1","2","3","3","3","3","3","3","2","1","1","0","0"],
    // Row 11 — hip joint
    ["0","0","0","1","2","2","3","3","3","3","2","2","1","0","0","0"],
    // Row 12 — upper legs
    ["0","0","1","2","3","2","1","0","0","1","2","3","2","1","0","0"],
    // Row 13 — lower legs
    ["0","0","1","2","4","2","1","0","0","1","2","4","2","1","0","0"],
    // Row 14 — feet / treads
    ["0","1","2","3","3","3","2","1","1","2","3","3","3","2","1","0"],
    // Row 15 — empty bottom
    ["0","0","1","1","1","1","1","0","0","1","1","1","1","1","0","0"],
  ],
};
