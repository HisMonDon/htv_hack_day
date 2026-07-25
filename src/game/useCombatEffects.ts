import { useCallback, useRef } from "react";
import type { Ability, AbilityCategory, Enemy, Position, SpriteData } from "./types";
import { CANVAS_SCALE } from "./arena";
import { renderPixelArt } from "./renderPixelArt";
import { categoryColorHex } from "../components/categoryColor";

// Combat visual effects — renders an ability's OWN sprite (if the ability
// carries spriteData) as its fired effect, layered with a proper particle
// system keyed off the ability's *flavor* (fire/ice/poison/lightning/
// explosion/heal/shield/dash), detected from its name/description/
// statusEffect text — plus a real gameplay stun (Enemy.stunnedUntil,
// consumed by game/useEnemies.ts) with a full-canvas white/frost flash
// whenever the ability's statusEffect says stun/freeze. No generator
// populates spriteData yet (see prior note), so the flavor+particle path is
// what actually renders today; the sprite path stays wired for when it does.
//
// Isolated here: usePlayerCombat.ts calls fireEffect() at its two existing
// activation sites and drawEffects()/getShakeOffset() in its render loop.
// No timer/phase state or botController.ts involved.

const BASE_SPRITE_PIXEL_SCALE = 3;
const MAX_AOE_SCALE = 2;

export type EffectFlavor =
  | "FIRE"
  | "ICE"
  | "POISON"
  | "LIGHTNING"
  | "EXPLOSION"
  | "EARTH"
  | "WATER"
  | "WIND"
  | "SONIC"
  | "SHADOW"
  | "HOLY"
  | "HEAL"
  | "SHIELD"
  | "GRAVITY"
  | "SMOKE"
  | "DASH"
  | "GENERIC_OFFENSE"
  | "GENERIC_MOBILITY"
  | "GENERIC_DEFENSE"
  | "GENERIC_UTILITY";

// Flavors an ability's fired projectile-sprite (if any) is never allowed to
// "fly" for — these read better as an instant burst erupting from the
// caster toward the target than as one point lerping across the arena.
const FORCED_INSTANT_FLAVORS: EffectFlavor[] = [
  "FIRE",
  "LIGHTNING",
  "HEAL",
  "SHIELD",
  "DASH",
  "WIND",
  "SHADOW",
  "HOLY",
  "GRAVITY",
  "SMOKE",
];

// Ordered, first-match-wins keyword groups. Order matters where a name could
// match more than one (e.g. "Toxic Grenade" hits both poison and explosion
// keywords) — earlier groups win, tuned by hand against data/mockAbilities.ts.
// This is also the library that the per-lane "no two equipped abilities
// share a feature" rule (below) draws its alternates from.
const FLAVOR_KEYWORDS: [EffectFlavor, string[]][] = [
  ["ICE", ["ice", "frost", "freeze", "chill", "glacial"]],
  ["POISON", ["poison", "toxic", "venom", "plague", "acid"]],
  ["FIRE", ["flame", "fire", "burn", "torch", "inferno", "ember", "scorch", "molten", "lava", "flare"]],
  ["LIGHTNING", ["lightning", "thunder", "electric", "volt", "spark", "plasma", "laser", "energy", "photon", "shock"]],
  ["EXPLOSION", ["explo", "bomb", "grenade", "blast", "nuke", "meteor", "rocket"]],
  ["EARTH", ["rock", "earth", "stone", "boulder", "quake", "crush", "rubble"]],
  ["WATER", ["water", "splash", "wave", "tide", "aqua", "hydro", "flood"]],
  ["WIND", ["wind", "gust", "tornado", "cyclone", "gale", "swirl"]],
  ["SONIC", ["sonic", "scream", "screech", "shatter", "sound", "shriek"]],
  ["SHADOW", ["shadow", "dark", "void", "curse", "nightmare", "wraith"]],
  ["HOLY", ["holy", "divine", "radiant", "blessed", "sacred", "angel"]],
  ["HEAL", ["heal", "regen", "mend", "restore"]],
  ["SHIELD", ["shield", "barrier", "ward", "aegis", "armor", "fortress"]],
  ["GRAVITY", ["gravity", "pull", "vortex", "singularity", "magnet"]],
  ["SMOKE", ["smoke", "fog", "gas", "mist"]],
  ["DASH", ["dash", "blink", "teleport", "sprint", "leap", "roll", "slide", "speed"]],
];

function determineFlavor(ability: Ability): EffectFlavor {
  const haystack = `${ability.name} ${ability.description} ${ability.movementBehavior ?? ""}`.toLowerCase();
  for (const [flavor, keywords] of FLAVOR_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return flavor;
  }
  switch (ability.category) {
    case "OFFENSE":
      return "GENERIC_OFFENSE";
    case "MOBILITY":
      return "GENERIC_MOBILITY";
    case "DEFENSE":
      return "GENERIC_DEFENSE";
    case "UTILITY":
      return "GENERIC_UTILITY";
  }
}

// Every flavor, in the same order used to build the collision-fallback
// rotation just below.
const ALL_FLAVORS: EffectFlavor[] = [
  ...FLAVOR_KEYWORDS.map(([flavor]) => flavor),
  "GENERIC_OFFENSE",
  "GENERIC_MOBILITY",
  "GENERIC_DEFENSE",
  "GENERIC_UTILITY",
];

// Fixed rotation (each flavor -> the next one in ALL_FLAVORS) used only to
// break a same-lane collision: if both equipped abilities' natural flavors
// match, the second slot takes its rotation partner instead so the two
// abilities in one lane's loadout never render the same feature.
const ALT_FLAVOR: Record<EffectFlavor, EffectFlavor> = Object.fromEntries(
  ALL_FLAVORS.map((flavor, index) => [flavor, ALL_FLAVORS[(index + 1) % ALL_FLAVORS.length]]),
) as Record<EffectFlavor, EffectFlavor>;

interface StunKind {
  flashColor: string;
  durationMs: number;
}

// Orthogonal to flavor: any ability whose generated statusEffect reads as a
// stun/freeze gets an actual gameplay pause (Enemy.stunnedUntil) plus a
// full-canvas flash, regardless of what it looks like otherwise.
function stunKindFor(ability: Ability): StunKind | null {
  const type = (ability.statusEffect.type ?? "").toLowerCase();
  const isStun = ["stun", "daze", "stagger"].some((k) => type.includes(k));
  const isFreeze = ["freeze", "frost", "chill"].some((k) => type.includes(k));
  if (!isStun && !isFreeze) return null;

  const rawSeconds = ability.statusEffect.durationSeconds ?? 1.2;
  const durationMs = Math.min(3000, Math.max(600, rawSeconds * 1000));
  return { flashColor: isFreeze ? "#dff6ff" : "#ffffff", durationMs };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  born: number;
  lifeMs: number;
  gravity: number;
  shape: "circle" | "shard";
}

interface Bolt {
  points: Position[];
  color: string;
  born: number;
  lifeMs: number;
}

interface ScreenFlash {
  color: string;
  born: number;
  lifeMs: number;
  peakAlpha: number;
}

interface Shake {
  born: number;
  lifeMs: number;
  magnitudePx: number;
}

interface FiredEffect {
  ability: Ability;
  flavor: EffectFlavor;
  source: Position; // world units
  impact: Position | null; // world units; null => no travel, render at source
  startedAt: number; // performance.now() ms
  durationMs: number;
  isProjectile: boolean;
  stunRingColor: string | null;
}

// Guarantees the two abilities in one lane's loadout never share a feature:
// each keeps its natural (keyword-detected) flavor unless they collide, in
// which case the second slot is bumped to its ALT_FLAVOR rotation partner.
function computeDistinctFlavors(equipped: readonly [Ability, Ability]): [EffectFlavor, EffectFlavor] {
  const first = determineFlavor(equipped[0]);
  const secondNatural = determineFlavor(equipped[1]);
  const second = secondNatural === first ? ALT_FLAVOR[first] : secondNatural;
  return [first, second];
}

export interface UseCombatEffectsResult {
  // Called at an ability's activation site (J/K press or bot auto-fire) with
  // the current live enemy list, used to pick a cosmetic impact point and,
  // for stun/freeze abilities, to actually pause enemies — never touches hp.
  fireEffect: (ability: Ability, source: Position, enemies: Enemy[], facing?: Position) => void;
  drawEffects: (ctx: CanvasRenderingContext2D, now: number) => void;
  // Additive camera shake, applied by the caller's render loop around the
  // whole scene (not just the effects layer) via ctx.translate.
  getShakeOffset: (now: number) => Position;
  // Minimal local flag for anything in combat rendering that wants to know
  // "is an effect currently playing" without reaching into timer state.
  hasActiveEffects: () => boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: Position, b: Position, t: number): Position {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function toPx(pos: Position): Position {
  return { x: pos.x * CANVAS_SCALE, y: pos.y * CANVAS_SCALE };
}

function findCosmeticImpact(enemies: Enemy[], source: Position, range: number): Position | null {
  let nearest: Enemy | null = null;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const distance = Math.hypot(enemy.x - source.x, enemy.y - source.y);
    if (distance <= range && distance < nearestDistance) {
      nearest = enemy;
      nearestDistance = distance;
    }
  }
  return nearest ? { x: nearest.x, y: nearest.y } : null;
}

function hasValidSpriteData(spriteData: SpriteData | null | undefined): spriteData is SpriteData {
  return (
    !!spriteData &&
    spriteData.width > 0 &&
    spriteData.height > 0 &&
    Array.isArray(spriteData.pixels) &&
    spriteData.pixels.length > 0 &&
    !!spriteData.palette
  );
}

function aoeScaleFor(ability: Ability): number {
  if (ability.areaOfEffect == null || ability.areaOfEffect <= 0) return 1;
  return Math.min(MAX_AOE_SCALE, 1 + ability.areaOfEffect / 6);
}

interface BurstOptions {
  count: number;
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  lifeMinMs: number;
  lifeMaxMs: number;
  colors: string[];
  gravity?: number;
  coneCenterAngle?: number;
  coneSpreadRadians?: number;
  shape?: Particle["shape"];
}

function spawnBurst(origin: Position, now: number, opts: BurstOptions): Particle[] {
  const spread = opts.coneSpreadRadians ?? Math.PI * 2;
  const center = opts.coneCenterAngle ?? Math.random() * Math.PI * 2;
  const particles: Particle[] = [];
  for (let i = 0; i < opts.count; i += 1) {
    const angle = center + (Math.random() - 0.5) * spread;
    const speed = opts.speedMin + Math.random() * (opts.speedMax - opts.speedMin);
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: opts.sizeMin + Math.random() * (opts.sizeMax - opts.sizeMin),
      color: opts.colors[Math.floor(Math.random() * opts.colors.length)],
      born: now,
      lifeMs: opts.lifeMinMs + Math.random() * (opts.lifeMaxMs - opts.lifeMinMs),
      gravity: opts.gravity ?? 0,
      shape: opts.shape ?? "circle",
    });
  }
  return particles;
}

function spawnBolt(source: Position, target: Position, color: string, now: number): Bolt {
  const segments = 6;
  const points: Position[] = [source];
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const jitter = (Math.random() - 0.5) * length * 0.18;
    points.push({
      x: source.x + dx * t + nx * jitter,
      y: source.y + dy * t + ny * jitter,
    });
  }
  points.push(target);
  return { points, color, born: now, lifeMs: 180 };
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], now: number): void {
  for (const particle of particles) {
    const age = now - particle.born;
    if (age > particle.lifeMs) continue;
    const seconds = age / 1000;
    const x = particle.x + particle.vx * seconds;
    const y = particle.y + particle.vy * seconds + 0.5 * particle.gravity * seconds * seconds;
    const lifeT = age / particle.lifeMs;
    const alpha = 1 - lifeT;
    const size = Math.max(0.5, particle.size * (1 - lifeT * 0.6));

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = particle.color;
    if (particle.shape === "shard") {
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(particle.vy, particle.vx));
      ctx.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBolts(ctx: CanvasRenderingContext2D, bolts: Bolt[], now: number): void {
  for (const bolt of bolts) {
    const age = now - bolt.born;
    if (age > bolt.lifeMs) continue;
    const alpha = 1 - age / bolt.lifeMs;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = bolt.color;
    ctx.shadowColor = bolt.color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    bolt.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }
}

function drawShockRing(
  ctx: CanvasRenderingContext2D,
  centerPx: Position,
  t: number,
  aoe: number,
  color: string,
): void {
  const radius = (14 + 40 * t) * aoe;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t) * 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  spriteData: SpriteData,
  centerPx: Position,
  scale: number,
  alpha: number,
): void {
  const widthPx = spriteData.width * scale;
  const heightPx = spriteData.height * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(centerPx.x - widthPx / 2, centerPx.y - heightPx / 2);
  renderPixelArt(ctx, spriteData, scale);
  ctx.restore();
}

function drawFlavorShape(
  ctx: CanvasRenderingContext2D,
  category: AbilityCategory,
  flavor: EffectFlavor,
  centerPx: Position,
  direction: Position | null,
  aoe: number,
  t: number,
  alpha: number,
): void {
  const color = categoryColorHex(category);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  switch (flavor) {
    case "ICE": {
      const radius = (10 + 10 * t) * aoe;
      ctx.strokeStyle = "#bdeeff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "POISON": {
      const radius = (12 + 8 * t) * aoe;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = "#4caf50";
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "EXPLOSION": {
      const radius = (16 + 60 * t) * aoe;
      ctx.strokeStyle = "#ffb347";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "HEAL": {
      const radius = (12 + 6 * Math.sin(t * Math.PI)) * aoe;
      ctx.strokeStyle = "#baffc9";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "SHIELD": {
      const radius = 16 * aoe;
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, t * Math.PI * 0.3, Math.PI * 2 + t * Math.PI * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius * 0.7, -t * Math.PI * 0.4, Math.PI * 2 - t * Math.PI * 0.4);
      ctx.stroke();
      break;
    }
    case "GENERIC_OFFENSE": {
      const length = 20 * aoe;
      const angle = direction ? Math.atan2(direction.y, direction.x) : -Math.PI / 4;
      ctx.translate(centerPx.x, centerPx.y);
      ctx.rotate(angle);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-length / 2, 0);
      ctx.lineTo(length / 2, 0);
      ctx.stroke();
      break;
    }
    case "GENERIC_UTILITY": {
      const radius = (10 + 14 * t) * aoe;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "GENERIC_DEFENSE": {
      const radius = 15 * aoe;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "GENERIC_MOBILITY": {
      const angle = direction ? Math.atan2(direction.y, direction.x) : 0;
      const length = 16 * aoe;
      ctx.translate(centerPx.x, centerPx.y);
      ctx.rotate(angle);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        ctx.globalAlpha = alpha * (1 - i * 0.3);
        ctx.beginPath();
        ctx.moveTo(-length / 2 - i * 6, 0);
        ctx.lineTo(length / 2 - i * 6, 0);
        ctx.stroke();
      }
      break;
    }
    case "EARTH": {
      const length = (14 + 10 * t) * aoe;
      ctx.strokeStyle = "#8a6d4b";
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i += 1) {
        const crackAngle = (Math.PI / 2) * i + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(centerPx.x, centerPx.y);
        ctx.lineTo(centerPx.x + Math.cos(crackAngle) * length, centerPx.y + Math.sin(crackAngle) * length);
        ctx.stroke();
      }
      break;
    }
    case "WATER": {
      const radius = (10 + 20 * t) * aoe;
      ctx.strokeStyle = "#7fd3f4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "GRAVITY": {
      const radius = (18 - 14 * t) * aoe;
      ctx.strokeStyle = "#b39ddb";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, Math.max(1, radius), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "SONIC": {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i += 1) {
        const radius = (10 + 30 * t + i * 14) * aoe;
        ctx.globalAlpha = alpha * (1 - i * 0.4);
        ctx.beginPath();
        ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "FIRE":
    case "LIGHTNING":
    case "DASH":
    case "WIND":
    case "SHADOW":
    case "HOLY":
    case "SMOKE":
      // Carried entirely by particles/bolts spawned at fire time — no extra shape.
      break;
  }

  ctx.restore();
}

export function useCombatEffects(): UseCombatEffectsResult {
  const effectsRef = useRef<FiredEffect[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const boltsRef = useRef<Bolt[]>([]);
  const flashesRef = useRef<ScreenFlash[]>([]);
  const shakeRef = useRef<Shake | null>(null);

  const fireEffect = useCallback(
    (ability: Ability, source: Position, enemies: Enemy[], facing?: Position) => {
      const now = performance.now();
      const flavor = determineFlavor(ability);
      const aoe = aoeScaleFor(ability);
      const impact = ability.targeting === "self" ? null : findCosmeticImpact(enemies, source, ability.range);
      const aimPoint =
        impact ?? (facing && (facing.x !== 0 || facing.y !== 0) ? { x: source.x + facing.x * 2, y: source.y + facing.y * 2 } : source);

      const sourcePx = toPx(source);
      const aimPx = toPx(aimPoint);
      const angle =
        aimPx.x !== sourcePx.x || aimPx.y !== sourcePx.y
          ? Math.atan2(aimPx.y - sourcePx.y, aimPx.x - sourcePx.x)
          : undefined;

      switch (flavor) {
        case "FIRE":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: Math.round(30 * aoe),
              speedMin: 140,
              speedMax: 320,
              sizeMin: 3,
              sizeMax: 6,
              lifeMinMs: 300,
              lifeMaxMs: 600,
              colors: ["#ff6a00", "#ff9d00", "#ffd23f", "#ff3d00"],
              gravity: -60,
              coneCenterAngle: angle,
              coneSpreadRadians: 0.7,
            }),
          );
          break;
        case "ICE":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: Math.round(16 * aoe),
              speedMin: 100,
              speedMax: 240,
              sizeMin: 2.5,
              sizeMax: 5,
              lifeMinMs: 400,
              lifeMaxMs: 700,
              colors: ["#bdeeff", "#7fd8ff", "#e8fbff"],
              gravity: 90,
              coneCenterAngle: angle,
              coneSpreadRadians: angle === undefined ? Math.PI * 2 : 1.4,
              shape: "shard",
            }),
          );
          break;
        case "POISON":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: Math.round(14 * aoe),
              speedMin: 20,
              speedMax: 70,
              sizeMin: 4,
              sizeMax: 8,
              lifeMinMs: 600,
              lifeMaxMs: 900,
              colors: ["#7ee081", "#3f9142", "#245c2b"],
              gravity: -35,
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "LIGHTNING":
          boltsRef.current.push(spawnBolt(sourcePx, aimPx, "#aef1ff", now));
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: 10,
              speedMin: 60,
              speedMax: 160,
              sizeMin: 2,
              sizeMax: 4,
              lifeMinMs: 150,
              lifeMaxMs: 260,
              colors: ["#ffffff", "#aef1ff"],
            }),
          );
          break;
        case "EXPLOSION":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: Math.round(40 * aoe),
              speedMin: 180,
              speedMax: 420,
              sizeMin: 3,
              sizeMax: 8,
              lifeMinMs: 300,
              lifeMaxMs: 550,
              colors: ["#ffb347", "#ff5e3a", "#ffe066", "#fff2cc"],
              gravity: 140,
            }),
          );
          shakeRef.current = { born: now, lifeMs: 260, magnitudePx: 6 * aoe };
          flashesRef.current.push({ color: "#ffd9a0", born: now, lifeMs: 180, peakAlpha: 0.22 });
          break;
        case "EARTH":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: Math.round(20 * aoe),
              speedMin: 80,
              speedMax: 220,
              sizeMin: 3,
              sizeMax: 7,
              lifeMinMs: 350,
              lifeMaxMs: 600,
              colors: ["#8a6d4b", "#6b5636", "#a68a5f"],
              gravity: 260,
              coneCenterAngle: angle,
              coneSpreadRadians: angle === undefined ? Math.PI * 2 : 1.2,
            }),
          );
          break;
        case "WATER":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: Math.round(18 * aoe),
              speedMin: 90,
              speedMax: 230,
              sizeMin: 2.5,
              sizeMax: 5,
              lifeMinMs: 350,
              lifeMaxMs: 550,
              colors: ["#4fb0e0", "#8fd3f4", "#1c6fa0"],
              gravity: 200,
              coneCenterAngle: angle,
              coneSpreadRadians: angle === undefined ? Math.PI * 2 : 1.1,
            }),
          );
          break;
        case "WIND":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: Math.round(22 * aoe),
              speedMin: 120,
              speedMax: 260,
              sizeMin: 2,
              sizeMax: 4,
              lifeMinMs: 250,
              lifeMaxMs: 450,
              colors: ["#eef6f2", "#cfe8de", "#a9d8c8"],
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "SONIC":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: Math.round(16 * aoe),
              speedMin: 200,
              speedMax: 380,
              sizeMin: 2,
              sizeMax: 3,
              lifeMinMs: 200,
              lifeMaxMs: 320,
              colors: ["#ffffff", "#dfe7ee"],
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "SHADOW":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: Math.round(18 * aoe),
              speedMin: 30,
              speedMax: 100,
              sizeMin: 3,
              sizeMax: 6,
              lifeMinMs: 350,
              lifeMaxMs: 550,
              colors: ["#3a1f4d", "#1a0f26", "#6b3fa0"],
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "HOLY":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: Math.round(20 * aoe),
              speedMin: 40,
              speedMax: 140,
              sizeMin: 2,
              sizeMax: 5,
              lifeMinMs: 350,
              lifeMaxMs: 600,
              colors: ["#fff4c2", "#ffe98a", "#ffffff"],
              gravity: -50,
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "GRAVITY": {
          // Converges inward (unlike every other burst): particles start on a
          // ring around the impact point and fly toward its center.
          const gravityColors = ["#7a5bd6", "#2a1a4d", "#b39ddb"];
          const count = Math.round(18 * aoe);
          const converging: Particle[] = [];
          for (let i = 0; i < count; i += 1) {
            const ringAngle = Math.random() * Math.PI * 2;
            const startRadius = 40 + Math.random() * 60;
            const speed = 80 + Math.random() * 160;
            converging.push({
              x: aimPx.x + Math.cos(ringAngle) * startRadius,
              y: aimPx.y + Math.sin(ringAngle) * startRadius,
              vx: -Math.cos(ringAngle) * speed,
              vy: -Math.sin(ringAngle) * speed,
              size: 2 + Math.random() * 3,
              color: gravityColors[Math.floor(Math.random() * gravityColors.length)],
              born: now,
              lifeMs: 300 + Math.random() * 200,
              gravity: 0,
              shape: "circle",
            });
          }
          particlesRef.current.push(...converging);
          break;
        }
        case "SMOKE":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: Math.round(14 * aoe),
              speedMin: 15,
              speedMax: 50,
              sizeMin: 5,
              sizeMax: 10,
              lifeMinMs: 600,
              lifeMaxMs: 950,
              colors: ["#8a8a8a", "#5c5c5c", "#b0b0b0"],
              gravity: -20,
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "HEAL":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: 16,
              speedMin: 20,
              speedMax: 60,
              sizeMin: 3,
              sizeMax: 5,
              lifeMinMs: 700,
              lifeMaxMs: 1000,
              colors: ["#baffc9", "#e9fff0", "#7be495"],
              gravity: -70,
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "SHIELD":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: 8,
              speedMin: 10,
              speedMax: 40,
              sizeMin: 2,
              sizeMax: 4,
              lifeMinMs: 500,
              lifeMaxMs: 700,
              colors: [categoryColorHex(ability.category), "#ffffff"],
              coneSpreadRadians: Math.PI * 2,
            }),
          );
          break;
        case "DASH":
          particlesRef.current.push(
            ...spawnBurst(sourcePx, now, {
              count: 12,
              speedMin: 60,
              speedMax: 180,
              sizeMin: 2,
              sizeMax: 4,
              lifeMinMs: 220,
              lifeMaxMs: 380,
              colors: [categoryColorHex(ability.category), "#ffffff"],
              coneCenterAngle: angle !== undefined ? angle + Math.PI : undefined,
              coneSpreadRadians: 0.6,
            }),
          );
          break;
        case "GENERIC_OFFENSE":
          particlesRef.current.push(
            ...spawnBurst(aimPx, now, {
              count: 10,
              speedMin: 60,
              speedMax: 160,
              sizeMin: 2,
              sizeMax: 4,
              lifeMinMs: 200,
              lifeMaxMs: 350,
              colors: [categoryColorHex(ability.category), "#ffffff"],
            }),
          );
          break;
        case "GENERIC_MOBILITY":
        case "GENERIC_DEFENSE":
        case "GENERIC_UTILITY":
          break;
      }

      const stunKind = stunKindFor(ability);
      if (stunKind) {
        for (const enemy of enemies) {
          if (enemy.alive) enemy.stunnedUntil = now + stunKind.durationMs;
        }
        flashesRef.current.push({ color: stunKind.flashColor, born: now, lifeMs: 550, peakAlpha: 0.92 });
      }

      const isProjectile = impact !== null && ability.projectileSpeed != null && !FORCED_INSTANT_FLAVORS.includes(flavor);
      const shapeDurationMs = isProjectile
        ? 220
        : flavor === "EXPLOSION"
          ? 500
          : flavor === "SHIELD"
            ? 650
            : flavor === "HEAL"
              ? 700
              : flavor === "POISON"
                ? 750
                : flavor === "ICE"
                  ? 450
                  : flavor === "SMOKE"
                    ? 800
                    : flavor === "GRAVITY"
                      ? 450
                      : flavor === "WATER" || flavor === "SONIC"
                        ? 380
                        : 320;

      effectsRef.current.push({
        ability,
        flavor,
        source,
        impact,
        startedAt: now,
        durationMs: shapeDurationMs,
        isProjectile,
        stunRingColor: stunKind ? stunKind.flashColor : null,
      });
    },
    [],
  );

  const drawEffects = useCallback((ctx: CanvasRenderingContext2D, now: number) => {
    if (particlesRef.current.length > 0) {
      particlesRef.current = particlesRef.current.filter((p) => now - p.born < p.lifeMs);
      drawParticles(ctx, particlesRef.current, now);
    }
    if (boltsRef.current.length > 0) {
      boltsRef.current = boltsRef.current.filter((b) => now - b.born < b.lifeMs);
      drawBolts(ctx, boltsRef.current, now);
    }

    if (effectsRef.current.length > 0) {
      effectsRef.current = effectsRef.current.filter((effect) => now - effect.startedAt < effect.durationMs);

      for (const effect of effectsRef.current) {
        const t = clamp01((now - effect.startedAt) / effect.durationMs);
        const worldPos =
          effect.isProjectile && effect.impact ? lerp(effect.source, effect.impact, t) : (effect.impact ?? effect.source);
        const centerPx = toPx(worldPos);
        const alpha = effect.isProjectile ? 1 : 1 - t;
        const aoe = aoeScaleFor(effect.ability);

        const target = effect.impact ?? effect.source;
        const direction =
          target.x !== effect.source.x || target.y !== effect.source.y
            ? { x: target.x - effect.source.x, y: target.y - effect.source.y }
            : null;

        if (hasValidSpriteData(effect.ability.spriteData)) {
          drawSprite(ctx, effect.ability.spriteData, centerPx, BASE_SPRITE_PIXEL_SCALE * aoe, alpha);
        } else {
          drawFlavorShape(ctx, effect.ability.category, effect.flavor, centerPx, direction, aoe, t, alpha);
        }

        if (effect.stunRingColor) {
          drawShockRing(ctx, toPx(effect.source), t, aoe, effect.stunRingColor);
        }
      }
    }

    if (flashesRef.current.length > 0) {
      flashesRef.current = flashesRef.current.filter((flash) => now - flash.born < flash.lifeMs);
      for (const flash of flashesRef.current) {
        const t = (now - flash.born) / flash.lifeMs;
        const alpha = flash.peakAlpha * (1 - t);
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = flash.color;
        ctx.fillRect(-20, -20, ctx.canvas.width + 40, ctx.canvas.height + 40);
        ctx.restore();
      }
    }
  }, []);

  const getShakeOffset = useCallback((now: number): Position => {
    const shake = shakeRef.current;
    if (!shake) return { x: 0, y: 0 };
    const age = now - shake.born;
    if (age > shake.lifeMs) {
      shakeRef.current = null;
      return { x: 0, y: 0 };
    }
    const magnitude = shake.magnitudePx * (1 - age / shake.lifeMs);
    return { x: (Math.random() * 2 - 1) * magnitude, y: (Math.random() * 2 - 1) * magnitude };
  }, []);

  const hasActiveEffects = useCallback(
    () =>
      effectsRef.current.length > 0 ||
      particlesRef.current.length > 0 ||
      boltsRef.current.length > 0 ||
      flashesRef.current.length > 0,
    [],
  );

  return { fireEffect, drawEffects, getShakeOffset, hasActiveEffects };
}
