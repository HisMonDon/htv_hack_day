import { useEffect, useRef } from "react";
import type { SpriteData } from "../game/types";
import { renderPixelArt } from "../game/renderPixelArt";

export interface SpriteCanvasProps {
  // Generated abilities do not yet guarantee a sprite. Missing art must be
  // cosmetic only, never a reason the pick UI can crash.
  sprite?: SpriteData | null;
  // Device pixels per sprite pixel. The canvas is sized sprite.width * scale,
  // so this also determines the element's CSS size.
  scale?: number;
  className?: string;
}

// Thin React wrapper around renderPixelArt for sprites that live in the DOM
// (ability cards, HUD chips) rather than inside a lane's arena canvas. Redraws
// only when the sprite or scale actually changes — this is not on the frame
// loop and must not become per-frame work.
export function SpriteCanvas({ sprite, scale = 3, className }: SpriteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = sprite?.width ?? 8;
  const height = sprite?.height ?? 8;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width * scale, height * scale);
    if (!sprite) {
      // Neutral pixel fallback: a small diamond/cross that works for every
      // category until a generated/curated sprite is attached.
      ctx.fillStyle = "#9a9488";
      ctx.fillRect(3 * scale, 1 * scale, 2 * scale, 6 * scale);
      ctx.fillRect(1 * scale, 3 * scale, 6 * scale, 2 * scale);
      return;
    }
    renderPixelArt(ctx, sprite, scale);
  }, [sprite, scale, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={width * scale}
      height={height * scale}
      aria-hidden="true"
    />
  );
}
