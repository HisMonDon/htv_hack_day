// Task 4 — world-unit arena bounds. Deliberately NOT pixels: ability stats
// (range, areaOfEffect) are authored/clamped in small numbers like 3-8 (see
// statRanges.ts), so gameplay math (movement, resolveAbilityHit) stays in
// this same "world unit" space. CANVAS_SCALE is the only place unit->pixel
// conversion happens, inside the render loop.
export const ARENA_WIDTH = 20;
export const ARENA_HEIGHT = 15;
export const CANVAS_SCALE = 24; // 20*24=480, 15*24=360 — matches LaneView's <canvas> size

export const PLAYER_RADIUS = 0.5;
export const PLAYER_MOVE_SPEED = 6; // world units per second
export const PLAYER_START_X = ARENA_WIDTH / 2;
export const PLAYER_START_Y = ARENA_HEIGHT / 2;

export function clampToArena(
  x: number,
  y: number,
  radius: number = PLAYER_RADIUS,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, radius), ARENA_WIDTH - radius),
    y: Math.min(Math.max(y, radius), ARENA_HEIGHT - radius),
  };
}
