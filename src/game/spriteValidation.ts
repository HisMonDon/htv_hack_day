import type { SpriteData } from "./types";

// Spec 6.1 — the validate step of generate -> validate -> clamp -> fallback
// for pixel art. Same posture as clamp.ts is for numeric stats: the model's
// sprite output is untrusted input, and nothing reaches renderPixelArt until
// it has been proven rectangular, in-palette, and inside the size budget.

export const SPRITE_SIZE = 16;
const MAX_PALETTE_ENTRIES = 6;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// The raw shape Gemini is asked for. Rows arrive as strings ("0012210...")
// rather than nested arrays because one-dimensional arrays of short strings
// are markedly more reliable to get back well-formed than string[][], and it
// keeps the response small enough to generate every 15 seconds.
export interface RawSpriteResponse {
  palette?: { key?: unknown; color?: unknown }[];
  rows?: unknown;
}

export class SpriteValidationError extends Error {}

// Transparent is reserved for key "0" in code — the model is never asked to
// nominate it, so it can't accidentally make an entirely invisible sprite by
// marking every palette entry transparent.
const TRANSPARENT_KEY = "0";

function buildPalette(raw: RawSpriteResponse): Record<string, string> {
  const palette: Record<string, string> = { [TRANSPARENT_KEY]: "transparent" };

  if (!Array.isArray(raw.palette) || raw.palette.length === 0) {
    throw new SpriteValidationError("sprite palette missing or empty");
  }

  for (const entry of raw.palette.slice(0, MAX_PALETTE_ENTRIES)) {
    const key = typeof entry?.key === "string" ? entry.key.trim() : "";
    const color = typeof entry?.color === "string" ? entry.color.trim() : "";

    // Single-character keys only — rows are parsed per character, so a
    // multi-character key would silently corrupt every row that used it.
    if (key.length !== 1 || key === TRANSPARENT_KEY) continue;
    if (!HEX_COLOR.test(color)) continue;

    palette[key] = color.toLowerCase();
  }

  if (Object.keys(palette).length < 2) {
    throw new SpriteValidationError("sprite palette had no usable color entries");
  }

  return palette;
}

function buildPixels(raw: RawSpriteResponse, palette: Record<string, string>): string[][] {
  if (!Array.isArray(raw.rows)) {
    throw new SpriteValidationError("sprite rows missing");
  }

  const pixels: string[][] = [];

  for (let y = 0; y < SPRITE_SIZE; y++) {
    const rawRow = raw.rows[y];
    const rowText = typeof rawRow === "string" ? rawRow : "";
    const row: string[] = [];

    for (let x = 0; x < SPRITE_SIZE; x++) {
      const key = rowText[x];
      // Short rows, long rows, and unknown keys all normalize to transparent
      // rather than failing the whole sprite — a slightly cropped silhouette
      // still reads, and this is the most common way a model drifts.
      row.push(key !== undefined && palette[key] !== undefined ? key : TRANSPARENT_KEY);
    }

    pixels.push(row);
  }

  const filledCells = pixels.reduce(
    (total, row) => total + row.filter((key) => key !== TRANSPARENT_KEY).length,
    0,
  );
  // A sprite that is almost entirely empty is indistinguishable from a
  // failed generation, so treat it as one and let the caller fall back.
  if (filledCells < SPRITE_SIZE) {
    throw new SpriteValidationError(`sprite was effectively blank (${filledCells} filled cells)`);
  }

  return pixels;
}

// Throws SpriteValidationError on anything unusable. Callers are expected to
// catch and substitute a fallback sprite rather than propagate.
export function validateSprite(raw: RawSpriteResponse): SpriteData {
  const palette = buildPalette(raw);
  const pixels = buildPixels(raw, palette);

  return { width: SPRITE_SIZE, height: SPRITE_SIZE, palette, pixels };
}
