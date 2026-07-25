import type { SpriteData } from "./types";

// Spec 6.2 — shared renderer for every sprite in the game (both lanes'
// abilities and zombies render through this same function; no per-lane
// rendering path). Draws to an actual <canvas>, not CSS/SVG/img.
//
// Assumes the sprite has already been through validateSprite() — palette keys
// resolve, rows are rectangular. Unknown keys are skipped rather than thrown
// on, so a sprite that somehow slips through validation renders with holes
// instead of taking down the frame loop.
export function renderPixelArt(
  canvasContext: CanvasRenderingContext2D,
  spriteJSON: SpriteData,
  scale: number,
  originX = 0,
  originY = 0,
): void {
  const { pixels, palette } = spriteJSON;

  canvasContext.imageSmoothingEnabled = false;

  // Batch by color: setting fillStyle is the expensive part, and a 16x16
  // sprite with a 5-color palette collapses 256 style assignments into 5.
  const cellsByColor = new Map<string, number[]>();

  for (let y = 0; y < pixels.length; y++) {
    const row = pixels[y];
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color || color === "transparent") continue;

      let cells = cellsByColor.get(color);
      if (!cells) {
        cells = [];
        cellsByColor.set(color, cells);
      }
      cells.push(x, y);
    }
  }

  for (const [color, cells] of cellsByColor) {
    canvasContext.fillStyle = color;
    for (let i = 0; i < cells.length; i += 2) {
      canvasContext.fillRect(
        Math.round(originX + cells[i] * scale),
        Math.round(originY + cells[i + 1] * scale),
        Math.ceil(scale),
        Math.ceil(scale),
      );
    }
  }
}
