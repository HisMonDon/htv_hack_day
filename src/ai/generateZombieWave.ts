import { Type, type Schema } from "@google/genai";
import type {
  SpriteData,
  ZombieAbility,
  ZombieArchetype,
  ZombieAttackShape,
  ZombieMovementAction,
  ZombieWavePlan,
} from "../game/types";
import { SPRITE_SIZE, validateSprite, type RawSpriteResponse } from "../game/spriteValidation";
import { getFallbackSprite, tierForWave } from "../data/spriteLibrary";
import { generateStructuredJSONWithRevision } from "./geminiClient";

const CACHE_PREFIX = "chaos-roll:zombie-wave:v2:";
const MAX_ARCHETYPES = 3;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ATTACK_SHAPES: ZombieAttackShape[] = ["CONTACT", "BOLT", "CONE", "AURA"];
const MOVEMENT_ACTIONS: ZombieMovementAction[] = ["NONE", "DASH", "BLINK"];

interface RawZombieArchetype {
  name?: unknown;
  description?: unknown;
  maxHealth?: unknown;
  moveSpeed?: unknown;
  spawnWeight?: unknown;
  ability?: Partial<ZombieAbility>;
  sprite?: RawSpriteResponse;
}

interface RawZombieWave {
  theme?: unknown;
  archetypes?: RawZombieArchetype[];
}

function buildSchema(): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      theme: { type: Type.STRING },
      archetypes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            maxHealth: { type: Type.NUMBER },
            moveSpeed: { type: Type.NUMBER },
            spawnWeight: { type: Type.NUMBER },
            ability: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                attackShape: { type: Type.STRING, enum: ATTACK_SHAPES },
                movementAction: { type: Type.STRING, enum: MOVEMENT_ACTIONS },
                damage: { type: Type.NUMBER },
                cooldownSeconds: { type: Type.NUMBER },
                range: { type: Type.NUMBER },
                areaOfEffect: { type: Type.NUMBER },
                durationSeconds: { type: Type.NUMBER },
                projectileSpeed: { type: Type.NUMBER },
                movementMultiplier: { type: Type.NUMBER },
                movementDistance: { type: Type.NUMBER },
                effectColor: { type: Type.STRING },
              },
              required: [
                "name",
                "description",
                "attackShape",
                "movementAction",
                "damage",
                "cooldownSeconds",
                "range",
                "areaOfEffect",
                "durationSeconds",
                "projectileSpeed",
                "movementMultiplier",
                "movementDistance",
                "effectColor",
              ],
            },
            sprite: {
              type: Type.OBJECT,
              properties: {
                palette: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      color: { type: Type.STRING },
                    },
                    required: ["key", "color"],
                  },
                },
                rows: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["palette", "rows"],
            },
          },
          required: [
            "name",
            "description",
            "maxHealth",
            "moveSpeed",
            "spawnWeight",
            "ability",
            "sprite",
          ],
        },
      },
    },
    required: ["theme", "archetypes"],
  };
}

function buildPrompt(waveNumber: number, previousNames: string[]): string {
  const minimumTypes = waveNumber === 1 ? 1 : 2;
  const maximumTypes = waveNumber === 1 ? 2 : MAX_ARCHETYPES;
  const previous = previousNames.length ? previousNames.join(", ") : "(none yet)";

  return [
    `Design wave ${waveNumber} for "Chaos Roll", a top-down arcade survival brawler.`,
    `Generate ${minimumTypes} to ${maximumTypes} distinct zombie archetypes in one response.`,
    `Previous zombie types were: ${previous}. Avoid near-duplicates and introduce a fresh threat when possible.`,
    ``,
    `There is no predefined zombie-ability bank. Invent each ability's name, description, numerical behavior, and art.`,
    `The engine executes the generated ability through composable primitives:`,
    `- attackShape: CONTACT, BOLT, CONE, or AURA`,
    `- movementAction: NONE, DASH, or BLINK`,
    `Combine those primitives with generated damage, range, duration, cooldown, movement multiplier, and movement distance.`,
    `Examples of what the grammar can express are a CONE flamethrower, a BLINK ambusher, a fast CONTACT runner, a DASH artillery zombie, or an AURA suppressor. Do not merely copy these examples.`,
    `spawnWeight controls the relative number of that archetype in the wave and should be between 1 and 5.`,
    `effectColor must be a readable six-digit hex color used for the ability's combat telegraph.`,
    `Keep each name under 28 characters and each description to one player-facing sentence.`,
    ``,
    `For every archetype, Gemini must also create its ${SPRITE_SIZE}x${SPRITE_SIZE} pixel-art character sprite:`,
    `- palette: 2 to 5 entries with single-character keys "1" through "5" and six-digit hex colors`,
    `- never define key "0"; it is reserved for transparency`,
    `- rows: exactly ${SPRITE_SIZE} strings of exactly ${SPRITE_SIZE} characters using "0" or palette keys`,
    `Use a bold, asymmetric zombie silhouette with visible traits matching its generated ability.`,
    `Keep the outer border mostly transparent and reserve the brightest color for its weapon, mutation, or energy source.`,
    `Return only the JSON object matching the provided schema.`,
  ].join("\n");
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function text(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "zombie";
}

function sanitizeAbility(raw: Partial<ZombieAbility> | undefined, waveNumber: number): ZombieAbility {
  const attackShape = ATTACK_SHAPES.includes(raw?.attackShape as ZombieAttackShape)
    ? (raw!.attackShape as ZombieAttackShape)
    : "CONTACT";
  const movementAction = MOVEMENT_ACTIONS.includes(raw?.movementAction as ZombieMovementAction)
    ? (raw!.movementAction as ZombieMovementAction)
    : "NONE";
  const maxDamage = Math.min(24, 6 + waveNumber * 0.9);

  const shapeRange: Record<ZombieAttackShape, [number, number]> = {
    CONTACT: [0.7, 1.35],
    BOLT: [2.5, 9],
    CONE: [1.5, 5],
    AURA: [0.9, 3.5],
  };
  const [minimumRange, maximumRange] = shapeRange[attackShape];

  return {
    name: text(raw?.name, "Nameless Mutation", 28),
    description: text(raw?.description, "Unleashes an unstable generated attack.", 120),
    attackShape,
    movementAction,
    damage: clamp(finiteNumber(raw?.damage, 4), 1, maxDamage),
    cooldownSeconds: clamp(finiteNumber(raw?.cooldownSeconds, 2.5), 0.8, 6),
    range: clamp(finiteNumber(raw?.range, minimumRange), minimumRange, maximumRange),
    areaOfEffect: clamp(finiteNumber(raw?.areaOfEffect, 1.2), 0.4, 4.5),
    durationSeconds: clamp(finiteNumber(raw?.durationSeconds, 0.35), 0.12, 2.5),
    projectileSpeed: clamp(finiteNumber(raw?.projectileSpeed, 8), 4, 18),
    movementMultiplier: clamp(finiteNumber(raw?.movementMultiplier, 1), 0.65, 2.6),
    movementDistance:
      movementAction === "NONE"
        ? 0
        : clamp(finiteNumber(raw?.movementDistance, 2), 0.75, 6),
    effectColor:
      typeof raw?.effectColor === "string" && HEX_COLOR.test(raw.effectColor)
        ? raw.effectColor.toLowerCase()
        : "#ff6b35",
  };
}

function fallbackSprite(waveNumber: number): SpriteData {
  const sprite = getFallbackSprite("ZOMBIE", tierForWave(waveNumber));
  if (!sprite) throw new Error("no fallback zombie sprite is available");
  return sprite;
}

function sanitizeArchetype(
  raw: RawZombieArchetype,
  waveNumber: number,
  index: number,
  sprite: SpriteData,
): ZombieArchetype {
  const name = text(raw.name, `Mutation ${index + 1}`, 28);
  const minimumHp = 24 + waveNumber * 4;
  const maximumHp = Math.min(220, 58 + waveNumber * 11);

  return {
    id: `${slug(name)}-${waveNumber}-${index}`,
    name,
    description: text(raw.description, "An unstable AI-generated zombie strain.", 120),
    maxHealth: Math.round(clamp(finiteNumber(raw.maxHealth, minimumHp), minimumHp, maximumHp)),
    moveSpeed: clamp(finiteNumber(raw.moveSpeed, 1.5), 0.75, Math.min(4.5, 3.4 + waveNumber * 0.08)),
    spawnWeight: clamp(finiteNumber(raw.spawnWeight, 1), 1, 5),
    ability: sanitizeAbility(raw.ability, waveNumber),
    sprite,
  };
}

function isRuntimeSprite(value: unknown): value is SpriteData {
  if (!value || typeof value !== "object") return false;
  const sprite = value as SpriteData;
  if (
    sprite.width !== SPRITE_SIZE ||
    sprite.height !== SPRITE_SIZE ||
    !sprite.palette ||
    !Array.isArray(sprite.pixels) ||
    sprite.pixels.length !== SPRITE_SIZE
  ) {
    return false;
  }

  return sprite.pixels.every(
    (row) =>
      Array.isArray(row) &&
      row.length === SPRITE_SIZE &&
      row.every((key) => typeof key === "string" && sprite.palette[key] !== undefined),
  );
}

function sanitizeLiveWave(raw: RawZombieWave, waveNumber: number): ZombieWavePlan {
  if (!Array.isArray(raw.archetypes) || raw.archetypes.length === 0) {
    throw new Error("Gemini returned no zombie archetypes");
  }

  const archetypes = raw.archetypes.slice(0, MAX_ARCHETYPES).map((entry, index) => {
    let sprite: SpriteData;
    try {
      sprite = validateSprite(entry.sprite ?? {});
    } catch (error) {
      console.warn(
        `[generateZombieWave] invalid sprite for archetype ${index + 1}; using the default zombie sprite:`,
        error instanceof Error ? error.message : error,
      );
      sprite = fallbackSprite(waveNumber);
    }
    return sanitizeArchetype(entry, waveNumber, index, sprite);
  });

  return {
    waveNumber,
    theme: text(raw.theme, `Mutation Wave ${waveNumber}`, 48),
    archetypes,
    source: "gemini",
  };
}

function readCache(waveNumber: number): ZombieWavePlan | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${waveNumber}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<ZombieWavePlan>;
    if (cached.waveNumber !== waveNumber || !Array.isArray(cached.archetypes) || cached.archetypes.length === 0) {
      return null;
    }

    const archetypes = cached.archetypes.slice(0, MAX_ARCHETYPES).map((entry, index) =>
      sanitizeArchetype(
        {
          name: entry.name,
          description: entry.description,
          maxHealth: entry.maxHealth,
          moveSpeed: entry.moveSpeed,
          spawnWeight: entry.spawnWeight,
          ability: entry.ability,
        },
        waveNumber,
        index,
        isRuntimeSprite(entry.sprite) ? entry.sprite : fallbackSprite(waveNumber),
      ),
    );

    return {
      waveNumber,
      theme: text(cached.theme, `Mutation Wave ${waveNumber}`, 48),
      archetypes,
      source: "cache",
    };
  } catch {
    return null;
  }
}

function writeCache(plan: ZombieWavePlan): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${plan.waveNumber}`, JSON.stringify(plan));
  } catch {
  }
}

export async function generateZombieWavePlan(
  waveNumber: number,
  previousArchetypeNames: string[] = [],
): Promise<ZombieWavePlan> {
  const safeWave = Math.max(1, Math.floor(waveNumber));
  const cached = readCache(safeWave);
  if (cached) {
    console.log(`[generateZombieWave] Requesting zombie roster for wave ${safeWave}`);
    return cached;
  }

  const { value: raw, valid } = await generateStructuredJSONWithRevision<RawZombieWave>(
    buildPrompt(safeWave, previousArchetypeNames),
    buildSchema(),
    (candidate) => {
      if (!Array.isArray(candidate.archetypes) || candidate.archetypes.length === 0) {
        throw new Error("response contained no zombie archetypes");
      }
      candidate.archetypes.forEach((entry, index) => {
        try {
          validateSprite(entry.sprite ?? {});
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`archetype ${index + 1} ("${entry.name ?? "unnamed"}") sprite invalid: ${message}`);
        }
      });
    },
  );

  if (!valid) {
    console.warn(
      `[generateZombieWave] wave ${safeWave} still had invalid archetypes after revision attempts — falling back to library sprites where needed`,
    );
  }

  const plan = sanitizeLiveWave(raw, safeWave);
  writeCache(plan);
  return plan;
}
