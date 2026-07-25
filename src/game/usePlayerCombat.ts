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

    function render() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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

      const px = player.x * CANVAS_SCALE;
      const py = player.y * CANVAS_SCALE;
      ctx.fillStyle = laneType === "human" ? "#3b82f6" : "#ef4444";
      ctx.beginPath();
      ctx.arc(px, py, PLAYER_RADIUS * CANVAS_SCALE, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(
        px + player.facingDirection.x * PLAYER_RADIUS * CANVAS_SCALE * 1.6,
        py + player.facingDirection.y * PLAYER_RADIUS * CANVAS_SCALE * 1.6,
      );
      ctx.stroke();

      combatEffects.drawEffects(ctx, now);

      if (laneType === "human") {
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px monospace";
        const [cdJ, cdK] = cooldownsRef.current;
        ctx.fillText(`J: ${cdJ > 0 ? cdJ.toFixed(1) + "s" : "ready"}`, 8, canvas.height - 20);
        ctx.fillText(`K: ${cdK > 0 ? cdK.toFixed(1) + "s" : "ready"}`, 8, canvas.height - 6);
      }

      if (!player.isAlive) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "16px monospace";
        ctx.fillText("DEFEATED", canvas.width / 2 - 40, canvas.height / 2);
      }

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
