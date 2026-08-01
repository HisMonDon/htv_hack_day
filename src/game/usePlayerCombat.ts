import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  Ability,
  Enemy,
  LanePhase,
  LaneType,
  PlayerEntity,
  ZombieWavePlan,
} from "./types";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  CANVAS_SCALE,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  PLAYER_START_X,
  PLAYER_START_Y,
  clampToArena,
} from "./arena";
import { createPlayerEntity } from "./playerEntity";
import { useCombatEffects } from "./useCombatEffects";
import { useEnemies } from "./useEnemies";
import { usePlayerMovement } from "./usePlayerMovement";

const ABILITY_KEYS: Record<string, 0 | 1> = { j: 0, k: 1 };
const BOT_MOVE_SPEED_PX = 80;
const BOT_RETREAT_DISTANCE_PX = 80;
const BOT_APPROACH_DISTANCE_PX = 180;
const BOT_EDGE_BIAS_PX = 40;
const DEMO_MIN_COOLDOWN_SECONDS = 0.6;
const DEMO_MAX_COOLDOWN_SECONDS = 1.8;

function emitAbilityAura(laneType: LaneType, category: Ability["category"]): void {
  window.dispatchEvent(new CustomEvent("chaos-roll:ability-used", { detail: { laneType, category } }));
}
const JUMP_DURATION_MS = 420;
const DASH_DURATION_MS = 220;
const JUMP_HEIGHT_PX = 26;

function demoCooldownSeconds(value: number): number {
  return Math.max(DEMO_MIN_COOLDOWN_SECONDS, Math.min(DEMO_MAX_COOLDOWN_SECONDS, value));
}

// A forced repositioning in progress — overrides normal movement control
// (human input / bot AI) for its duration. "jump" additionally grants brief
// invulnerability and a visual arc so it reads as jumping OVER zombies
// rather than just a fast walk.
interface MovementAction {
  kind: "dash" | "jump";
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  startedAt: number;
  durationMs: number;
}

// Ability.movementBehavior/name/description say things like "dash", "blink",
// "teleport", "jump", "leap" — until now nothing actually moved the player
// when one of these fired. This turns that text into a real position change.
function movementKindFor(ability: Ability): "teleport" | "jump" | "dash" | null {
  const haystack = `${ability.movementBehavior ?? ""} ${ability.name} ${ability.description}`.toLowerCase();
  if (haystack.includes("teleport") || haystack.includes("blink")) return "teleport";
  if (haystack.includes("jump") || haystack.includes("leap") || haystack.includes("launch")) return "jump";
  if (
    haystack.includes("dash") ||
    haystack.includes("sprint") ||
    haystack.includes("roll") ||
    haystack.includes("slide") ||
    haystack.includes("charge")
  )
    return "dash";
  return null;
}

function hasteFor(ability: Ability): { multiplier: number; durationMs: number } | null {
  const type = (ability.statusEffect.type ?? "").toLowerCase();
  if (!["haste", "speed", "hasten", "quicken"].some((k) => type.includes(k))) return null;
  const magnitude = Math.max(0, Math.min(2, ability.statusEffect.magnitude ?? 0.3));
  const durationSeconds = ability.statusEffect.durationSeconds ?? 3;
  return { multiplier: 1 + magnitude, durationMs: durationSeconds * 1000 };
}

// Arena palette — deliberately duplicated from styles/theme.css rather than
// read via getComputedStyle, which would be a layout read inside the frame
// loop. Keep these in sync with the tokens by hand; they are the only place
// canvas drawing is allowed to name a color.
const COLOR_VOID = "#0b0b0e";
const COLOR_BONE = "#ede6d6";
const COLOR_DANGER = "#ff2e2e";
const COLOR_HUMAN = "#35e0c8";
const COLOR_BOT = "#ff3d7f";
const COLOR_GRID = "rgba(237, 230, 214, 0.05)";
const COLOR_TARGET = "#5a5d66";

const GRID_SPACING_PX = CANVAS_SCALE * 2;
const ZOMBIE_COLORS = ["#91c96b", "#d87556", "#7c9fd8", "#c18ad6", "#d6b45e"];

function zombieVisual(enemy: Enemy): { color: string; radius: number } {
  let hash = 0;
  for (const character of enemy.archetypeId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const healthTier = Math.min(3, Math.floor(enemy.maxHp / 35));
  return {
    color: ZOMBIE_COLORS[hash % ZOMBIE_COLORS.length],
    radius: 8 + (hash % 3) * 3 + healthTier * 2,
  };
}

type BotMoveMode = "approach" | "orbit" | "retreat";

interface BotSteering {
  mode: BotMoveMode;
  direction: { x: number; y: number };
  orbitSign: 1 | -1;
}

function drawEnemyAbilityEffect(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  now: number,
): void {
  const effect = enemy.abilityEffect;
  if (!effect || effect.endsAt <= now) return;

  const progress = Math.max(0, Math.min(1, (effect.endsAt - now) / (effect.endsAt - effect.startedAt)));
  const enemyX = enemy.x * CANVAS_SCALE;
  const enemyY = enemy.y * CANVAS_SCALE;
  const originX = effect.origin.x * CANVAS_SCALE;
  const originY = effect.origin.y * CANVAS_SCALE;
  const targetX = effect.target.x * CANVAS_SCALE;
  const targetY = effect.target.y * CANVAS_SCALE;

  ctx.save();
  ctx.globalAlpha = 0.2 + progress * 0.55;
  ctx.fillStyle = enemy.ability.effectColor;
  ctx.strokeStyle = enemy.ability.effectColor;
  ctx.lineWidth = 2;

  if (enemy.ability.attackShape === "BOLT") {
    ctx.beginPath();
    ctx.moveTo(enemyX, enemyY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
  } else if (enemy.ability.attackShape === "CONE") {
    const angle = Math.atan2(targetY - enemyY, targetX - enemyX);
    const length = enemy.ability.range * CANVAS_SCALE;
    const spread = Math.max(0.35, Math.min(1.1, enemy.ability.areaOfEffect / 3));
    ctx.beginPath();
    ctx.moveTo(enemyX, enemyY);
    ctx.lineTo(
      enemyX + Math.cos(angle - spread) * length,
      enemyY + Math.sin(angle - spread) * length,
    );
    ctx.lineTo(
      enemyX + Math.cos(angle + spread) * length,
      enemyY + Math.sin(angle + spread) * length,
    );
    ctx.closePath();
    ctx.fill();
  } else if (enemy.ability.attackShape === "AURA") {
    ctx.beginPath();
    ctx.arc(enemyX, enemyY, enemy.ability.areaOfEffect * CANVAS_SCALE, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(targetX, targetY, Math.max(8, enemy.ability.areaOfEffect * CANVAS_SCALE), 0, Math.PI * 2);
    ctx.stroke();
  }

  if (enemy.ability.movementAction === "BLINK") {
    ctx.beginPath();
    ctx.arc(originX, originY, 12 + (1 - progress) * 12, 0, Math.PI * 2);
    ctx.stroke();
  } else if (enemy.ability.movementAction === "DASH") {
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(enemyX, enemyY);
    ctx.stroke();
  }

  ctx.restore();
}

// Sparse floor grid — damaged-cabinet substrate, drawn under everything.
// Cheap enough (a few dozen strokes) that caching it to an offscreen canvas
// would add complexity without measurable gain at 480x360.
function drawArenaFloor(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = GRID_SPACING_PX; x < width; x += GRID_SPACING_PX) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = GRID_SPACING_PX; y < height; y += GRID_SPACING_PX) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
}

// Forward-leaning wedge with swept-back flanks and a notched tail — reads as
// a direction and an aggressive silhouette at 24px without needing sprite
// data (renderPixelArt is still an unimplemented stub). Value contrast comes
// from the void-colored outline, not glow, so the actor stays separated from
// the floor grid regardless of accent brightness.
function drawActor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  dirX: number,
  dirY: number,
  accent: string,
): void {
  const nx = -dirY;
  const ny = dirX;

  ctx.beginPath();
  ctx.moveTo(px + dirX * radius * 1.9, py + dirY * radius * 1.9);
  ctx.lineTo(px - dirX * radius * 0.9 + nx * radius * 1.15, py - dirY * radius * 0.9 + ny * radius * 1.15);
  ctx.lineTo(px - dirX * radius * 0.35, py - dirY * radius * 0.35);
  ctx.lineTo(px - dirX * radius * 0.9 - nx * radius * 1.15, py - dirY * radius * 0.9 - ny * radius * 1.15);
  ctx.closePath();

  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR_VOID;
  ctx.stroke();

  // Brightest pixels reserved for the core, per the sprite direction.
  ctx.fillStyle = COLOR_BONE;
  ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
}

// Hazard-marked target block with clipped corners — industrial, not a
// rounded card. Temporary scaffolding alongside dummyTarget.ts.
function drawTarget(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hpFraction: number,
): void {
  const left = Math.round(cx) - 10;
  const top = Math.round(cy) - 10;
  const notch = 4;

  ctx.beginPath();
  ctx.moveTo(left + notch, top);
  ctx.lineTo(left + 20, top);
  ctx.lineTo(left + 20, top + 20 - notch);
  ctx.lineTo(left + 20 - notch, top + 20);
  ctx.lineTo(left, top + 20);
  ctx.lineTo(left, top + notch);
  ctx.closePath();
  ctx.fillStyle = COLOR_TARGET;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR_VOID;
  ctx.stroke();

  ctx.fillStyle = COLOR_VOID;
  ctx.fillRect(left, top - 6, 20, 4);
  ctx.fillStyle = COLOR_DANGER;
  ctx.fillRect(left, top - 6, Math.round(20 * hpFraction), 4);
}

export interface UsePlayerCombatOptions {
  laneType: LaneType;
  phase: LanePhase;
  zombieWavePlan: ZombieWavePlan;
  equippedAbilities: [Ability, Ability];
  canvasRef: RefObject<HTMLCanvasElement>;
}

export interface UsePlayerCombatResult {
  player: PlayerEntity;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  cooldownsRemaining: [number, number];
  enemies: Enemy[];
}

// Owns one lane's player, ability cooldowns, enemy combat, and canvas render
// loop. Match timing and ability generation remain outside this hook.
export function usePlayerCombat(opts: UsePlayerCombatOptions): UsePlayerCombatResult {
  const { laneType, phase, zombieWavePlan, equippedAbilities, canvasRef } = opts;

  const playerRef = useRef<PlayerEntity | null>(null);
  if (playerRef.current === null) {
    playerRef.current = createPlayerEntity(`${laneType}-player`, PLAYER_START_X, PLAYER_START_Y);
  }
  const player = playerRef.current;

  const { enemies, enemiesRef, damageEnemies } = useEnemies({
    laneType,
    phase,
    wavePlan: zombieWavePlan,
    player,
  });
  const combatEffects = useCombatEffects(equippedAbilities);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // The stable window key handler reads these refs, so a newly committed
  // loadout is available immediately without reattaching the listener.
  const equippedRef = useRef(equippedAbilities);
  equippedRef.current = equippedAbilities;
  const previousEquippedRef = useRef(equippedAbilities);
  const cooldownsRef = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    if (previousEquippedRef.current === equippedAbilities) return;
    previousEquippedRef.current = equippedAbilities;
    cooldownsRef.current[0] = 0;
    cooldownsRef.current[1] = 0;
  }, [equippedAbilities]);

  const [snapshot, setSnapshot] = useState({ hp: player.hp, isAlive: player.isAlive });
  const lastKnownRef = useRef(snapshot);
  const { getMovementVector } = usePlayerMovement();

  const movementActionRef = useRef<MovementAction | null>(null);
  const hasteRef = useRef<{ multiplier: number; until: number }>({ multiplier: 1, until: 0 });
  const botTargetIdRef = useRef<string | null>(null);
  const botSteeringRef = useRef<BotSteering>({
    mode: "approach",
    direction: { x: 0, y: 1 },
    orbitSign: 1,
  });

  // Called at both activation sites (human keydown, bot auto-fire) right
  // after an ability actually fires — resolves its movementBehavior/status
  // text into a real position change or a temporary speed boost.
  function applyMovementBehavior(ability: Ability, now: number): void {
    const kind = movementKindFor(ability);
    if (kind) {
      const facing =
        player.facingDirection.x !== 0 || player.facingDirection.y !== 0
          ? player.facingDirection
          : { x: 0, y: 1 };
      const travelDistance = Math.max(1.5, Math.min(ability.range || 4, 8));
      const dest = clampToArena(
        player.x + facing.x * travelDistance,
        player.y + facing.y * travelDistance,
      );

      if (kind === "teleport") {
        player.x = dest.x;
        player.y = dest.y;
        movementActionRef.current = null;
      } else if (kind === "jump") {
        movementActionRef.current = {
          kind: "jump",
          startX: player.x,
          startY: player.y,
          targetX: dest.x,
          targetY: dest.y,
          startedAt: now,
          durationMs: JUMP_DURATION_MS,
        };
        player.invulnerableUntil = now + JUMP_DURATION_MS;
      } else {
        movementActionRef.current = {
          kind: "dash",
          startX: player.x,
          startY: player.y,
          targetX: dest.x,
          targetY: dest.y,
          startedAt: now,
          durationMs: DASH_DURATION_MS,
        };
      }
    }

    const haste = hasteFor(ability);
    if (haste) {
      hasteRef.current = { multiplier: haste.multiplier, until: now + haste.durationMs };
    }
  }

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    // Cooldown readout and the defeated state are owned by the HUD and
    // LaneView's status overlay respectively — the canvas deliberately draws
    // neither, so combat information lives in exactly one place.
    function render() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawArenaFloor(ctx, canvas.width, canvas.height);

      const now = performance.now();
      const shake = combatEffects.getShakeOffset(now);
      ctx.save();
      ctx.translate(shake.x, shake.y);

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        drawEnemyAbilityEffect(ctx, enemy, now);
      }

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        const x = enemy.x * CANVAS_SCALE;
        const y = enemy.y * CANVAS_SCALE;
        const visual = zombieVisual(enemy);
        const radius = visual.radius;
        const top = y - radius;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = visual.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLOR_VOID;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - radius * 0.28, y - radius * 0.28, Math.max(2, radius * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.fill();

        const isStunned = !!enemy.stunnedUntil && enemy.stunnedUntil > now;
        const isFlashed = !!enemy.flashUntil && enemy.flashUntil > now;
        if (isFlashed || isStunned) {
          ctx.strokeStyle = isFlashed
            ? COLOR_BONE
            : Math.floor(now / 100) % 2 === 0
              ? "#fff8b0"
              : "#ffe066";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        const barWidth = Math.max(20, radius * 2);
        const hpFraction = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        ctx.fillStyle = "#2a1111";
        ctx.fillRect(x - barWidth / 2, top - 6, barWidth, 4);
        ctx.fillStyle = "#e33e3e";
        ctx.fillRect(x - barWidth / 2, top - 6, barWidth * hpFraction, 4);
      }

      const playerPx = player.x * CANVAS_SCALE;
      const playerPy = player.y * CANVAS_SCALE;
      const activeMovement = movementActionRef.current;
      const jumpOffsetPx =
        activeMovement && activeMovement.kind === "jump"
          ? Math.sin(Math.max(0, Math.min(1, (now - activeMovement.startedAt) / activeMovement.durationMs)) * Math.PI) *
            JUMP_HEIGHT_PX
          : 0;

      if (jumpOffsetPx > 0.5) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = COLOR_VOID;
        ctx.beginPath();
        ctx.ellipse(playerPx, playerPy, PLAYER_RADIUS * CANVAS_SCALE * 0.8, PLAYER_RADIUS * CANVAS_SCALE * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawActor(
        ctx,
        playerPx,
        playerPy - jumpOffsetPx,
        PLAYER_RADIUS * CANVAS_SCALE,
        player.facingDirection.x,
        player.facingDirection.y,
        laneType === "human" ? COLOR_HUMAN : COLOR_BOT,
      );
      combatEffects.drawEffects(ctx, now);
      ctx.restore();
    }

    function tick(now: number) {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (phaseRef.current === "COMBAT" && player.isAlive) {
        const activeMovement = movementActionRef.current;
        const hasteMultiplier = now < hasteRef.current.until ? hasteRef.current.multiplier : 1;

        if (activeMovement) {
          const t = Math.min(1, (now - activeMovement.startedAt) / activeMovement.durationMs);
          const next = clampToArena(
            activeMovement.startX + (activeMovement.targetX - activeMovement.startX) * t,
            activeMovement.startY + (activeMovement.targetY - activeMovement.startY) * t,
          );
          player.x = next.x;
          player.y = next.y;
          if (t >= 1) movementActionRef.current = null;
        } else if (laneType === "human") {
          const move = getMovementVector();
          if (move.x !== 0 || move.y !== 0) {
            const next = clampToArena(
              player.x + move.x * PLAYER_MOVE_SPEED * hasteMultiplier * deltaSeconds,
              player.y + move.y * PLAYER_MOVE_SPEED * hasteMultiplier * deltaSeconds,
            );
            player.x = next.x;
            player.y = next.y;
            player.facingDirection = { x: move.x, y: move.y };
          }
        } else {
          const livingEnemies = enemiesRef.current.filter((enemy) => enemy.alive);
          let nearestEnemy = livingEnemies.find((enemy) => enemy.id === botTargetIdRef.current) ?? null;
          if (!nearestEnemy) {
            nearestEnemy = livingEnemies.reduce<Enemy | null>((nearest, enemy) => {
              if (!nearest) return enemy;
              const enemyDistance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
              const nearestDistance = Math.hypot(nearest.x - player.x, nearest.y - player.y);
              return enemyDistance < nearestDistance ? enemy : nearest;
            }, null);
            botTargetIdRef.current = nearestEnemy?.id ?? null;
          }

          if (nearestEnemy) {
            const dx = nearestEnemy.x - player.x;
            const dy = nearestEnemy.y - player.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0) {
              const distancePx = distance * CANVAS_SCALE;
              const steering = botSteeringRef.current;
              if (steering.mode === "retreat") {
                if (distancePx > BOT_RETREAT_DISTANCE_PX + 18) steering.mode = "orbit";
              } else if (steering.mode === "approach") {
                if (distancePx < BOT_APPROACH_DISTANCE_PX - 18) steering.mode = "orbit";
              } else if (distancePx < BOT_RETREAT_DISTANCE_PX - 12) {
                steering.mode = "retreat";
              } else if (distancePx > BOT_APPROACH_DISTANCE_PX + 12) {
                steering.mode = "approach";
              }
              const baseDirection =
                steering.mode === "retreat"
                  ? { x: -dx / distance, y: -dy / distance }
                  : steering.mode === "approach"
                    ? { x: dx / distance, y: dy / distance }
                    : { x: (-dy / distance) * steering.orbitSign, y: (dx / distance) * steering.orbitSign };
              let moveX = baseDirection.x;
              let moveY = baseDirection.y;
              const playerXPx = player.x * CANVAS_SCALE;
              const playerYPx = player.y * CANVAS_SCALE;
              if (playerXPx < BOT_EDGE_BIAS_PX) moveX += 0.75;
              if (playerXPx > ARENA_WIDTH * CANVAS_SCALE - BOT_EDGE_BIAS_PX) moveX -= 0.75;
              if (playerYPx < BOT_EDGE_BIAS_PX) moveY += 0.75;
              if (playerYPx > ARENA_HEIGHT * CANVAS_SCALE - BOT_EDGE_BIAS_PX) moveY -= 0.75;
              const moveLength = Math.hypot(moveX, moveY) || 1;
              const desiredDirection = { x: moveX / moveLength, y: moveY / moveLength };
              const turnSmoothing = 0.18;
              const smoothX = steering.direction.x * (1 - turnSmoothing) + desiredDirection.x * turnSmoothing;
              const smoothY = steering.direction.y * (1 - turnSmoothing) + desiredDirection.y * turnSmoothing;
              const smoothLength = Math.hypot(smoothX, smoothY) || 1;
              const direction = { x: smoothX / smoothLength, y: smoothY / smoothLength };
              steering.direction = direction;
              const speedScale = steering.mode === "retreat" ? 1 : 0.65;
              const step = (BOT_MOVE_SPEED_PX / CANVAS_SCALE) * speedScale * hasteMultiplier * deltaSeconds;
              const next = clampToArena(
                player.x + direction.x * step,
                player.y + direction.y * step,
              );
              player.x = next.x;
              player.y = next.y;
              player.facingDirection = direction;
            }
          }

        }

        for (let index = 0; index < cooldownsRef.current.length; index += 1) {
          cooldownsRef.current[index] = Math.max(
            0,
            cooldownsRef.current[index] - deltaSeconds,
          );
        }

        if (laneType === "bot") {
          for (const slot of [0, 1] as const) {
            if (cooldownsRef.current[slot] > 0) continue;
            const ability = equippedRef.current[slot];
            const hitIds = damageEnemies(ability, { x: player.x, y: player.y });
            if (hitIds.length === 0) continue;

            combatEffects.fireEffect(
              ability,
              { x: player.x, y: player.y },
              enemiesRef.current,
              player.facingDirection,
            );
            applyMovementBehavior(ability, now);
            cooldownsRef.current[slot] = demoCooldownSeconds(ability.cooldownSeconds);
            emitAbilityAura(laneType, ability.category);
            break;
          }
        }
      }

      if (player.hp !== lastKnownRef.current.hp || player.isAlive !== lastKnownRef.current.isAlive) {
        lastKnownRef.current = { hp: player.hp, isAlive: player.isAlive };
        setSnapshot(lastKnownRef.current);
      }

      render();
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // getMovementVector, damageEnemies, and enemiesRef are stable refs/accessors for this
    // lane's lifetime; the live phase/loadout values are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, laneType, player]);

  useEffect(() => {
    if (laneType !== "human") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (phaseRef.current !== "COMBAT" || !player.isAlive || event.repeat) return;
      const slot = ABILITY_KEYS[event.key.toLowerCase()];
      if (slot === undefined || cooldownsRef.current[slot] > 0) return;

      const ability = equippedRef.current[slot];
      const now = performance.now();
      damageEnemies(ability, { x: player.x, y: player.y });
      combatEffects.fireEffect(
        ability,
        { x: player.x, y: player.y },
        enemiesRef.current,
        player.facingDirection,
      );
      applyMovementBehavior(ability, now);
      cooldownsRef.current[slot] = demoCooldownSeconds(ability.cooldownSeconds);
      emitAbilityAura(laneType, ability.category);

      console.log(
        `[usePlayerCombat] ${laneType} activated "${ability.name}" (slot ${slot}) — hit:`,
      );
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [combatEffects.fireEffect, damageEnemies, enemiesRef, laneType, player]);

  // Temporary death-path helper retained for quick hackathon verification.
  useEffect(() => {
    const globalWindow = window as unknown as {
      __debugDamagePlayer?: Record<string, (amount: number) => void>;
    };
    globalWindow.__debugDamagePlayer = globalWindow.__debugDamagePlayer ?? {};
    globalWindow.__debugDamagePlayer[laneType] = (amount: number) => {
      player.takeDamage(amount);
      console.log(
        `[DEBUG] dealt ${amount} damage to ${laneType} player -> hp ${player.hp}, isAlive ${player.isAlive}`,
      );
    };
    return () => {
      delete globalWindow.__debugDamagePlayer?.[laneType];
    };
  }, [laneType, player]);

  return {
    player,
    health: snapshot.hp,
    maxHealth: player.maxHp,
    isAlive: snapshot.isAlive,
    cooldownsRemaining: cooldownsRef.current,
    enemies,
  };
}
