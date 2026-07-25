import "./ProjectSprite.css";

// A code-native pixel zombie. Keeping it in CSS avoids a network image and
// matches the game's pixel-art direction without requiring a generated asset.
const PIXELS = [
  "................", ".....gggg.....", "....gggggg....", "...gggggggg...",
  "...ggrgggrg...", "...gggggggg...", "...ggxggxgg...", "....gggggg....",
  ".....gddg.....", "....dddddd....", "...dddggddd...", "..dd.d..d.dd..",
  "..dd.d..d.dd..", ".....d..d.....", "....dd..dd....", "...dd....dd...",
];
const COLORS: Record<string, string> = { g: "#82bd61", d: "#4d6f4e", r: "#ff3d7f", x: "#e2d2a5" };

export function ProjectSprite() {
  return <div className="project-sprite" aria-label="Pixel zombie" role="img">{PIXELS.flatMap((row, y) => [...row].map((pixel, x) => pixel !== "." && <i key={`${x}-${y}`} style={{ left: `${x * 6.25}%`, top: `${y * 6.25}%`, backgroundColor: COLORS[pixel] }} />))}</div>;
}
