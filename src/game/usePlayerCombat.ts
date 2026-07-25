import { useEffect, useRef, useState, type RefObject } from "react";
import type { Ability, Enemy, LanePhase, LaneType, PlayerEntity } from "./types";
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
const BOT_REGEN_PER_SECOND = 3;
const DEMO_MIN_COOLDOWN_SECONDS = 0.6;
const DEMO_MAX_COOLDOWN_SECONDS = 1.8;

function demoCooldownSeconds(value: number): number {
  return Math.max(DEMO_MIN_COOLDOWN_SECONDS, Math.min(DEMO_MAX_COOLDOWN_SECONDS, value));
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
  waveNumber: number;
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
  const { laneType, phase, waveNumber, equippedAbilities, canvasRef } = opts;

  const playerRef = useRef<PlayerEntity | null>(null);
  if (playerRef.current === null) {
    playerRef.current = createPlayerEntity(`${laneType}-player`, PLAYER_START_X, PLAYER_START_Y);
  }
  const player = playerRef.current;

  const { enemies, enemiesRef, damageEnemies } = useEnemies({
    laneType,
    phase,
    waveNumber,
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
  const lastBotRegenAtRef = useRef(0);
  const { getMovementVector } = usePlayerMovement();

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

      // Pixel-art hygiene: no interpolation when sprites eventually land here.
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawArenaFloor(ctx, canvas.width, canvas.height);

      const now = performance.now();
      const shake = combatEffects.getShakeOffset(now);
      ctx.save();
      ctx.translate(shake.x, shake.y);

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        const x = enemy.x * CANVAS_SCALE;
        const y = enemy.y * CANVAS_SCALE;
        const radius = enemy.radius * CANVAS_SCALE;

        const isStunned = !!enemy.stunnedUntil && enemy.stunnedUntil > now;
        const isFlashed = !!enemy.flashUntil && enemy.flashUntil > now;
        ctx.fillStyle = isFlashed
          ? "#ffffff"
          : isStunned
            ? Math.floor(now / 100) % 2 === 0
              ? "#fff8b0"
              : "#ffe066"
            : "#77a83b";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#18210f";
        ctx.fillRect(x - radius * 0.45, y - radius * 0.25, radius * 0.25, radius * 0.25);
        ctx.fillRect(x + radius * 0.2, y - radius * 0.25, radius * 0.25, radius * 0.25);

        const barWidth = Math.max(18, radius * 2);
        const hpFraction = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
        ctx.fillStyle = "#2a1111";
        ctx.fillRect(x - barWidth / 2, y - radius - 8, barWidth, 4);
        ctx.fillStyle = "#e33e3e";
        ctx.fillRect(x - barWidth / 2, y - radius - 8, barWidth * hpFraction, 4);
      }

      drawActor(
        ctx,
        player.x * CANVAS_SCALE,
        player.y * CANVAS_SCALE,
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
        if (laneType === "human") {
          const move = getMovementVector();
          if (move.x !== 0 || move.y !== 0) {
            const next = clampToArena(
              player.x + move.x * PLAYER_MOVE_SPEED * deltaSeconds,
              player.y + move.y * PLAYER_MOVE_SPEED * deltaSeconds,
            );
            player.x = next.x;
            player.y = next.y;
            player.facingDirection = { x: move.x, y: move.y };
          }
        } else {
          const nearestEnemy = enemiesRef.current
            .filter((enemy) => enemy.alive)
            .reduce<Enemy | null>((nearest, enemy) => {
              if (!nearest) return enemy;
              const enemyDistance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
              const nearestDistance = Math.hypot(nearest.x - player.x, nearest.y - player.y);
              return enemyDistance < nearestDistance ? enemy : nearest;
            }, null);

          if (nearestEnemy) {
            const dx = nearestEnemy.x - player.x;
            const dy = nearestEnemy.y - player.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0) {
              const distancePx = distance * CANVAS_SCALE;
              const baseDirection =
                distancePx < BOT_RETREAT_DISTANCE_PX
                  ? { x: -dx / distance, y: -dy / distance }
                  : distancePx > BOT_APPROACH_DISTANCE_PX
                    ? { x: dx / distance, y: dy / distance }
                    : { x: -dy / distance, y: dx / distance };
              let moveX = baseDirection.x;
              let moveY = baseDirection.y;
              const playerXPx = player.x * CANVAS_SCALE;
              const playerYPx = player.y * CANVAS_SCALE;
              if (playerXPx < BOT_EDGE_BIAS_PX) moveX += 0.75;
              if (playerXPx > ARENA_WIDTH * CANVAS_SCALE - BOT_EDGE_BIAS_PX) moveX -= 0.75;
              if (playerYPx < BOT_EDGE_BIAS_PX) moveY += 0.75;
              if (playerYPx > ARENA_HEIGHT * CANVAS_SCALE - BOT_EDGE_BIAS_PX) moveY -= 0.75;
              const moveLength = Math.hypot(moveX, moveY) || 1;
              const direction = { x: moveX / moveLength, y: moveY / moveLength };
              const speedScale = distancePx < BOT_RETREAT_DISTANCE_PX ? 1 : 0.65;
              const step = (BOT_MOVE_SPEED_PX / CANVAS_SCALE) * speedScale * deltaSeconds;
              const next = clampToArena(
                player.x + direction.x * step,
                player.y + direction.y * step,
              );
              player.x = next.x;
              player.y = next.y;
              player.facingDirection = direction;
            }
          }

          if (now - lastBotRegenAtRef.current >= 1000) {
            player.hp = Math.min(player.maxHp, player.hp + BOT_REGEN_PER_SECOND);
            lastBotRegenAtRef.current = now;
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
            cooldownsRef.current[slot] = demoCooldownSeconds(ability.cooldownSeconds);
            console.log(
              `[usePlayerCombat] bot auto-fired "${ability.name}" (slot ${slot}) — hit:`,
              hitIds,
            );
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
      const hitIds = damageEnemies(ability, { x: player.x, y: player.y });
      combatEffects.fireEffect(
        ability,
        { x: player.x, y: player.y },
        enemiesRef.current,
        player.facingDirection,
      );
      cooldownsRef.current[slot] = demoCooldownSeconds(ability.cooldownSeconds);

      console.log(
        `[usePlayerCombat] ${laneType} activated "${ability.name}" (slot ${slot}) — hit:`,
        hitIds,
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
