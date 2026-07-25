import { useEffect, useRef, useState, type RefObject } from "react";
import type { Ability, Damageable, LanePhase, LaneType, PlayerEntity } from "./types";
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
import { createDummyTarget } from "./dummyTarget";
import { resolveAbilityHit } from "./combat";
import { usePlayerMovement } from "./usePlayerMovement";

const DUMMY_RESPAWN_MS = 3000;
const ABILITY_KEYS: Record<string, 0 | 1> = { j: 0, k: 1 };

export interface UsePlayerCombatOptions {
  laneType: LaneType;
  phase: LanePhase;
  equippedAbilities: [Ability, Ability];
  canvasRef: RefObject<HTMLCanvasElement>;
}

export interface UsePlayerCombatResult {
  // Live mutable entity — reading .x/.y/.hp off it always reflects the
  // current frame's values, even between the hp-triggered re-renders below.
  // This is what LaneState.player exposes for botController/zombies later.
  player: PlayerEntity;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  // Live mutable array (same identity every render, elements updated in
  // place) — mirrors LaneState.abilityCooldownRemainingSeconds so
  // botController.decideBotAbilityUse reads real per-slot cooldowns once
  // wired in, not a stale snapshot.
  cooldownsRemaining: [number, number];
}

// Task 4 — owns one lane's player entity: position, hp, movement (human
// lane only), J/K ability activation (human lane only), cooldowns, and
// combat resolution against a temporary dummy target. Runs its own
// requestAnimationFrame loop and draws directly to canvasRef — independent
// per lane, matching useLaneGeneration's one-instance-per-LaneView pattern
// (the shared clock, useMatchClock, is the one thing NOT per-lane — see LobbyView).
export function usePlayerCombat(opts: UsePlayerCombatOptions): UsePlayerCombatResult {
  const { laneType, phase, equippedAbilities, canvasRef } = opts;

  const playerRef = useRef<PlayerEntity | null>(null);
  if (playerRef.current === null) {
    playerRef.current = createPlayerEntity(`${laneType}-player`, PLAYER_START_X, PLAYER_START_Y);
  }
  const player = playerRef.current;

  // TEMPORARY test scaffolding (game/dummyTarget.ts) — verifies ability
  // activation/resolveAbilityHit actually deals damage before zombies
  // (Sulaiman's system) exist. Placed off-center so it's within range of
  // the mock OFFENSE/UTILITY abilities' range stat (see data/mockAbilities.ts).
  const dummyTargetRef = useRef<ReturnType<typeof createDummyTarget> | null>(null);
  if (dummyTargetRef.current === null) {
    dummyTargetRef.current = createDummyTarget(
      `${laneType}-dummy-target`,
      ARENA_WIDTH * 0.75,
      ARENA_HEIGHT / 2,
    );
  }
  const dummyDeadAtRef = useRef<number | null>(null);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const equippedRef = useRef(equippedAbilities);
  const cooldownsRef = useRef<[number, number]>([0, 0]);
  const isFirstEquippedSync = useRef(true);
  useEffect(() => {
    equippedRef.current = equippedAbilities;
    if (isFirstEquippedSync.current) {
      isFirstEquippedSync.current = false;
    } else {
      // A pick changed this lane's loadout — reset both cooldowns rather
      // than trying to track ability identity across applyPick's FIFO slot
      // shuffle. Simple, and arguably reasonable game feel (fresh loadout,
      // fresh cooldowns).
      cooldownsRef.current = [0, 0];
    }
  }, [equippedAbilities]);

  const [snapshot, setSnapshot] = useState({ hp: player.hp, isAlive: player.isAlive });
  const lastKnownRef = useRef(snapshot);

  const { getMovementVector } = usePlayerMovement();

  // Main simulation + render loop. Movement/cooldown-ticking only progress
  // during COMBAT (verification requirement: frozen during PICKING /
  // PAUSED_GENERATING, not just visually obscured) — rendering still runs
  // every frame so the canvas reflects current state either way.
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();

    function render() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const dummy = dummyTargetRef.current!;
      if (dummy.hp > 0) {
        const dx = dummy.x * CANVAS_SCALE;
        const dy = dummy.y * CANVAS_SCALE;
        ctx.fillStyle = "#888888";
        ctx.fillRect(dx - 10, dy - 10, 20, 20);
        ctx.fillStyle = "#e33e3e";
        ctx.fillRect(dx - 10, dy - 18, 20 * (dummy.hp / dummy.maxHp), 4);
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
    }

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (phaseRef.current === "COMBAT" && player.isAlive) {
        if (laneType === "human") {
          const move = getMovementVector();
          if (move.x !== 0 || move.y !== 0) {
            const next = clampToArena(
              player.x + move.x * PLAYER_MOVE_SPEED * dt,
              player.y + move.y * PLAYER_MOVE_SPEED * dt,
            );
            player.x = next.x;
            player.y = next.y;
            player.facingDirection = { x: move.x, y: move.y };
          }
        }
        // TEMPORARY placeholder — bot lane's entity sits static here until
        // Darshan's botController.decideBotMovement is implemented and
        // wired in. Do not build real bot movement logic in this file.

        for (let i = 0; i < cooldownsRef.current.length; i++) {
          cooldownsRef.current[i] = Math.max(0, cooldownsRef.current[i] - dt);
        }

        const dummy = dummyTargetRef.current!;
        if (dummy.hp <= 0) {
          if (dummyDeadAtRef.current === null) {
            dummyDeadAtRef.current = now;
          } else if (now - dummyDeadAtRef.current > DUMMY_RESPAWN_MS) {
            dummy.hp = dummy.maxHp;
            dummyDeadAtRef.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneType, canvasRef]);

  // J/K ability activation — human lane only (spec section 3). Event-driven
  // (not per-frame polling): a keypress checks cooldown/phase at that exact
  // instant, no queueing.
  useEffect(() => {
    if (laneType !== "human") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (phaseRef.current !== "COMBAT" || !player.isAlive) return;
      const slot = ABILITY_KEYS[event.key.toLowerCase()];
      if (slot === undefined) return;

      if (cooldownsRef.current[slot] > 0) return; // on cooldown — no queueing, no partial activation

      const ability = equippedRef.current[slot];
      const targets: Damageable[] = [
        dummyTargetRef.current!,
        // TODO: Sulaiman's zombie system — add this lane's live zombie
        // entities here, e.g. ...zombieEntitiesForLane(laneType)
      ];
      const hitIds = resolveAbilityHit(ability, { x: player.x, y: player.y }, targets);
      cooldownsRef.current[slot] = ability.cooldownSeconds;

      console.log(
        `[usePlayerCombat] ${laneType} activated "${ability.name}" (slot ${slot}) — hit:`,
        hitIds,
        "dummy hp now",
        dummyTargetRef.current!.hp,
      );
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [laneType, player]);

  // TEMPORARY debug hook — lets you manually verify takeDamage/death from
  // the browser console before zombies exist to deal real damage:
  //   __debugDamagePlayer.human(30)   __debugDamagePlayer.bot(100)
  // TODO: zombie attacks call player.takeDamage(amount) once the zombie
  // system exists — that's the real path this stands in for. Delete this
  // effect once that's wired up.
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
  };
}
