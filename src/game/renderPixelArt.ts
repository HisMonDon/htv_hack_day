import type { SpriteData } from "./types";

// Spec 6.2 — shared renderer for every sprite in the game (both lanes'
// abilities and zombies render through this same function; no per-lane
// rendering path). Draws to an actual <canvas>, not CSS/SVG/img.
export function renderPixelArt(
  canvasContext: CanvasRenderingContext2D,
  spriteJSON: SpriteData,
  scale: number,
): void {
  // TODO: iterate every cell in spriteJSON.pixels, look up the color in
  // spriteJSON.palette, skip drawing when the palette entry is
  // "transparent", otherwise fillRect a scale x scale px square at the
  // cell's (x * scale, y * scale) position.
  throw new Error("renderPixelArt not implemented");
}
