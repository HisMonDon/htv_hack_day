import { useEffect, useRef } from "react";
import type { SpriteData } from "../game/types";
import { renderPixelArt } from "../game/renderPixelArt";

export interface SpriteCanvasProps {
  sprite: SpriteData;
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

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, sprite.width * scale, sprite.height * scale);
    renderPixelArt(ctx, sprite, scale);
  }, [sprite, scale]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={sprite.width * scale}
      height={sprite.height * scale}
      aria-hidden="true"
    />
  );
}
