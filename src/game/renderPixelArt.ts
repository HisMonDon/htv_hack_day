import type { SpriteData } from "./types";

// Spec 6.2 — shared renderer for every sprite in the game (both lanes'
// abilities and zombies render through this same function; no per-lane
// rendering path). Draws to an actual <canvas>, not CSS/SVG/img.
export function renderPixelArt(
  canvasContext: CanvasRenderingContext2D,
  spriteJSON: SpriteData,
  scale: number,
): void {
  for (let y = 0; y < spriteJSON.pixels.length; y += 1) {
    const row = spriteJSON.pixels[y];
    for (let x = 0; x < row.length; x += 1) {
      const color = spriteJSON.palette[row[x]];
      if (!color || color === "transparent") continue;
      canvasContext.fillStyle = color;
      canvasContext.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}
