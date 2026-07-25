import type { SpriteData } from "../game/types";

// 8x8 mock sprite (a simple filled square with a border) — enough for
// renderPixelArt() and component development ahead of real generated/curated
// sprite content.
export function createMockSprite(overrides: Partial<SpriteData> = {}): SpriteData {
  const row = (): string[] => ["1", "1", "1", "1", "1", "1", "1", "1"];
  return {
    width: 8,
    height: 8,
    palette: {
      "0": "transparent",
      "1": "#3a9d23",
    },
    pixels: [row(), row(), row(), row(), row(), row(), row(), row()],
    ...overrides,
  };
}
