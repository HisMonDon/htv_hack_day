import { useCallback, useRef } from "react";
import type { Ability, AbilityCategory, Enemy, Position } from "./types";
import { CANVAS_SCALE } from "./arena";

// Combat visual effects — a particle system keyed off the ability's *flavor*
// (a 20-entry library — fire, ice, poison, lightning, explosion, earth,
// water, wind, sonic, shadow, holy, heal, shield, gravity, smoke, dash, plus
// one generic-per-category fallback), detected from its name/description/
// statusEffect text — plus a real gameplay stun (Enemy.stunnedUntil,
// consumed by game/useEnemies.ts) with a full-canvas flash whenever the
// ability's statusEffect says stun/freeze.
//
// Every ability also gets its own color/size/speed/chaos "variant" derived
// from a deterministic hash of its name+description, so two abilities that
// land on the same flavor (or the same generic category fallback) still
// look distinct from each other rather than identical. Ability.sprite is
// the card's static icon (game/spriteValidation.ts owns its validity) —
// deliberately NOT reused here, this file's whole job is the fired-effect
// look, kept as its own render pass per the original design boundary.
//
// computeDistinctFlavors() additionally guarantees the two abilities
// equipped in one lane never render the same flavor in the same round,
// bumping a collision to its ALT_FLAVOR rotation partner.
//
// Isolated here: usePlayerCombat.ts calls fireEffect() at its two existing
// activation sites, trailColorFor()/spawnTrailPoint() once per frame while a
// dash/jump/teleport MovementAction is in flight, and drawEffects()/
// getShakeOffset() in its render loop. No timer/phase state or
// botController.ts involved.

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

// Flavors an ability's fired effect is never allowed to "fly" for — these
// read better as an instant burst erupting from the caster toward the
// target than as one point lerping across the arena.
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

// --- Per-ability color/size/speed/chaos variant ---------------------------
// Every flavor has a "family" hue so it still reads as fire/ice/etc, but each
// individual ability nudges that hue, its particle size, speed, and spread
// by a deterministic hash of its own name+description — so no two abilities
// (even same-flavor, even same-category-fallback ones) look identical, and
// re-firing the same ability always looks the same as itself.

interface ColorBase {
  hue: number;
  sat: number;
  lightRange: [number, number];
}

const CATEGORY_HUE: Record<AbilityCategory, number> = {
  OFFENSE: 14,
  MOBILITY: 193,
  DEFENSE: 96,
  UTILITY: 261,
};

const FLAVOR_COLOR_BASE: Partial<Record<EffectFlavor, ColorBase>> = {
  FIRE: { hue: 25, sat: 95, lightRange: [45, 68] },
  ICE: { hue: 195, sat: 75, lightRange: [72, 94] },
  POISON: { hue: 115, sat: 55, lightRange: [22, 52] },
  LIGHTNING: { hue: 195, sat: 90, lightRange: [65, 96] },
  EXPLOSION: { hue: 28, sat: 95, lightRange: [55, 78] },
  EARTH: { hue: 32, sat: 40, lightRange: [28, 52] },
  WATER: { hue: 200, sat: 70, lightRange: [45, 76] },
  WIND: { hue: 145, sat: 12, lightRange: [82, 97] },
  SONIC: { hue: 210, sat: 8, lightRange: [85, 99] },
  SHADOW: { hue: 272, sat: 55, lightRange: [14, 46] },
  HOLY: { hue: 48, sat: 85, lightRange: [70, 96] },
  HEAL: { hue: 140, sat: 60, lightRange: [70, 93] },
  GRAVITY: { hue: 266, sat: 55, lightRange: [20, 66] },
  SMOKE: { hue: 0, sat: 0, lightRange: [35, 72] },
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export interface AbilityVariant {
  hueOffset: number; // -20..20, nudges the flavor's family hue
  flashHue: number; // 0..359, full range — only stun/freeze flashes use this
  sizeScale: number; // 0.75x - 1.65x
  speedScale: number; // 0.75x - 1.55x
  distortion: number; // 0..1, widens spread / adds chaos
}

function abilityVariant(ability: Ability): AbilityVariant {
  const seed = hashString(`${ability.name}::${ability.description}`);
  return {
    hueOffset: (seed % 41) - 20,
    flashHue: (seed >>> 4) % 360,
    sizeScale: 0.75 + (((seed >>> 8) % 100) / 100) * 0.9,
    speedScale: 0.75 + (((seed >>> 14) % 100) / 100) * 0.8,
    distortion: ((seed >>> 20) % 100) / 100,
  };
}

function hsl(hue: number, sat: number, light: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  return `hsl(${normalizedHue.toFixed(0)}, ${sat}%, ${light}%)`;
}

function flavorColors(flavor: EffectFlavor, category: AbilityCategory, hueOffset: number, count: number): string[] {
  const base: ColorBase = FLAVOR_COLOR_BASE[flavor] ?? {
    hue: CATEGORY_HUE[category],
    sat: 70,
    lightRange: [45, 82],
  };
  const hue = base.hue + hueOffset;
  const colors: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const light = base.lightRange[0] + t * (base.lightRange[1] - base.lightRange[0]);
    colors.push(hsl(hue, base.sat, light));
  }
  return colors;
}

// Stun/freeze flashes deliberately ignore the flavor's family hue and use
// the ability's full-spectrum flashHue instead — every stun-y ability gets
// its own distinct flash color rather than the same white every time.
function flashColorFor(variant: AbilityVariant, isFreeze: boolean): string {
  return isFreeze ? hsl(180 + (variant.flashHue % 40), 70, 88) : hsl(variant.flashHue, 85, 72);
}

interface StunKind {
  flashColor: string;
  durationMs: number;
}

// Orthogonal to flavor: any ability whose generated statusEffect reads as a
// stun/freeze gets an actual gameplay pause (Enemy.stunnedUntil) plus a
// full-canvas flash, regardless of what it looks like otherwise.
function stunKindFor(ability: Ability, variant: AbilityVariant): StunKind | null {
  const type = (ability.statusEffect.type ?? "").toLowerCase();
  const isStun = ["stun", "daze", "stagger"].some((k) => type.includes(k));
  const isFreeze = ["freeze", "frost", "chill"].some((k) => type.includes(k));
  if (!isStun && !isFreeze) return null;

  const rawSeconds = ability.statusEffect.durationSeconds ?? 1.2;
  const durationMs = Math.min(3000, Math.max(600, rawSeconds * 1000));
  return { flashColor: flashColorFor(variant, isFreeze), durationMs };
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

// One sample of a mover's position, dropped every frame while a dash/jump/
// teleport MovementAction is in flight (see usePlayerCombat.ts's tick loop).
// Rendered as a fading trail of shrinking dots behind the mover — distinct
// from DASH's fire-and-forget particle burst, which plays once at activation
// and doesn't track the mover's actual path.
interface TrailPoint {
  x: number; // world units
  y: number;
  color: string;
  born: number;
  lifeMs: number;
}

const TRAIL_POINT_LIFE_MS = 260;
const TRAIL_MAX_RADIUS_PX = 9;

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
  primaryColor: string;
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
  // Color a movement trail should use for this ability, derived from the
  // same flavor/variant system fireEffect uses — kept separate so callers
  // driving a multi-frame dash/jump (usePlayerCombat.ts) can look it up once
  // and reuse it across every spawnTrailPoint() call for that movement.
  trailColorFor: (ability: Ability) => string;
  // Drops one fading trail sample at `position`, meant to be called once per
  // frame while a MovementAction (dash/jump/teleport) is in flight — the
  // caller supplies its own `now` so trail age lines up with its rAF clock.
  spawnTrailPoint: (position: Position, color: string, now: number) => void;
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

// Applies an ability's variant (size/speed/chaos) to a burst spec before
// spawning — the one place that scaling logic lives, so every flavor's case
// below just describes its "base" look and picks it up for free.
function variantBurst(origin: Position, now: number, opts: BurstOptions, variant: AbilityVariant): Particle[] {
  const baseSpread = opts.coneSpreadRadians ?? Math.PI * 2;
  return spawnBurst(origin, now, {
    ...opts,
    speedMin: opts.speedMin * variant.speedScale,
    speedMax: opts.speedMax * variant.speedScale,
    sizeMin: opts.sizeMin * variant.sizeScale,
    sizeMax: opts.sizeMax * variant.sizeScale,
    coneSpreadRadians: Math.min(Math.PI * 2, baseSpread * (1 + variant.distortion * 0.6)),
  });
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

function drawTrail(ctx: CanvasRenderingContext2D, points: TrailPoint[], now: number): void {
  for (const point of points) {
    const age = now - point.born;
    if (age > point.lifeMs) continue;
    const t = age / point.lifeMs;
    const centerPx = toPx(point);

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t) * 0.65;
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(centerPx.x, centerPx.y, Math.max(1, TRAIL_MAX_RADIUS_PX * (1 - t * 0.7)), 0, Math.PI * 2);
    ctx.fill();
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

function drawFlavorShape(
  ctx: CanvasRenderingContext2D,
  flavor: EffectFlavor,
  color: string,
  centerPx: Position,
  direction: Position | null,
  aoe: number,
  t: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  switch (flavor) {
    case "ICE": {
      const radius = (10 + 10 * t) * aoe;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "POISON": {
      const radius = (12 + 8 * t) * aoe;
      ctx.globalAlpha = alpha * 0.35;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "EXPLOSION": {
      const radius = (16 + 60 * t) * aoe;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "HEAL": {
      const radius = (12 + 6 * Math.sin(t * Math.PI)) * aoe;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "SHIELD": {
      const radius = 16 * aoe;
      ctx.globalAlpha = alpha * 0.8;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, t * Math.PI * 0.3, Math.PI * 2 + t * Math.PI * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius * 0.7, -t * Math.PI * 0.4, Math.PI * 2 - t * Math.PI * 0.4);
      ctx.stroke();
      break;
    }
    case "EARTH": {
      const length = (14 + 10 * t) * aoe;
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
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "GRAVITY": {
      const radius = (18 - 14 * t) * aoe;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerPx.x, centerPx.y, Math.max(1, radius), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "SONIC": {
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

export function useCombatEffects(equippedAbilities: [Ability, Ability]): UseCombatEffectsResult {
  const effectsRef = useRef<FiredEffect[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const boltsRef = useRef<Bolt[]>([]);
  const flashesRef = useRef<ScreenFlash[]>([]);
  const shakeRef = useRef<Shake | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);

  // Read fresh each fireEffect() call without forcing fireEffect itself to
  // be recreated on every loadout change (it stays a stable useCallback).
  const equippedRef = useRef(equippedAbilities);
  equippedRef.current = equippedAbilities;
  const assignmentRef = useRef<{ abilities: [Ability, Ability]; flavors: [EffectFlavor, EffectFlavor] } | null>(
    null,
  );

  const flavorFor = useCallback((ability: Ability): EffectFlavor => {
    const equipped = equippedRef.current;
    const cached = assignmentRef.current;
    const flavors =
      cached && cached.abilities[0] === equipped[0] && cached.abilities[1] === equipped[1]
        ? cached.flavors
        : computeDistinctFlavors(equipped);
    if (flavors !== cached?.flavors) assignmentRef.current = { abilities: equipped, flavors };

    if (ability === equipped[0]) return flavors[0];
    if (ability === equipped[1]) return flavors[1];
    // Not part of the current loadout (shouldn't normally happen) — safe fallback.
    return determineFlavor(ability);
  }, []);

  const fireEffect = useCallback(
    (ability: Ability, source: Position, enemies: Enemy[], facing?: Position) => {
      const now = performance.now();
      const flavor = flavorFor(ability);
      const variant = abilityVariant(ability);
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

      const palette3 = flavorColors(flavor, ability.category, variant.hueOffset, 3);
      const primaryColor = palette3[1];

      switch (flavor) {
        case "FIRE":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: Math.round(30 * aoe),
                speedMin: 140,
                speedMax: 320,
                sizeMin: 3,
                sizeMax: 6,
                lifeMinMs: 300,
                lifeMaxMs: 600,
                colors: palette3,
                gravity: -60,
                coneCenterAngle: angle,
                coneSpreadRadians: 0.7,
              },
              variant,
            ),
          );
          break;
        case "ICE":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: Math.round(16 * aoe),
                speedMin: 100,
                speedMax: 240,
                sizeMin: 2.5,
                sizeMax: 5,
                lifeMinMs: 400,
                lifeMaxMs: 700,
                colors: palette3,
                gravity: 90,
                coneCenterAngle: angle,
                coneSpreadRadians: angle === undefined ? Math.PI * 2 : 1.4,
                shape: "shard",
              },
              variant,
            ),
          );
          break;
        case "POISON":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: Math.round(14 * aoe),
                speedMin: 20,
                speedMax: 70,
                sizeMin: 4,
                sizeMax: 8,
                lifeMinMs: 600,
                lifeMaxMs: 900,
                colors: palette3,
                gravity: -35,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "LIGHTNING":
          boltsRef.current.push(spawnBolt(sourcePx, aimPx, primaryColor, now));
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: 10,
                speedMin: 60,
                speedMax: 160,
                sizeMin: 2,
                sizeMax: 4,
                lifeMinMs: 150,
                lifeMaxMs: 260,
                colors: palette3,
              },
              variant,
            ),
          );
          break;
        case "EXPLOSION":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: Math.round(40 * aoe),
                speedMin: 180,
                speedMax: 420,
                sizeMin: 3,
                sizeMax: 8,
                lifeMinMs: 300,
                lifeMaxMs: 550,
                colors: palette3,
                gravity: 140,
              },
              variant,
            ),
          );
          shakeRef.current = { born: now, lifeMs: 260, magnitudePx: 6 * aoe };
          flashesRef.current.push({ color: primaryColor, born: now, lifeMs: 180, peakAlpha: 0.22 });
          break;
        case "EARTH":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: Math.round(20 * aoe),
                speedMin: 80,
                speedMax: 220,
                sizeMin: 3,
                sizeMax: 7,
                lifeMinMs: 350,
                lifeMaxMs: 600,
                colors: palette3,
                gravity: 260,
                coneCenterAngle: angle,
                coneSpreadRadians: angle === undefined ? Math.PI * 2 : 1.2,
              },
              variant,
            ),
          );
          break;
        case "WATER":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: Math.round(18 * aoe),
                speedMin: 90,
                speedMax: 230,
                sizeMin: 2.5,
                sizeMax: 5,
                lifeMinMs: 350,
                lifeMaxMs: 550,
                colors: palette3,
                gravity: 200,
                coneCenterAngle: angle,
                coneSpreadRadians: angle === undefined ? Math.PI * 2 : 1.1,
              },
              variant,
            ),
          );
          break;
        case "WIND":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: Math.round(22 * aoe),
                speedMin: 120,
                speedMax: 260,
                sizeMin: 2,
                sizeMax: 4,
                lifeMinMs: 250,
                lifeMaxMs: 450,
                colors: palette3,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "SONIC":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: Math.round(16 * aoe),
                speedMin: 200,
                speedMax: 380,
                sizeMin: 2,
                sizeMax: 3,
                lifeMinMs: 200,
                lifeMaxMs: 320,
                colors: palette3,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "SHADOW":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: Math.round(18 * aoe),
                speedMin: 30,
                speedMax: 100,
                sizeMin: 3,
                sizeMax: 6,
                lifeMinMs: 350,
                lifeMaxMs: 550,
                colors: palette3,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "HOLY":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: Math.round(20 * aoe),
                speedMin: 40,
                speedMax: 140,
                sizeMin: 2,
                sizeMax: 5,
                lifeMinMs: 350,
                lifeMaxMs: 600,
                colors: palette3,
                gravity: -50,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "GRAVITY": {
          // Converges inward (unlike every other burst): particles start on a
          // ring around the impact point and fly toward its center.
          const count = Math.round(18 * aoe);
          const converging: Particle[] = [];
          for (let i = 0; i < count; i += 1) {
            const ringAngle = Math.random() * Math.PI * 2;
            const startRadius = 40 + Math.random() * 60;
            const speed = (80 + Math.random() * 160) * variant.speedScale;
            converging.push({
              x: aimPx.x + Math.cos(ringAngle) * startRadius,
              y: aimPx.y + Math.sin(ringAngle) * startRadius,
              vx: -Math.cos(ringAngle) * speed,
              vy: -Math.sin(ringAngle) * speed,
              size: (2 + Math.random() * 3) * variant.sizeScale,
              color: palette3[Math.floor(Math.random() * palette3.length)],
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
            ...variantBurst(
              sourcePx,
              now,
              {
                count: Math.round(14 * aoe),
                speedMin: 15,
                speedMax: 50,
                sizeMin: 5,
                sizeMax: 10,
                lifeMinMs: 600,
                lifeMaxMs: 950,
                colors: palette3,
                gravity: -20,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "HEAL":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: 16,
                speedMin: 20,
                speedMax: 60,
                sizeMin: 3,
                sizeMax: 5,
                lifeMinMs: 700,
                lifeMaxMs: 1000,
                colors: palette3,
                gravity: -70,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "SHIELD":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: 8,
                speedMin: 10,
                speedMax: 40,
                sizeMin: 2,
                sizeMax: 4,
                lifeMinMs: 500,
                lifeMaxMs: 700,
                colors: palette3,
                coneSpreadRadians: Math.PI * 2,
              },
              variant,
            ),
          );
          break;
        case "DASH":
          particlesRef.current.push(
            ...variantBurst(
              sourcePx,
              now,
              {
                count: 12,
                speedMin: 60,
                speedMax: 180,
                sizeMin: 2,
                sizeMax: 4,
                lifeMinMs: 220,
                lifeMaxMs: 380,
                colors: palette3,
                coneCenterAngle: angle !== undefined ? angle + Math.PI : undefined,
                coneSpreadRadians: 0.6,
              },
              variant,
            ),
          );
          break;
        case "GENERIC_OFFENSE":
          particlesRef.current.push(
            ...variantBurst(
              aimPx,
              now,
              {
                count: 10,
                speedMin: 60,
                speedMax: 160,
                sizeMin: 2,
                sizeMax: 4,
                lifeMinMs: 200,
                lifeMaxMs: 350,
                colors: palette3,
              },
              variant,
            ),
          );
          break;
        case "GENERIC_MOBILITY":
        case "GENERIC_DEFENSE":
        case "GENERIC_UTILITY":
          break;
      }

      const stunKind = stunKindFor(ability, variant);
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
        primaryColor,
        source,
        impact,
        startedAt: now,
        durationMs: shapeDurationMs,
        isProjectile,
        stunRingColor: stunKind ? stunKind.flashColor : null,
      });
    },
    [flavorFor],
  );

  const trailColorFor = useCallback(
    (ability: Ability): string => {
      const flavor = flavorFor(ability);
      const variant = abilityVariant(ability);
      return flavorColors(flavor, ability.category, variant.hueOffset, 1)[0];
    },
    [flavorFor],
  );

  const spawnTrailPoint = useCallback((position: Position, color: string, now: number) => {
    trailRef.current.push({ x: position.x, y: position.y, color, born: now, lifeMs: TRAIL_POINT_LIFE_MS });
  }, []);

  const drawEffects = useCallback((ctx: CanvasRenderingContext2D, now: number) => {
    if (trailRef.current.length > 0) {
      trailRef.current = trailRef.current.filter((point) => now - point.born < point.lifeMs);
      drawTrail(ctx, trailRef.current, now);
    }
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

        drawFlavorShape(ctx, effect.flavor, effect.primaryColor, centerPx, direction, aoe, t, alpha);

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
      flashesRef.current.length > 0 ||
      trailRef.current.length > 0,
    [],
  );

  return { fireEffect, trailColorFor, spawnTrailPoint, drawEffects, getShakeOffset, hasActiveEffects };
}
